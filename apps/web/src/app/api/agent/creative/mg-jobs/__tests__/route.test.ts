import { shotlyxBattleCardFixture } from "@/shotlyx/remotion-components/fixtures/battle-card";
import {
	clearShotlyxMGJobs,
	createShotlyxMGJob,
	subscribeShotlyxMGJob,
} from "@/shotlyx/remotion-components/jobs";
import { beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "../[jobId]/events/route";
import { DELETE } from "../[jobId]/route";
import { POST } from "../route";

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

async function waitForCondition({
	condition,
	timeoutMs = 2000,
}: {
	condition: () => boolean;
	timeoutMs?: number;
}): Promise<void> {
	const startedAt = Date.now();
	while (!condition()) {
		if (Date.now() - startedAt > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function getCompletedDocumentNames({ events }: { events: unknown[] }): string[] {
	const completed = events.find(
		(event) =>
			typeof event === "object" &&
			event !== null &&
			"type" in event &&
			event.type === "completed",
	);
	if (typeof completed !== "object" || completed === null) return [];
	const documents = Reflect.get(completed, "documents");
	if (!Array.isArray(documents)) return [];
	return documents
		.map((document) =>
			typeof document === "object" && document !== null
				? Reflect.get(document, "name")
				: null,
		)
		.filter((name): name is string => typeof name === "string");
}

describe("Shotlyx MG job routes", () => {
	beforeEach(() => {
		clearShotlyxMGJobs();
	});

	test("POST rejects invalid input before starting a job", async () => {
		const response = await POST(
			new NextRequest("http://localhost/api/agent/creative/mg-jobs", {
				method: "POST",
				body: JSON.stringify({ prompt: "" }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "Invalid input" });
	});

	test("GET returns 404 for an unknown job", async () => {
		const response = await GET(
			new NextRequest(
				"http://localhost/api/agent/creative/mg-jobs/missing/events",
			),
			{
				params: Promise.resolve({ jobId: "missing" }),
			},
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			error: "Shotlyx MG job not found",
		});
	});

	test("GET streams an existing job", async () => {
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成一个 AI Agent 运行原理 MG job",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 1,
			},
			generateDocumentFn: async () => shotlyxBattleCardFixture,
		});
		const events: Array<{ label?: string; detail?: string }> = [];
		const unsubscribe = subscribeShotlyxMGJob({
			jobId,
			onEvent: (event) => {
				events.push(event);
			},
		});
		unsubscribe();

		const response = await GET(
			new NextRequest(
				`http://localhost/api/agent/creative/mg-jobs/${jobId}/events`,
			),
			{
				params: Promise.resolve({ jobId }),
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(
			events.some((event) => event.label === "已加载 Remotion Skill"),
		).toBe(true);
		expect(
			events.some((event) => event.label === "已规划 MG Director 分镜"),
		).toBe(true);
		expect(
			events.some((event) => event.detail?.includes("remotion-dev/skills")),
		).toBe(true);
		await response.body?.cancel();
	});

	test("MG composition jobs start component work in parallel and publish a completed result barrier", async () => {
		const deferreds = [0, 1, 2].map(() =>
			createDeferred<typeof shotlyxBattleCardFixture>(),
		);
		const startedIndexes: number[] = [];
		const events: unknown[] = [];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "并行生成三个品牌讲解 MG 层",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 3,
			},
			generateDocumentFn: async () => {
				const index = startedIndexes.length;
				startedIndexes.push(index);
				return deferreds[index]!.promise;
			},
		});
		const unsubscribe = subscribeShotlyxMGJob({
			jobId,
			onEvent: (event) => {
				events.push(event);
			},
		});

		await flushMicrotasks();

		expect(startedIndexes).toEqual([0, 1, 2]);

		deferreds[2]!.resolve({
			...shotlyxBattleCardFixture,
			name: "组件 3",
		});
		deferreds[0]!.resolve({
			...shotlyxBattleCardFixture,
			name: "组件 1",
		});
		deferreds[1]!.resolve({
			...shotlyxBattleCardFixture,
			name: "组件 2",
		});

		await waitForCondition({
			condition: () =>
				events.some(
					(event) =>
						typeof event === "object" &&
						event !== null &&
						"type" in event &&
						event.type === "completed",
				),
		});
		unsubscribe();

		expect(getCompletedDocumentNames({ events })).toEqual([
			"组件 1",
			"组件 2",
			"组件 3",
		]);
	});

	test("DELETE returns 404 for an unknown job", async () => {
		const response = await DELETE(
			new NextRequest("http://localhost/api/agent/creative/mg-jobs/missing"),
			{
				params: Promise.resolve({ jobId: "missing" }),
			},
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			error: "Shotlyx MG job not found",
		});
	});
});
