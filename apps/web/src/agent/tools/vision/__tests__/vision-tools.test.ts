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
				typeof event === "string"
					? `data: ${event}`
					: `data: ${JSON.stringify(event)}`,
			)
			.join("\n\n") + "\n\n";
	return new Response(body, {
		headers: { "Content-Type": "text/event-stream" },
	});
}

function getHeaderValue({
	headers,
	key,
}: {
	headers: RequestInit["headers"] | undefined;
	key: string;
}): string | null {
	if (!headers) return null;
	return new Headers(headers).get(key);
}

function getBinaryVisionPayload(input: RequestInfo | URL): Record<string, unknown> {
	const url = new URL(String(input), "http://localhost");
	expect(url.pathname).toBe("/api/agent/vision/analyze");
	const payload = url.searchParams.get("payload");
	expect(payload).toBeTruthy();
	return JSON.parse(payload ?? "{}");
}

function getJsonVisionPayload(init: RequestInit | undefined): Record<string, unknown> {
	expect(getHeaderValue({ headers: init?.headers, key: "Content-Type" })).toBe(
		"application/json",
	);
	return JSON.parse(String(init?.body));
}

function expectBinaryVideoBody(init: RequestInit | undefined): File {
	expect(init?.body).toBeInstanceOf(File);
	if (!(init?.body instanceof File)) {
		throw new Error("Expected request body to be a File");
	}
	return init.body;
}

describe("vision analysis tools", () => {
	test("builds a video understanding tool for Agent visual analysis", () => {
		const tools = buildVisionTools({
			editor: createEditorWithAssets([]),
			deps: {
				fetchFn: mock(() => Promise.resolve(new Response())),
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		const tool = tools.find((item) => item.name === "vision_analyze_media");

		expect(tool).toBeDefined();
		expect(tool?.description).toContain("视频内容");
		expect(tool?.parameters.mediaAssetId).toBeDefined();
	});

	test("rejects generic video understanding so the semantic index is reused", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const fetchFn = mock(() => Promise.resolve(Response.json({})));
		const [tool] = buildVisionTools({
			editor: createEditorWithAssets([
				{
					id: "media-1",
					name: "demo.mp4",
					type: "video",
					duration: 12,
					width: 1920,
					height: 1080,
					file,
				},
			]),
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:video/mp4;base64,AA=="),
				),
			},
		});

		await expect(
			tool.handler({
				mediaAssetId: "media-1",
				analysisType: "visual_summary",
				prompt: "分析这个视频的画面内容",
			}),
		).rejects.toThrow(
			"视频素材的内容理解和剪辑建议请使用 video_semantic_index_analyze 或 video_semantic_index_get",
		);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	test("sends video quality-check assets to the vision analysis API as binary files", async () => {
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
		const fetchFn = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const uploadedFile = expectBinaryVideoBody(init);
				expect(uploadedFile.name).toBe("demo.mp4");
				expect(uploadedFile.type).toBe("video/mp4");
				expect(uploadedFile.size).toBe(file.size);
				expect(getHeaderValue({ headers: init?.headers, key: "Content-Type" }))
					.toBe("video/mp4");
				const body = getBinaryVisionPayload(input);
				expect(body.stream).toBe(false);
				expect(body).toMatchObject({
					analysisType: "quality_check",
					prompt: "检查画面质量",
					media: {
						mediaAssetId: "media-1",
						name: "demo.mp4",
						type: "video",
						mimeType: "video/mp4",
						durationSeconds: 12,
						width: 1920,
						height: 1080,
					},
				});
				return Response.json({
					model: "MiniMax-M3",
					analysis: "建议保留开头动作，并在 8 秒处切到特写。",
				});
			},
		);
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() => {
					throw new Error("video files should not be converted to data URLs");
				}),
			},
		});

		const result = await tool.handler({
			mediaAssetId: "media-1",
			analysisType: "quality_check",
			prompt: "检查画面质量",
		});

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			model: "MiniMax-M3",
			analysis: "建议保留开头动作，并在 8 秒处切到特写。",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("normalizes generic octet-stream video MIME before binary analysis", async () => {
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
		const fetchFn = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const uploadedFile = expectBinaryVideoBody(init);
				expect(uploadedFile.name).toBe("demo.mp4");
				expect(getHeaderValue({ headers: init?.headers, key: "Content-Type" }))
					.toBe("video/mp4");
				const body = getBinaryVisionPayload(input);
				expect(body.media).toMatchObject({
					mimeType: "video/mp4",
				});
				expect(body.media).not.toHaveProperty("dataUrl");
				return Response.json({
					model: "MiniMax-M3",
					analysis: "可以正常分析。",
				});
			},
		);
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() => {
					throw new Error("video files should not be converted to data URLs");
				}),
			},
		});

		await tool.handler({
			mediaAssetId: "media-1",
			analysisType: "quality_check",
		});

		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("sends videos larger than the old data-url limit as binary files", async () => {
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
		const fetchFn = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const uploadedFile = expectBinaryVideoBody(init);
				expect(uploadedFile.name).toBe("large.mp4");
				const body = getBinaryVisionPayload(input);
				expect(body.media).toMatchObject({
					mediaAssetId: "media-1",
					name: "large.mp4",
					type: "video",
					mimeType: "video/mp4",
				});
				expect(body.media).not.toHaveProperty("dataUrl");
				return Response.json({
					model: "MiniMax-M3",
					analysis: "大视频也走 MiniMax 文件上传。",
				});
			},
		);
		const progressEvents: Array<{
			stage: string;
			label: string;
			status: string;
		}> = [];
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() => {
					throw new Error("should not read oversized video as data URL");
				}),
			},
		});

		const result = await tool.handler(
			{ mediaAssetId: "media-1", analysisType: "quality_check" },
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			mediaAssetId: "media-1",
			model: "MiniMax-M3",
			analysis: "大视频也走 MiniMax 文件上传。",
		});
		expect(progressEvents).toContainEqual(
			expect.objectContaining({
				stage: "vision-provider",
				label: "正在请求 MiniMax M3 视觉分析",
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
			{ mediaAssetId: "media-1", analysisType: "quality_check" },
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

	test("streams MiniMax M3 reasoning and content into progress details for images", async () => {
		const file = new File(["demo"], "demo.png", { type: "image/png" });
		const editor = createEditorWithAssets([
			{
				id: "media-1",
				name: "demo.png",
				type: "image",
				width: 1024,
				height: 768,
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
		const fetchFn = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("/api/agent/vision/analyze");
				const body = getJsonVisionPayload(init);
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
			},
		);
		const [tool] = buildVisionTools({
			editor,
			deps: {
				fetchFn,
				readFileAsDataUrl: mock(() =>
					Promise.resolve("data:image/png;base64,AA=="),
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
