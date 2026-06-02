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

function buildInspection(videoId: string): VideoAssetInspection {
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
		keyframes: [{ id: "keyframe_001_001", shotId: "shot_001", time: 6 }],
		analysisMeta: {
			createdAt: "2026-06-03T00:00:00.000Z",
			modelUsed: ["ffprobe", "ffmpeg"],
			analysisLevel: "standard",
		},
	};
}

describe("video semantic index tools", () => {
	test("default tool pipeline calls desktop inspection, VLM, and ASR routes", async () => {
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
		const fetchFn = mock(async (input: RequestInfo | URL) => {
			const url = new URL(String(input), "http://localhost");
			if (url.pathname === "/api/desktop/media/analyze") {
				return Response.json(buildInspection("media-default"));
			}
			if (url.pathname === "/api/agent/vision/analyze") {
				const payload = JSON.parse(url.searchParams.get("payload") ?? "{}");
				expect(payload.prompt).toContain("Video Semantic Index");
				expect(payload.prompt).toContain("shot_001");
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

		const result = await tool.handler({
			analysisLevel: "standard",
			intent: "summarize",
			mediaAssetId: "media-default",
		});

		expect(result).toMatchObject({
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
		expect(fetchFn).toHaveBeenCalledTimes(3);
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
		const inspectVideoAsset = mock(async () => buildInspection("media-1"));
		const analyzeVisualMedia = mock(async () => ({
			globalSummary: "这是一个自动字幕功能演示视频。",
			shots: [
				{
					shotId: "shot_001",
					visualSummary: "用户展示 Shotlyx 自动字幕按钮。",
					sceneType: "product_demo" as const,
					actions: ["展示自动字幕按钮"],
					editSuggestions: ["适合加箭头标注"],
				},
			],
			modelUsed: "MiniMax-M3",
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
			analysisPlan: {
				strategy: "speech_first",
			},
			index: {
				videoId: "media-1",
				globalSummary: "这是一个自动字幕功能演示视频。",
				shots: [
					{
						id: "shot_001",
						transcript: "我们来看自动字幕功能。",
						visualSummary: "用户展示 Shotlyx 自动字幕按钮。",
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
		expect(analyzeVisualMedia).toHaveBeenCalledTimes(1);
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
				inspectVideoAsset: mock(async () => buildInspection("image-1")),
			},
		});

		await expect(tool.handler({ mediaAssetId: "image-1" })).rejects.toThrow(
			"视频语义索引只支持视频素材",
		);
	});
});
