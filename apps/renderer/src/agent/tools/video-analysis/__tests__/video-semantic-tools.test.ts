import { describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { buildVideoSemanticTools } from "../video-semantic-tools";
import type { VideoAssetInspection } from "@/video-analysis";

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

function buildInspection({
	keyframes = [
		{
			id: "keyframe_001_001",
			shotId: "shot_001",
			time: 6,
			imagePath: "/tmp/shotlyx/keyframe_001_001.jpg",
		},
	],
	profileOverrides = {},
	videoId,
}: {
	keyframes?: VideoAssetInspection["keyframes"];
	profileOverrides?: Partial<VideoAssetInspection["profile"]>;
	videoId: string;
}): VideoAssetInspection {
	return {
		videoId,
		profile: {
			videoId,
			duration: 12,
			fps: 30,
			width: 1280,
			height: 720,
			aspectRatio: "16:9",
			hasAudio: true,
			speechRatio: 0.7,
			silenceRatio: 0.3,
			motionLevel: "medium",
			sceneChangeDensity: 5,
			contentTypeGuess: "product_demo",
			...profileOverrides,
		},
		shots: [
			{
				id: "shot_001",
				start: 0,
				end: 12,
				duration: 12,
				method: "ffmpeg_scene",
			},
		],
		keyframes,
		analysisMeta: {
			createdAt: "2026-06-03T00:00:00.000Z",
			modelUsed: ["ffprobe", "ffmpeg"],
			analysisLevel: "standard",
		},
	};
}

describe("video semantic index tools", () => {
	test("uses ASR-only semantics for rough cuts with meaningful transcript", async () => {
		const asset: MediaAsset = {
			id: "media-asr",
			name: "asr.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file: new File(["demo"], "asr.mp4", { type: "video/mp4" }),
		};
		const inspectVideoAsset = mock(async () =>
			buildInspection({ videoId: "media-asr" }),
		);
		const analyzeVisualMedia = mock(async () => ({
			globalSummary: "不应该调用视觉分析。",
			shots: [],
		}));
		const transcribeVideoAsset = mock(async () => ({
			modelUsed: "volcengine-asr",
			transcript: [
				{
					start: 0,
					end: 4,
					text: "这是一段有旁白的产品介绍。",
				},
			],
		}));
		const progressEvents: Array<{ label: string; stage: string }> = [];
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				analyzeVisualMedia,
				inspectVideoAsset,
				transcribeVideoAsset,
			},
		});

		const result = await tool.handler(
			{
				analysisLevel: "standard",
				intent: "auto_edit",
				mediaAssetId: "media-asr",
			},
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			analysisStrategy: {
				transcript: "used",
				visual: "skipped_asr_semantic",
			},
			index: {
				globalSummary: "视频语音内容：这是一段有旁白的产品介绍。",
				shots: [
					{
						transcript: "这是一段有旁白的产品介绍。",
					},
				],
			},
		});
		expect(progressEvents).toContainEqual(
			expect.objectContaining({
				stage: "semantic-transcript",
				label: "正在通过 ASR 定位语义片段",
			}),
		);
		expect(progressEvents).toContainEqual(
			expect.objectContaining({
				stage: "semantic-vision",
				label: "ASR 已提供语义，跳过视频理解上传",
			}),
		);
		expect(analyzeVisualMedia).not.toHaveBeenCalled();
		expect(transcribeVideoAsset).toHaveBeenCalledTimes(1);
	});

	test("uses focused ASR text before visual analysis for fine-cut ranges", async () => {
		const asset: MediaAsset = {
			id: "media-focused-asr",
			name: "focused-asr.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file: new File(["demo"], "focused-asr.mp4", { type: "video/mp4" }),
		};
		const inspectVideoAsset = mock(async () =>
			buildInspection({ videoId: "media-focused-asr" }),
		);
		const analyzeVisualMedia = mock(async () => ({
			globalSummary: "不应该调用视觉分析。",
			shots: [],
		}));
		const transcribeVideoAsset = mock(async () => ({
			modelUsed: "volcengine-asr",
			transcript: [
				{
					start: 1,
					end: 4,
					text: "这个片段讲到了自动字幕入口。",
				},
				{
					start: 8,
					end: 10,
					text: "结尾介绍导出。",
				},
			],
		}));
		const progressEvents: Array<{ label: string; stage: string }> = [];
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				analyzeVisualMedia,
				inspectVideoAsset,
				transcribeVideoAsset,
			},
		});

		const result = await tool.handler(
			{
				analysisLevel: "standard",
				focusHint: "0:01-0:04",
				intent: "summarize",
				mediaAssetId: "media-focused-asr",
			},
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			analysisStrategy: {
				transcript: "used",
				visual: "skipped_focused_asr_semantic",
			},
			focusHint: "0:01-0:04",
			index: {
				globalSummary: "视频语音内容：这个片段讲到了自动字幕入口。",
			},
		});
		expect(progressEvents).toContainEqual(
			expect.objectContaining({
				stage: "semantic-vision",
				label: "ASR 已覆盖片段，跳过视频理解上传",
			}),
		);
		expect(analyzeVisualMedia).not.toHaveBeenCalled();
	});

	test("uses keyframe visual analysis when audio has no semantic transcript", async () => {
		const asset: MediaAsset = {
			id: "media-bgm",
			name: "bgm.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file: new File(["demo"], "bgm.mp4", { type: "video/mp4" }),
		};
		const inspectVideoAsset = mock(async () =>
			buildInspection({
				profileOverrides: {
					speechRatio: 0,
					silenceRatio: 0,
				},
				videoId: "media-bgm",
			}),
		);
		const analyzeVisualMedia = mock(async ({ visualMode }) => {
			expect(visualMode).toBe("keyframes");
			return {
				globalSummary: "这是一段只有 BGM 的产品演示。",
				modelUsed: "MiniMax-M3",
				shots: [
					{
						shotId: "shot_001",
						visualSummary: "画面展示产品界面切换。",
						sceneType: "product_demo" as const,
					},
				],
			};
		});
		const transcribeVideoAsset = mock(async () => ({
			modelUsed: "volcengine-asr",
			transcript: [],
		}));
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				analyzeVisualMedia,
				inspectVideoAsset,
				transcribeVideoAsset,
			},
		});

		const result = await tool.handler({
			analysisLevel: "standard",
			intent: "summarize",
			mediaAssetId: "media-bgm",
		});

		expect(result).toMatchObject({
			analysisStrategy: {
				transcript: "empty",
				visual: "used_keyframes_no_speech_semantics",
			},
			index: {
				globalSummary: "这是一段只有 BGM 的产品演示。",
			},
		});
		expect(analyzeVisualMedia).toHaveBeenCalledTimes(1);
	});

	test("falls back to full-video understanding only when keyframes are unavailable", async () => {
		const asset: MediaAsset = {
			id: "media-no-keyframes",
			name: "silent.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file: new File(["demo"], "silent.mp4", { type: "video/mp4" }),
		};
		const inspectVideoAsset = mock(async () =>
			buildInspection({
				keyframes: [],
				profileOverrides: {
					hasAudio: false,
					speechRatio: 0,
					silenceRatio: 1,
				},
				videoId: "media-no-keyframes",
			}),
		);
		const analyzeVisualMedia = mock(async ({ visualMode }) => {
			expect(visualMode).toBe("full_video_fallback");
			return {
				globalSummary: "只能通过整段视频兜底理解。",
				modelUsed: "MiniMax-M3",
				shots: [],
			};
		});
		const transcribeVideoAsset = mock(async () => ({
			modelUsed: "volcengine-asr",
			transcript: [],
		}));
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				analyzeVisualMedia,
				inspectVideoAsset,
				transcribeVideoAsset,
			},
		});

		const result = await tool.handler({
			analysisLevel: "standard",
			intent: "summarize",
			mediaAssetId: "media-no-keyframes",
		});

		expect(result).toMatchObject({
			analysisStrategy: {
				transcript: "skipped_no_audio",
				visual: "used_full_video_fallback_no_keyframes",
			},
			index: {
				globalSummary: "只能通过整段视频兜底理解。",
			},
		});
		expect(transcribeVideoAsset).not.toHaveBeenCalled();
		expect(analyzeVisualMedia).toHaveBeenCalledTimes(1);
	});

	test("default focused pipeline calls desktop inspection, keyframe VLM, and ASR routes", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const asset: MediaAsset = {
			id: "media-default",
			name: "demo.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file,
		};
		const fetchFn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input), "http://localhost");
			if (url.pathname === "/api/desktop/media/analyze") {
				return Response.json(buildInspection({ videoId: "media-default" }));
			}
			if (url.pathname === "/api/desktop/media/keyframe") {
				return Response.json({
					dataUrl: "data:image/jpeg;base64,a2V5ZnJhbWU=",
					mimeType: "image/jpeg",
					name: "keyframe_001_001.jpg",
				});
			}
			if (url.pathname === "/api/agent/vision/analyze") {
				expect(url.searchParams.get("payload")).toBeNull();
				const payload = JSON.parse(String(init?.body));
				expect(payload.prompt).toContain("Video Semantic Index");
				expect(payload.prompt).toContain("shot_001");
				expect(payload.prompt).toContain("只看 5-8 秒中段");
				expect(payload.prompt).toContain("当前不是整段视频理解，而是抽帧判断");
				expect(payload.media).toMatchObject({
					dataUrl: "data:image/jpeg;base64,a2V5ZnJhbWU=",
					type: "image",
				});
				expect(payload.prompt).toContain('"globalSummary"');
				expect(payload.prompt).toContain('"shots"');
				return Response.json({
					analysis: JSON.stringify({
						globalSummary: "这是一个产品演示视频。",
						shots: [
							{
								actions: ["展示功能入口"],
								editSuggestions: ["适合加箭头标注"],
								sceneType: "product_demo",
								shotId: "shot_001",
								visualSummary: "用户展示自动字幕入口。",
							},
						],
					}),
					model: "MiniMax-M3",
				});
			}
			if (url.pathname === "/api/desktop/media/transcript") {
				return Response.json({
					modelUsed: "volcengine:bigmodel",
					transcript: [
						{
							start: 0,
							end: 3,
							text: "欢迎使用自动字幕。",
						},
					],
				});
			}
			throw new Error(`Unexpected fetch: ${url.pathname}`);
		});
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: { fetchFn },
		});
		expect(tool.parameters.focusHint).toBeDefined();
		const progressEvents: Array<{ label: string; stage: string }> = [];

		const result = await tool.handler(
			{
				analysisLevel: "standard",
				focusHint: "只看 5-8 秒中段",
				intent: "summarize",
				mediaAssetId: "media-default",
			},
			{ onProgress: (event) => progressEvents.push(event) },
		);

		expect(result).toMatchObject({
			analysisStrategy: {
				transcript: "used",
				visual: "used_keyframes_focus_hint",
			},
			focusHint: "只看 5-8 秒中段",
			agentViews: {
				caption: {
					transcriptText: "欢迎使用自动字幕。",
				},
				summary: {
					assetType: "product_demo",
				},
			},
			index: {
				globalSummary: "这是一个产品演示视频。",
				shots: [
					{
						transcript: "欢迎使用自动字幕。",
						visualSummary: "用户展示自动字幕入口。",
					},
				],
			},
		});
		expect(progressEvents[0]).toMatchObject({
			stage: "semantic-inspection",
			label: "正在按镜头片段体检视频并切分镜头",
		});
		expect(progressEvents[1]).toMatchObject({
			stage: "semantic-transcript",
			label: "正在通过 ASR 定位语义片段",
		});
		expect(progressEvents[2]).toMatchObject({
			stage: "semantic-vision",
			label: "正在用关键帧判断必要画面内容",
		});
		expect(fetchFn).toHaveBeenCalledTimes(4);
	});

	test("analyzes a selected video into a cached semantic index", async () => {
		const file = new File(["demo"], "demo.mp4", { type: "video/mp4" });
		const asset: MediaAsset = {
			id: "media-1",
			name: "demo.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file,
		};
		const inspectVideoAsset = mock(async () =>
			buildInspection({ videoId: "media-1" }),
		);
		const analyzeVisualMedia = mock(async () => ({
			globalSummary: "不应该调用视觉分析。",
			shots: [],
		}));
		const transcribeVideoAsset = mock(async () => ({
			transcript: [
				{
					start: 0.5,
					end: 5,
					text: "我们来看自动字幕功能。",
				},
			],
			modelUsed: "volcengine-asr",
		}));
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				analyzeVisualMedia,
				inspectVideoAsset,
				transcribeVideoAsset,
			},
		});

		const first = await tool.handler({
			mediaAssetId: "media-1",
			intent: "summarize",
			analysisLevel: "standard",
		});
		const second = await tool.handler({
			mediaAssetId: "media-1",
			intent: "summarize",
			analysisLevel: "standard",
		});

		expect(first).toMatchObject({
			agentViews: {
				editing: {
					keep: [
						{
							segmentId: "sem_001",
						},
					],
				},
			},
			mediaAssetId: "media-1",
			cached: false,
			analysisStrategy: {
				transcript: "used",
				visual: "skipped_asr_semantic",
			},
			analysisPlan: {
				strategy: "speech_first",
			},
			index: {
				videoId: "media-1",
				globalSummary: "视频语音内容：我们来看自动字幕功能。",
				shots: [
					{
						id: "shot_001",
						transcript: "我们来看自动字幕功能。",
					},
				],
			},
		});
		expect(second).toMatchObject({
			agentViews: {
				summary: {
					videoId: "media-1",
				},
			},
			mediaAssetId: "media-1",
			cached: true,
		});
		expect(inspectVideoAsset).toHaveBeenCalledTimes(1);
		expect(analyzeVisualMedia).not.toHaveBeenCalled();
		expect(transcribeVideoAsset).toHaveBeenCalledTimes(1);
	});

	test("rejects non-video assets", async () => {
		const asset: MediaAsset = {
			id: "image-1",
			name: "image.png",
			type: "image",
			file: new File(["image"], "image.png", { type: "image/png" }),
		};
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: {
				inspectVideoAsset: mock(async () =>
					buildInspection({ videoId: "image-1" }),
				),
			},
		});

		await expect(tool.handler({ mediaAssetId: "image-1" })).rejects.toThrow(
			"视频语义索引只支持视频素材",
		);
	});

	test("surfaces desktop API error details from inspection failures", async () => {
		const asset: MediaAsset = {
			id: "media-error",
			name: "error.mp4",
			type: "video",
			duration: 12,
			width: 1280,
			height: 720,
			file: new File(["demo"], "error.mp4", { type: "video/mp4" }),
		};
		const fetchFn = mock(async () =>
			Response.json(
				{
					error: "desktop_api_error",
					message: "ffmpeg_failed: ffmpeg exited with 1",
				},
				{ status: 500 },
			),
		);
		const [tool] = buildVideoSemanticTools({
			editor: createEditorWithAssets([asset]),
			deps: { fetchFn },
		});

		await expect(
			tool.handler({
				analysisLevel: "deep",
				intent: "edit_suggestion",
				mediaAssetId: "media-error",
			}),
		).rejects.toThrow(
			"desktop_api_error: ffmpeg_failed: ffmpeg exited with 1",
		);
	});
});
