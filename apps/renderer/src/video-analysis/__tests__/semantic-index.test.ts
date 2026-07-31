import { describe, expect, test } from "bun:test";
import {
	buildAnalysisPlan,
	buildSemanticAgentViews,
	buildFrameAnalysisPrompt,
	buildVideoSemanticIndex,
} from "../semantic-index";
import type { VideoAssetInspection } from "../types";

const inspection: VideoAssetInspection = {
	videoId: "asset-1",
	profile: {
		videoId: "asset-1",
		duration: 30,
		fps: 30,
		width: 1920,
		height: 1080,
		aspectRatio: "16:9",
		hasAudio: true,
		speechRatio: 0.8,
		silenceRatio: 0.2,
		motionLevel: "medium",
		sceneChangeDensity: 4,
		contentTypeGuess: "product_demo",
	},
	shots: [
		{
			id: "shot_001",
			start: 0,
			end: 8,
			duration: 8,
			method: "ffmpeg_scene",
		},
		{
			id: "shot_002",
			start: 8,
			end: 20,
			duration: 12,
			method: "ffmpeg_scene",
		},
		{
			id: "shot_003",
			start: 20,
			end: 30,
			duration: 10,
			method: "ffmpeg_scene",
		},
	],
	keyframes: [
		{ id: "keyframe_001_001", shotId: "shot_001", time: 4 },
		{ id: "keyframe_002_001", shotId: "shot_002", time: 14 },
		{ id: "keyframe_003_001", shotId: "shot_003", time: 25 },
	],
	analysisMeta: {
		createdAt: "2026-06-03T00:00:00.000Z",
		modelUsed: ["ffprobe", "ffmpeg"],
		analysisLevel: "standard",
	},
};

