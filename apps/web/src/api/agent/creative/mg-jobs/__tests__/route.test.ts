import { shotlyxBattleCardFixture } from "@/shotlyx/remotion-components/fixtures/battle-card";
import { SMART_MG_COMPOSITION_STYLE_GUIDE } from "@/shotlyx/remotion-components/composition-prompt";
import {
	clearShotlyxMGJobs,
	createShotlyxMGJob,
	type GenerateShotlyxMGJobDocumentFn,
	subscribeShotlyxMGJob,
	type ShotlyxMGJobEvent,
	type ShotlyxMGJobInput,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isShotlyxMGJobEvent(value: unknown): value is ShotlyxMGJobEvent {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		typeof value.jobId === "string"
	);
}

async function readSSEJobEvents(response: Response): Promise<ShotlyxMGJobEvent[]> {
	const text = await response.text();
	return text
		.split("\n\n")
		.map((block) =>
			block
				.split("\n")
				.find((line) => line.startsWith("data: ")),
		)
		.filter((line): line is string => typeof line === "string")
		.map((line) => {
			const parsed: unknown = JSON.parse(line.slice("data: ".length));
			if (!isShotlyxMGJobEvent(parsed)) {
				throw new Error("Invalid SSE MG job event");
			}
			return parsed;
		});
}

