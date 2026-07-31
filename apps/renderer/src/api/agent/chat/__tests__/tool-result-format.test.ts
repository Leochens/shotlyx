import { describe, expect, test } from "bun:test";
import { formatToolResultForModel } from "../tool-result-format";

describe("formatToolResultForModel", () => {
	test("does not invite automatic retries for failed vision analysis", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_video",
			result: {
				status: "error",
				error:
					'provider_error: MiniMax M3 vision request failed with 500: {"type":"error","error":{"type":"server_error","message":"unknown error, 999 (1000)","http_code":"500"}}',
				errorCategory: "provider_error",
			},
		});

		expect(result).toContain('Tool "vision_analyze_video" failed');
		expect(result).toContain(
			"Do not call vision_analyze_video again automatically",
		);
		expect(result).toContain("Ask the user");
		expect(result).not.toContain("You may retry");
	});

	test("turns large vision video choices into an explicit user-question instruction", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_video",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
					requiresUserChoice: true,
					reason: "media_size_exceeds_minimax_limit",
					message: "这个视频约 86.3MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
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
			toolName: "vision_analyze_video",
			result: {
				status: "success",
				data: {
					mediaAssetId: "media-1",
					mediaName: "large.mp4",
					mediaType: "video",
					requiresUserChoice: true,
					reason: "media_size_exceeds_minimax_limit",
					message: "这个视频约 86.3MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
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

	test("tells the model to ask before retrying when vision analysis content is missing", () => {
		const result = formatToolResultForModel({
			toolName: "vision_analyze_video",
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
		expect(result).toContain(
			"Do not call vision_analyze_video again automatically",
		);
		expect(result).toContain("Ask the user");
		expect(result).not.toContain("Use this visual analysis as evidence");
	});
});
