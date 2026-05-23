import { describe, expect, test } from "bun:test";
import {
	isPreviewSafeCreativeTool,
	splitPreviewSafeSteps,
} from "@/agent/controller/creative-preview";
import type { AgentStep } from "@/agent/controller/types";

describe("creative preview helpers", () => {
	test("marks search and image generation as preview-safe", () => {
		expect(isPreviewSafeCreativeTool("creative_search_video")).toBe(true);
		expect(isPreviewSafeCreativeTool("stock_search_media")).toBe(true);
		expect(isPreviewSafeCreativeTool("creative_generate_image")).toBe(true);
		expect(isPreviewSafeCreativeTool("silence_analyze_timeline")).toBe(true);
		expect(isPreviewSafeCreativeTool("stock_import_media")).toBe(false);
		expect(isPreviewSafeCreativeTool("creative_import_asset")).toBe(false);
		expect(isPreviewSafeCreativeTool("timeline_insert_media")).toBe(false);
	});

	test("splits leading preview-safe steps from remaining plan", () => {
		const steps: AgentStep[] = [
			{
				tool: "creative_search_video",
				params: { query: "ai" },
				description: "搜索 AI 视频素材",
				risk: "none",
			},
			{
				tool: "stock_search_media",
				params: { query: "office work", type: "video" },
				description: "搜索真实视频素材",
				risk: "none",
			},
			{
				tool: "creative_generate_image",
				params: { prompt: "AI cover" },
				description: "生成封面图",
				risk: "none",
			},
			{
				tool: "silence_analyze_timeline",
				params: { scope: "timeline" },
				description: "分析静音",
				risk: "none",
			},
			{
				tool: "creative_import_asset",
				params: { assetId: "creative_1" },
				description: "导入资源",
				risk: "none",
			},
		];

		const result = splitPreviewSafeSteps({ steps });
		expect(result.previewSteps.map((step) => step.tool)).toEqual([
			"creative_search_video",
			"stock_search_media",
			"creative_generate_image",
			"silence_analyze_timeline",
		]);
		expect(result.remainingSteps.map((step) => step.tool)).toEqual([
			"creative_import_asset",
		]);
	});
});