describe("video semantic index", () => {
	test("builds segment cards and semantic segments from transcript and visual analysis", () => {
		const index = buildVideoSemanticIndex({
			inspection,
			transcript: [
				{
					start: 1,
					end: 7,
					text: "今天我们演示自动字幕功能。",
				},
				{
					start: 9,
					end: 18,
					text: "点击生成后字幕会对齐到时间线。",
				},
			],
			visualAnalyses: [
				{
					shotId: "shot_001",
					visualSummary: "画面展示 Shotlyx 主界面和导入的视频素材。",
					sceneType: "product_demo",
					actions: ["展示主界面"],
					editSuggestions: ["适合作为功能介绍开头"],
				},
				{
					shotId: "shot_002",
					visualSummary: "用户点击自动字幕按钮并展示字幕轨道。",
					sceneType: "product_demo",
					actions: ["点击按钮", "展示字幕结果"],
					editSuggestions: ["适合加箭头标注"],
				},
				{
					shotId: "shot_003",
					visualSummary: "画面停留在字幕生成完成后的时间线。",
					sceneType: "product_demo",
					actions: ["展示完成结果"],
					editSuggestions: ["适合做结尾回顾"],
				},
			],
		});

		expect(index.videoId).toBe("asset-1");
		expect(index.assetType).toBe("product_demo");
		expect(index.globalSummary).toContain("产品演示");
		expect(index.shots).toHaveLength(3);
		expect(index.shots[1]).toMatchObject({
			id: "shot_002",
			transcript: "点击生成后字幕会对齐到时间线。",
			visualSummary: "用户点击自动字幕按钮并展示字幕轨道。",
			actionSummary: "点击按钮；展示字幕结果",
			sceneType: "product_demo",
			role: "demo",
			editValue: {
				keepScore: 0.86,
				mgOpportunityScore: 0.82,
			},
		});
		expect(index.semanticSegments).toEqual([
			{
				id: "sem_001",
				start: 0,
				end: 30,
				title: "产品演示片段 1",
				summary:
					"画面展示 Shotlyx 主界面和导入的视频素材。 用户点击自动字幕按钮并展示字幕轨道。 画面停留在字幕生成完成后的时间线。",
				sourceShotIds: ["shot_001", "shot_002", "shot_003"],
				type: "demo",
				suggestedOperations: [
					{ type: "keep", reason: "这是高保留价值的内容段落" },
					{
						type: "add_mg_annotation",
						reason: "适合用 MG 动画或箭头强调重点操作",
					},
				],
			},
		]);
		expect(index.analysisMeta.modelUsed).toEqual([
			"ffprobe",
			"ffmpeg",
			"semantic-index",
			"vlm",
			"asr",
		]);
	});

	test("builds a useful fallback index when model outputs are absent", () => {
		const index = buildVideoSemanticIndex({ inspection });

		expect(index.shots[0]).toMatchObject({
			visualSummary: "product_demo 片段，时间 0.000s-8.000s。",
			sceneType: "product_demo",
		});
		expect(index.transcript).toBeUndefined();
		expect(index.semanticSegments[0]?.suggestedOperations).toContainEqual({
			type: "keep",
			reason: "这是高保留价值的内容段落",
		});
	});

	test("plans analysis budget by user intent and asset profile", () => {
		expect(
			buildAnalysisPlan({
				intent: "summarize",
				profile: inspection.profile,
			}),
		).toMatchObject({
			intent: "summarize",
			strategy: "speech_first",
			steps: [
				"asr",
				"shot_detection",
				"keyframe_extraction",
				"vlm_summary",
				"segment_cards",
				"semantic_merge",
				"global_summary",
			],
			budget: {
				level: "cheap",
				maxFrames: 20,
				maxVlmCalls: 10,
				allowDeepModel: false,
			},
			expectedOutput: "summary",
		});

		expect(
			buildAnalysisPlan({
				intent: "mg_animation",
				profile: {
					...inspection.profile,
					hasAudio: false,
					motionLevel: "high",
				},
			}),
		).toMatchObject({
			strategy: "high_motion",
			budget: {
				level: "medium",
				maxFrames: 60,
				maxVlmCalls: 24,
			},
			expectedOutput: "mg_plan",
		});
	});

	test("builds a structured VLM keyframe prompt", () => {
		const prompt = buildFrameAnalysisPrompt({
			keyframeCount: 3,
			shot: inspection.shots[1],
		});

		expect(prompt).toContain("你是视频素材分析助手");
		expect(prompt).toContain('"visualSummary"');
		expect(prompt).toContain("shot_002");
		expect(prompt).toContain("8.000s-20.000s");
	});

	test("builds agent-facing views from the semantic index", () => {
		const index = buildVideoSemanticIndex({
			inspection,
			transcript: [
				{ start: 0, end: 5, text: "开头介绍自动字幕。" },
				{ start: 10, end: 15, text: "展示字幕对齐时间线。" },
			],
			visualAnalyses: [
				{
					editSuggestions: ["适合加箭头标注"],
					sceneType: "product_demo",
					shotId: "shot_001",
					visualSummary: "展示主界面。",
				},
				{
					editSuggestions: ["适合保留"],
					sceneType: "product_demo",
					shotId: "shot_002",
					visualSummary: "展示字幕生成结果。",
				},
			],
		});

		const views = buildSemanticAgentViews({
			index,
			targetDurationSeconds: 18,
		});

		expect(views.summary).toMatchObject({
			assetType: "product_demo",
			globalSummary: index.globalSummary,
		});
		expect(views.editing.keep[0]).toMatchObject({
			segmentId: "sem_001",
			reason: "这是高保留价值的内容段落",
		});
		expect(views.caption.transcriptText).toContain("开头介绍自动字幕。");
		expect(views.mg.opportunities[0]).toMatchObject({
			segmentId: "shot_001",
			score: 0.82,
		});
		expect(views.broll.needs[0]).toMatchObject({
			segmentId: "shot_003",
			reason: "画面信息较少，可作为补 B-roll 或被 B-roll 覆盖的候选段落",
		});
	});
});
