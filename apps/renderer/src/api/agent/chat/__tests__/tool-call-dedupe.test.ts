import { describe, expect, test } from "bun:test";
import { shouldSuppressDuplicateToolCall } from "../tool-call-dedupe";

describe("agent chat tool call dedupe", () => {
	test("suppresses duplicate vision analysis calls for the same media and parameters", () => {
		const seen = new Set<string>();
		const params = {
			mediaAssetId: "media-1",
			analysisType: "visual_summary",
			detail: "high",
			fps: 0.5,
			maxLongSidePixel: 672,
		};

		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "vision_analyze_video",
				params,
			}),
		).toBe(false);
		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "vision_analyze_video",
				params,
			}),
		).toBe(true);
	});

	test("does not suppress non-vision tools or distinct vision requests", () => {
		const seen = new Set<string>();

		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "timeline_get_summary",
				params: {},
			}),
		).toBe(false);
		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "timeline_get_summary",
				params: {},
			}),
		).toBe(false);
		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "vision_analyze_image",
				params: { mediaAssetId: "media-1", analysisType: "visual_summary" },
			}),
		).toBe(false);
		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "vision_analyze_image",
				params: { mediaAssetId: "media-2", analysisType: "visual_summary" },
			}),
		).toBe(false);
		expect(
			shouldSuppressDuplicateToolCall({
				seen,
				toolName: "vision_analyze_video",
				params: { mediaAssetId: "media-1", analysisType: "visual_summary" },
			}),
		).toBe(false);
	});
});