async function withMissingLLMConfig<T>(fn: () => Promise<T>): Promise<T> {
	const keys = [
		"AGENT_MG_KEY",
		"AGENT_LLM_KEY",
		"SHOTLYX_DESKTOP",
		"VITE_SHOTLYX_DESKTOP",
	] as const;
	const previous = new Map<string, string | undefined>();
	for (const key of keys) {
		previous.set(key, process.env[key]);
		delete process.env[key];
	}
	try {
		return await fn();
	} finally {
		for (const key of keys) {
			const value = previous.get(key);
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

async function runCompletedMGJob({
	input,
	generateDocumentFn,
}: {
	input: ShotlyxMGJobInput;
	generateDocumentFn: GenerateShotlyxMGJobDocumentFn;
}): Promise<ShotlyxMGJobEvent[]> {
	const events: ShotlyxMGJobEvent[] = [];
	const { jobId } = createShotlyxMGJob({
		input,
		generateDocumentFn,
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
	return events;
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
			maxOutputTokens: 12_000,
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

	test("POST streams exact auto-template jobs without model config", async () => {
		await withMissingLLMConfig(async () => {
			const response = await POST(
				new ApiRequest("http://localhost/api/agent/creative/mg-jobs", {
					method: "POST",
					body: JSON.stringify({
						prompt:
							"标题大字展示：主标题「中国人口十年变局」，副标题 2015-2025",
						durationSeconds: 5,
						aspectRatio: "16:9",
						componentCount: 1,
						templateMode: "auto",
					}),
				}),
			);

			expect(response.status).toBe(200);
			const payload: unknown = await response.json();
			if (!isRecord(payload) || typeof payload.jobId !== "string") {
				throw new Error("Invalid MG job start response");
			}
			const { jobId } = payload;
			const eventsResponse = await GET(
				new ApiRequest(
					`http://localhost/api/agent/creative/mg-jobs/${jobId}/events`,
				),
				{
					params: Promise.resolve({ jobId }),
				},
			);

			expect(eventsResponse.status).toBe(200);
			expect(eventsResponse.headers.get("Content-Type")).toBe(
				"text/event-stream",
			);
			const events = await readSSEJobEvents(eventsResponse);

			expect(getCompletedDocumentNames({ events })).toEqual([
				"内置模板 · 标题大字展示",
			]);
			expect(
				events.some((event) => event.label?.includes("使用内置 MG 模板")),
			).toBe(true);
		});
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

	test("MG composition jobs do not auto-template pure visual effects", async () => {
		const calls: Array<{ prompt: string }> = [];
		const events: Array<{ label?: string; type?: string; documents?: unknown[] }> =
			[];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成一个数据雨和星星爆炸的纯视觉粒子 MG 动画，不出现文字",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 4,
				styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
				templateMode: "auto",
			},
			generateDocumentFn: async (args) => {
				calls.push({ prompt: args.prompt });
				return {
					...shotlyxBattleCardFixture,
					name: `自定义星星爆炸 ${calls.length}`,
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
			condition: () => events.some((event) => event.type === "completed"),
		});
		unsubscribe();

		const completed = events.find((event) => event.type === "completed");
		expect(calls).toHaveLength(0);
		expect(completed?.documents).toHaveLength(4);
		expect(
			events.some((event) => event.label?.includes("使用内置 MG 模板")),
		).toBe(false);
	});

	test("MG composition jobs complete star explosion as custom procedural Remotion without model calls", async () => {
		const events: Array<{ label?: string; type?: string; documents?: unknown[] }> =
			[];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成一个星星爆炸的 MG 特效动画，纯视觉，不出现文字，透明背景",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 4,
				styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
				templateMode: "auto",
				transparentBackground: true,
			},
			generateDocumentFn: async () => {
				throw new Error("model should not be called for star explosion");
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
					(event) => event.type === "completed" || event.type === "error",
				),
		});
		unsubscribe();

		const completed = events.find((event) => event.type === "completed");
		expect(completed?.documents).toHaveLength(4);
		const documents = completed?.documents ?? [];
		expect(
			documents.every((document) =>
				isRecord(document) &&
				typeof document.name === "string" &&
				document.name.includes("自定义特效 · 星星爆炸"),
			),
		).toBe(true);
		expect(
			events.some((event) => event.label?.includes("使用内置 MG 模板")),
		).toBe(false);
		expect(events.some((event) => event.type === "error")).toBe(false);
	});

	test.each([
		{
			prompt: "标题大字展示：主标题「中国人口十年变局」，副标题 2015-2025",
			expectedName: "内置模板 · 标题大字展示",
		},
		{
			prompt: "重点指标突出：GMV 120 万，增长 35%，用大数字计数动效展示",
			expectedName: "内置模板 · 重点指标突出",
		},
		{
			prompt: "圆圈方框标注：圈出 2022 年首次负增长，并用箭头标注原因",
			expectedName: "内置模板 · 圆圈方框标注",
		},
		{
			prompt: "数据表格图：列出 2024、2025、2026 三行数据和增长率",
			expectedName: "内置模板 · 数据表格图",
		},
	])(
		"MG composition jobs use templates only for exact template-fit requests: $expectedName",
		async ({ prompt, expectedName }) => {
			const calls: Array<{ prompt: string }> = [];
			const events = await runCompletedMGJob({
				input: {
					prompt,
					durationSeconds: 5,
					aspectRatio: "16:9",
					componentCount: 1,
					styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
					templateMode: "auto",
				},
				generateDocumentFn: async (args) => {
					calls.push({ prompt: args.prompt });
					throw new Error("model should not be needed for exact templates");
				},
			});

			expect(calls).toHaveLength(0);
			expect(getCompletedDocumentNames({ events })).toEqual([expectedName]);
			expect(
				events.some((event) => event.label?.includes("使用内置 MG 模板")),
			).toBe(true);
		},
	);

	test.each([
		"数据感科技开场，蓝色扫描线和网格空间，适合品牌片",
		"做一个三个步骤流程：上传、AI 分析、导出成片，用动态图形表现流程",
		"生成一个复杂产品发布 MG 动画，镜头推进、空间轨迹、闪光登场，不要标题文字",
		"介绍 AI Agent 运行原理，包含感知、思考、行动、工具调用和记忆",
		"Stable Diffusion 风格的星光粒子动画，透明背景，不出现文字",
	])("MG composition jobs keep low-confidence auto requests custom: %s", async (prompt) => {
		const calls: Array<{ prompt: string }> = [];
		const events = await runCompletedMGJob({
			input: {
				prompt,
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 3,
				styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
				templateMode: "auto",
			},
			generateDocumentFn: async (args) => {
				calls.push({ prompt: args.prompt });
				return {
					...shotlyxBattleCardFixture,
					name: `自定义 MG ${calls.length}`,
				};
			},
		});

		expect(calls).toHaveLength(3);
		expect(getCompletedDocumentNames({ events })).toEqual([
			"自定义 MG 1",
			"自定义 MG 2",
			"自定义 MG 3",
		]);
		expect(
			events.some((event) => event.label?.includes("使用内置 MG 模板")),
		).toBe(false);
	});

	test("MG composition jobs can use builtin templates without calling the model generator", async () => {
		const calls: Array<{ prompt: string }> = [];
		const events: Array<{ label?: string; type?: string; documents?: unknown[] }> =
			[];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成一个数据展示 MG，标题是 从 Vibe 到 Harness，突出 2026",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 2,
				templateMode: "auto",
			},
			generateDocumentFn: async (args) => {
				calls.push({ prompt: args.prompt });
				throw new Error("model should not be needed for covered templates");
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

		const completed = events.find((event) => event.type === "completed");
		expect(calls).toHaveLength(0);
		expect(completed?.documents).toHaveLength(2);
		expect(
			events.some((event) => event.label?.includes("使用内置 MG 模板")),
		).toBe(true);
	});

	test("MG composition jobs force a selected builtin template even when mode is auto", async () => {
		const calls: Array<{ prompt: string }> = [];
		const events: Array<{ label?: string; type?: string; documents?: unknown[] }> =
			[];
		const { jobId } = createShotlyxMGJob({
			input: {
				prompt: "生成标题大字展示，标题是 从 Vibe 到 Harness",
				durationSeconds: 5,
				aspectRatio: "16:9",
				componentCount: 1,
				templateMode: "auto",
				templateId: "metric-emphasis",
			},
			generateDocumentFn: async (args) => {
				calls.push({ prompt: args.prompt });
				throw new Error("model should not be called when template is forced");
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

		const completed = events.find((event) => event.type === "completed");
		const [document] = completed?.documents ?? [];
		expect(calls).toHaveLength(0);
		expect(document).toMatchObject({
			name: "内置模板 · 重点指标突出",
		});
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
