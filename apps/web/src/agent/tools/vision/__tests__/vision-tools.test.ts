import { describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { buildVisionTools } from "../vision-tools";

function createEditorWithAssets(assets: MediaAsset[]) {
	return {
		media: {
			getAssets: () => assets,
		},
		selection: {
			getSelectedElements: () => [],
		},
		timeline: {
			getElementsWithTracks: () => [],
		},
	};
}

function createSseResponse(events: unknown[]): Response {
	const body =
		events
			.map((event) =>
				typeof event === "string" ? `data: ${event}` : `data: ${JSON.stringify(event)}`,
			)
			.join("\n\n") + "\n\n";
	return new Response(body, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("vision analysis tools", () => {
	test("builds a video understanding tool for Agent visual analysis", () => {
		const tools = buildVisionTools({
			editor: createEditorWithAssets([]),
			deps: {
				fetchFn: mock(() => Promise.resolve(new Response())),
				readFileAsDataUrl: mock(() => Promise.resolve("data:video/mp4;base64,AA==")),
			},
		});

		const tool = tools.find((item) => item.name === "vision_analyze_media");

		expect(tool).toBeDefined();
		expect(tool?.description).toContain("视频内容");
		expect(tool?.parameters.mediaAssetId).toBeDefined();
	});

	test("sends the selected media asset to the vision analysis API", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.mp4",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const fetchFn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/vision/analyze");
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({
				analysisType: "editing_suggestions",
				prompt: "给出剪辑建议",
				media: {
					mediaAssetId: "media-1",
					name: "demo.mp4",
					type: "video",
					mimeType: "video/mp4",
					dataUrl: "data:video/mp4;base64,AA==",
					durationSeconds: 12,
					width: 1920,
					height: 1080,
				},
			});
			return Response.json({
				model: "MiniMax-M3",
				analysis: "建议保留开头动作，并在 8 秒处切到特写。",
			});
		});
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		const result = await tool.handler({
			mediaAssetId: "media-1",
			analysisType: "editing_suggestions",
			prompt: "给出剪辑建议",
		});

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			model: "MiniMax-M3",
			analysis: "建议保留开头动作，并在 8 秒处切到特写。",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("normalizes generic octet-stream video data URLs before analysis", async () => {
		const file = new File(["demo"], "demo.mp4", {
			type: "application/octet-stream",
		});
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.mp4",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const fetchFn = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.media).toMatchObject({
				mimeType: "video/mp4",
				dataUrl: "data:video/mp4;base64,AA==",
			});
			return Response.json({
				model: "MiniMax-M3",
				analysis: "可以正常分析。",
			});
		});
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:application/octet-stream;base64,AA=="),
				),
			},
		});

		await tool.handler({
			mediaAssetId: "media-1",
			analysisType: "editing_suggestions",
		});

		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("uses a sampled storyboard instead of sending oversized videos to MiniMax", async () => {
		const file = new File(["demo"], "large.mp4", { type: "video/mp4" });
		Object.defineProperty(file, "size", {
			value: 52_428_801,
			configurable: true,
		});
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "large.mp4",
				type: "video",
				duration: 120,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const fetchFn = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.prompt).toContain("原视频超过 MiniMax M3 的 50MiB 媒体限制");
			expect(body.media).toMatchObject({
				mediaAssetId: "media-1",
				name: "large.mp4 storyboard.jpg",
				type: "image",
				mimeType: "image/jpeg",
				dataUrl: "data:image/jpeg;base64,STORYBOARD",
				durationSeconds: 120,
				width: 1200,
				height: 675,
			});
			return createSseResponse([
				{ type: "content_delta", text: "基于抽帧预览，建议保留开头。" },
				{
					type: "done",
					analysis: "基于抽帧预览，建议保留开头。",
				},
				"[DONE]",
			]);
		});
		const progressEvents: Array<{ stage: string; label: string; status: string }> =
			[];
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() => {
					throw new Error("should not read oversized video as data URL");
				}),
				createVideoStoryboardDataUrl: mock(() =>
					Promise.resolve({
						dataUrl: "data:image/jpeg;base64,STORYBOARD",
						mimeType: "image/jpeg",
						frameCount: 8,
						width: 1200,
						height: 675,
					}),
				),
			},
		});

		const result = await tool.handler(
			{ mediaAssetId: "media-1", analysisType: "editing_suggestions" },
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			analysis: "基于抽帧预览，建议保留开头。",
		});
		expect(progressEvents).toContainEqual(
			expect.objectContaining({
				stage: "vision-prepare",
				label: "视频较大，正在生成抽帧预览",
				status: "running",
			}),
		);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("emits progress while preparing and waiting for MiniMax M3 analysis", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.mp4",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const progressEvents: Array<{
			stage: string;
			label: string;
			status: string;
			current?: number;
			total?: number;
		}> = [];
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn: mock(() =>
					Promise.resolve(
						Response.json({
							model: "MiniMax-M3",
							analysis: "画面主体清楚，建议剪短中段停顿。",
						}),
					),
				),
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		await tool.handler(
			{ mediaAssetId: "media-1", analysisType: "editing_suggestions" },
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(progressEvents).toEqual([
			{
				stage: "vision-prepare",
				label: "正在读取媒体文件",
				status: "running",
				current: 1,
				total: 4,
			},
			{
				stage: "vision-provider",
				label: "正在请求 MiniMax M3 视觉分析",
				status: "running",
				current: 2,
				total: 4,
			},
			{
				stage: "vision-provider",
				label: "MiniMax M3 正在理解视频画面",
				status: "running",
				current: 3,
				total: 4,
			},
			{
				stage: "vision-provider",
				label: "视觉分析已完成",
				status: "success",
				current: 4,
				total: 4,
			},
		]);
	});

	test("streams MiniMax M3 reasoning and content into progress details", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.mp4",
				type: "video",
				duration: 12,
				width: 1920,
				height: 1080,
				file,
			},
		]);
		const progressEvents: Array<{
			stage: string;
			label: string;
			status: string;
			detail?: string;
			current?: number;
			total?: number;
		}> = [];
		const fetchFn = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			expect(body.stream).toBe(true);
			return createSseResponse([
				{ type: "reasoning_delta", text: "先看画面主体。" },
				{ type: "content_delta", text: "建议保留开场动作，" },
				{ type: "content_delta", text: "删除中段停顿。" },
				{
					type: "done",
					provider: "minimax",
					model: "MiniMax-M3",
					analysisType: "editing_suggestions",
					analysis: "建议保留开场动作，删除中段停顿。",
				},
				"[DONE]",
			]);
		});
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		const result = await tool.handler(
			{ mediaAssetId: "media-1", analysisType: "editing_suggestions" },
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			analysis: "建议保留开场动作，删除中段停顿。",
		});
		expect(progressEvents).toContainEqual({
			stage: "vision-reasoning",
			label: "MiniMax M3 正在思考画面内容",
			status: "running",
			detail: "先看画面主体。",
			current: 3,
			total: 4,
		});
		expect(progressEvents).toContainEqual({
			stage: "vision-output",
			label: "MiniMax M3 正在输出分析结果",
			status: "running",
			detail: "建议保留开场动作，删除中段停顿。",
			current: 3,
			total: 4,
		});
	});
});
