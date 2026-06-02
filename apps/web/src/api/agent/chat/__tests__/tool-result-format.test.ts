import { describe, expect, test } from "bun:test";
import { formatToolResultForModel } from "../tool-result-format";

describe("formatToolResultForModel", () => {
	test("turns large vision video choices into an explicit user-question instruction", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_media",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
					requiresUserChoice: true,
					reason: "media_size_exceeds_minimax_limit",
					message:
						"这个视频约 86.3MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
					options: [
						{
							id: "split_video",
							label: "切分视频分析",
							description:
								"将视频拆成多个小于 50MiB 的片段，分段传给 MiniMax 后汇总结果。",
						},
						{
							id: "compress_or_upload_smaller",
							label: "压缩或上传小视频",
							description:
								"用户先压缩视频或上传小于 50MiB 的片段，再进行完整视频理解。",
						},
					],
				},
			},
		});

		expect(result).toContain("cannot continue automatically");
		expect(result).toContain("Do not claim the video has been analyzed");
		expect(result).toContain("切分视频分析");
		expect(result).toContain("压缩或上传小视频");
		expect(result).not.toContain("Use this visual analysis as evidence");
	});

	test("preserves large vision choices when the result was already sanitized once", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_media",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
					requiresUserChoice: true,
					reason: "media_size_exceeds_minimax_limit",
					message:
						"这个视频约 86.3MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
					options: [
						{
							id: "split_video",
							label: "切分视频分析",
							description: "分段传给 MiniMax 后汇总结果。",
						},
					],
					instruction:
						"Do not claim visual analysis is complete. Ask the user to choose.",
				},
			},
		});

		expect(result).toContain("cannot continue automatically");
		expect(result).toContain("切分视频分析");
		expect(result).not.toContain("Use this visual analysis as evidence");
	});

	test("tells the model to retry or ask when vision analysis content is missing", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_media",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
				},
			},
		});

		expect(result).toContain("did not return usable visual analysis content");
		expect(result).toContain("Retry once with adjusted visual parameters");
		expect(result).not.toContain("Use this visual analysis as evidence");
	});
});
