import { describe, expect, test } from "bun:test";
import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";

describe("sanitizeToolResultForModel", () => {
	test("removes generated image URLs before sending tool results to the model", () => {
		const result = sanitizeToolResultForModel({
			toolName: "creative_generate_image",
			result: {
				status: "success",
				verified: true,
				data: {
					images: [
						{
							id: "creative-1",
							title: "Blue sky",
							name: "blue-sky.png",
							sizeBytes: 1024,
							width: 1536,
							height: 1024,
							mediaAssetId: "media-1",
							imported: true,
							previewUrl: `data:image/png;base64,${"a".repeat(10_000)}`,
							thumbnailUrl: `data:image/png;base64,${"b".repeat(10_000)}`,
							prompt: "blue sky with clouds",
						},
					],
				},
			},
		});

		expect(JSON.stringify(result)).not.toContain("data:image");
		expect(result).toEqual({
			status: "success",
			verified: true,
			data: {
				images: [
					{
						id: "creative-1",
						title: "Blue sky",
						name: "blue-sky.png",
						sizeBytes: 1024,
						width: 1536,
						height: 1024,
						mediaAssetId: "media-1",
						imported: true,
					},
				],
			},
		});
	});

	test("truncates oversized strings in other tool results", () => {
		const result = sanitizeToolResultForModel({
			toolName: "other_tool",
			result: {
				status: "success",
				data: {
					value: "x".repeat(1200),
				},
			},
		});

		const serialized = JSON.stringify(result);
		expect(serialized.length).toBeLessThan(1000);
		expect(serialized).toContain("[truncated 1200 chars]");
	});

	test("keeps stock media candidate IDs but removes preview URLs for model follow-up", () => {
		const result = sanitizeToolResultForModel({
			toolName: "stock_search_media",
			result: {
				status: "success",
				data: {
					candidates: [
						{
							id: "stock_1",
							title: "Office working",
							provider: "pexels",
							type: "video",
							width: 1920,
							height: 1080,
							durationSeconds: 14,
							previewUrl: "https://example.com/preview.mp4",
							thumbnailUrl: "https://example.com/thumb.jpg",
							sourceUrl: "https://example.com/source",
							license: {
								name: "Pexels License",
								commercialUse: true,
								attributionRequired: false,
							},
						},
					],
				},
			},
		});

		const serialized = JSON.stringify(result);
		expect(serialized).toContain("stock_1");
		expect(serialized).toContain("stock_media_cards");
		expect(serialized).not.toContain("preview.mp4");
		expect(serialized).not.toContain("thumb.jpg");
		expect(serialized).not.toContain("example.com/source");
	});

	test("keeps useful fetched web content for model follow-up", () => {
		const result = sanitizeToolResultForModel({
			toolName: "web_fetch",
			result: {
				status: "success",
				data: {
					provider: "jina",
					url: "https://example.com/research",
					title: "Research Page",
					content: "x".repeat(5000),
					truncated: false,
					contentLength: 5000,
				},
			},
		});

		const serialized = JSON.stringify(result);
		expect(serialized).toContain("Research Page");
		expect(serialized).toContain("https://example.com/research");
		expect(serialized).toContain("x".repeat(1200));
		expect(serialized).not.toContain("[truncated 5000 chars]");
	});

	test("keeps silence analysis plan id and compact summary for model follow-up", () => {
		const result = sanitizeToolResultForModel({
			toolName: "silence_analyze_timeline",
			result: {
				status: "success",
				data: {
					planId: "silence-plan-1",
					analyzedClipCount: 2,
					targetCount: 1,
					segmentCount: 3,
					totalSilenceSeconds: 4.5,
					targets: [
						{
							elementName: "Talking head",
							segments: Array.from({ length: 30 }, (_, index) => ({
								startSeconds: index,
								endSeconds: index + 0.5,
							})),
						},
					],
				},
			},
		});

		const serialized = JSON.stringify(result);
		expect(serialized).toContain("silence-plan-1");
		expect(serialized).toContain("silence_apply_cut_plan");
		expect(serialized).toContain("segmentCount");
		expect(serialized).not.toContain("\"startSeconds\":29");
	});

	test("keeps rough cut review id without sending full transcript to the model", () => {
		const result = sanitizeToolResultForModel({
			toolName: "rough_cut_create_review",
			result: {
				status: "success",
				data: {
					reviewId: "rough-cut-1",
					openReview: true,
					tokenCount: 120,
					selectedTokenCount: 8,
					candidateCount: 4,
					tokens: Array.from({ length: 120 }, (_, index) => ({
						id: `token-${index}`,
						text: "嗯",
					})),
				},
			},
		});

		const serialized = JSON.stringify(result);
		expect(serialized).toContain("rough-cut-1");
		expect(serialized).toContain("rough_cut_apply_review");
		expect(serialized).toContain("selectedTokenCount");
		expect(serialized).not.toContain("token-119");
	});

	test("keeps large video choice options for vision tool follow-up", () => {
		const result = sanitizeToolResultForModel({
			toolName: "vision_analyze_media",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
					requiresUserChoice: true,
					reason: "media_size_exceeds_minimax_limit",
					fileSizeBytes: 52_428_801,
					limitBytes: 52_428_800,
					message:
						"这个视频约 50.0MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
					options: [
						{
							id: "split_video",
							label: "切分视频分析",
							description: "将视频拆成多个小于 50MiB 的片段。",
						},
						{
							id: "compress_or_upload_smaller",
							label: "压缩或上传小视频",
							description: "用户先压缩视频或上传小于 50MiB 的片段。",
						},
					],
				},
			},
		});

		expect(result).toEqual({
			status: "success",
			verified: undefined,
			data: {
				mediaAssetId: "media-1",
				mediaName: "large.mp4",
				mediaType: "video",
				requiresUserChoice: true,
				reason: "media_size_exceeds_minimax_limit",
				fileSizeBytes: 52_428_801,
				limitBytes: 52_428_800,
				message:
					"这个视频约 50.0MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
				options: [
					{
						id: "split_video",
						label: "切分视频分析",
						description: "将视频拆成多个小于 50MiB 的片段。",
					},
					{
						id: "compress_or_upload_smaller",
						label: "压缩或上传小视频",
						description: "用户先压缩视频或上传小于 50MiB 的片段。",
					},
				],
				instruction:
					"Do not claim visual analysis is complete. Ask the user to choose whether to split the video for segmented analysis or compress/upload a smaller video before analysis.",
			},
		});
	});

	test("does not describe missing vision analysis as usable evidence", () => {
		const result = sanitizeToolResultForModel({
			toolName: "vision_analyze_media",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "compressed.mp4",
					mediaType: "video",
				},
			},
		});

		expect(result).toEqual({
			status: "success",
			verified: undefined,
			data: {
				mediaAssetId: "media-1",
				mediaName: "compressed.mp4",
				mediaType: "video",
					analysisMissing: true,
					message: "视觉分析没有返回可用内容。",
					instruction:
						"Do not claim visual analysis is complete. Do not call vision_analyze_media again automatically. Ask the user whether to keep waiting, retry with lower detail/fps, or split/compress the video.",
				},
			});
		});
});
