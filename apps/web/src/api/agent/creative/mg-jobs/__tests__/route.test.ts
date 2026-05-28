import { shotlyxBattleCardFixture } from "@/shotlyx/remotion-components/fixtures/battle-card";
import {
	clearShotlyxMGJobs,
	createShotlyxMGJob,
	subscribeShotlyxMGJob,
} from "@/shotlyx/remotion-components/jobs";
import { beforeEach, describe, expect, test } from "bun:test";
import { ApiRequest } from "@/platform/http";
import { GET } from "../[jobId]/events/route";
import { DELETE } from "../[jobId]/route";
import { POST, shotlyxMGJobRequestSchema } from "../route";

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

function getCompletedDocumentNames({
	events,
}: {
	events: unknown[];
}): string[] {
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
			new ApiRequest("http://localhost/api/agent/creative/mg-jobs", {
				method: "POST",
				body: JSON.stringify({ prompt: "" }),
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "Invalid input" });
	});

	test("request schema accepts more than five MG components", () => {
		const parsed = shotlyxMGJobRequestSchema.safeParse({
			prompt: "生成 8 个连续标注 MG",
			componentCount: 8,
		});

		expect(parsed.success).toBe(true);
	});

	test("GET returns 404 for an unknown job", async () => {
		const response = await GET(
			new ApiRequest(
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
			new ApiRequest(
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

	test("MG composition jobs pass smart MG guidance into component generation", async () => {
		const calls: Array<{ prompt: string; styleGuide?: string }> = [];
		const events: unknown[] = [];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成近十年中国人口变化折线图",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 2,
			},
			generateDocumentFn: async (args) => {
				calls.push({
					prompt: args.prompt,
					styleGuide: args.styleGuide,
				});
				return {
					...shotlyxBattleCardFixture,
					name: `组件 ${calls.length}`,
				};
			},
		});
		const unsubscribe = subscribeShotlyxMGJob({
			jobId,
			onEvent: (event) => {
				events.push(event);
			},
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

		expect(calls).toHaveLength(2);
		expect(calls[0]?.styleGuide).toContain("Remotion 视频图形包装风格");
		expect(calls[0]?.prompt).toContain(
			"只允许使用 Remotion / Shotlyx Component",
		);
		expect(calls[0]?.prompt).toContain("所有业务文字、数值、表格行");
		expect(calls[0]?.prompt).toContain("不能保留");
		expect(calls[0]?.prompt).toContain("像高质量视频图形包装");
	});

	test("MG composition jobs repair malformed JSON output with specific guidance", async () => {
		const calls: Array<{ prompt: string }> = [];
		const events: Array<{ label?: string; type?: string }> = [];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成一个标题展示 MG",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 1,
			},
			generateDocumentFn: async (args) => {
				calls.push({ prompt: args.prompt });
				if (calls.length === 1) {
					throw new Error(
						"模型返回的 Remotion JSON 解析失败：Unterminated string in JSON at position 5758. componentSource 字符串需要 JSON 转义。",
					);
				}
				return shotlyxBattleCardFixture;
			},
		});
		const unsubscribe = subscribeShotlyxMGJob({
			jobId,
			onEvent: (event) => {
				events.push(event);
			},
		});

		await waitForCondition({
			condition: () => events.some((event) => event.type === "completed"),
		});
		unsubscribe();

		expect(calls).toHaveLength(2);
		expect(calls[1]?.prompt).toContain("componentSource");
		expect(calls[1]?.prompt).toContain("JSON.stringify");
		expect(
			events.some((event) => event.label?.includes("正在修复具体错误")),
		).toBe(true);
	});

	test("DELETE returns 404 for an unknown job", async () => {
		const response = await DELETE(
			new ApiRequest("http://localhost/api/agent/creative/mg-jobs/missing"),
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
