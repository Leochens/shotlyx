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
