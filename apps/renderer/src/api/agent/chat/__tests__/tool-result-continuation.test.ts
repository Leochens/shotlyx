import { describe, expect, test } from "bun:test";
import {
	buildToolResultContinuationMessages,
	shouldRunToolResultContinuation,
} from "../tool-result-continuation";

describe("tool result continuation", () => {
	test("continues when tools returned results but the assistant produced no final text", () => {
		expect(
			shouldRunToolResultContinuation({
				assistantText: "",
				toolCallCount: 1,
				formattedToolResults: [
					'Tool "vision_analyze_video" failed: provider_error',
				],
				continuationDepth: 0,
			}),
		).toBe(true);
	});

	test("does not continue forever or interrupt real assistant replies", () => {
		expect(
			shouldRunToolResultContinuation({
				assistantText: "我需要你选择一种处理方式。",
				toolCallCount: 1,
				formattedToolResults: ["tool result"],
				continuationDepth: 0,
			}),
		).toBe(false);
		expect(
			shouldRunToolResultContinuation({
				assistantText: "",
				toolCallCount: 1,
				formattedToolResults: ["tool result"],
				continuationDepth: 1,
			}),
		).toBe(false);
	});

	test("does not auto-continue when visual analysis says not to retry", () => {
		expect(
			shouldRunToolResultContinuation({
				assistantText: "",
				toolCallCount: 1,
				formattedToolResults: [
					[
						'Tool "vision_analyze_video" failed: provider_error',
						"Do not call vision_analyze_video again automatically.",
					].join("\n"),
				],
				continuationDepth: 0,
			}),
		).toBe(false);
	});

	test("does not auto-continue into a second MG generation", () => {
		expect(
			shouldRunToolResultContinuation({
				assistantText: "",
				toolCallCount: 1,
				formattedToolResults: [
					"Do not call shotlyx_generate_mg_component again automatically.",
				],
				continuationDepth: 0,
			}),
		).toBe(false);
	});

	test("builds a synthetic prompt that tells the model to retry or ask after tool failure", () => {
		const messages = buildToolResultContinuationMessages({
			messages: [{ role: "user", content: "分析一下视频内容" }],
			formattedToolResults: [
				[
					'Tool "vision_analyze_video" cannot continue automatically because this video exceeds MiniMax M3\'s per-media size limit.',
					"这个视频约 86.3MiB，超过 MiniMax M3 单次媒体 50MiB 限制。",
					"Do not claim the video has been analyzed. Ask the user to choose one option before continuing:",
					"- 切分视频分析: 分段传给 MiniMax 后汇总结果。",
				].join("\n"),
			],
		});

		expect(messages).toHaveLength(2);
		expect(messages[1]).toMatchObject({
			role: "user",
		});
		expect(messages[1]?.content).toContain("Continue autonomously");
		expect(messages[1]?.content).toContain("retry with corrected parameters");
		expect(messages[1]?.content).toContain("ask the user to choose");
		expect(messages[1]?.content).toContain("切分视频分析");
	});

	test("does not encourage retry when a visual analysis result says to wait", () => {
		const messages = buildToolResultContinuationMessages({
			messages: [{ role: "user", content: "分析一下视频内容" }],
			formattedToolResults: [
				[
					'Tool "vision_analyze_video" failed: provider_error',
					"Do not call vision_analyze_video again automatically.",
					"Ask the user whether to wait, retry with lighter settings, or split the video.",
				].join("\n"),
			],
		});

		expect(messages[1]?.content).toContain(
			"Do not call the same tool again automatically",
		);
		expect(messages[1]?.content).not.toContain(
			"retry with corrected parameters",
		);
	});
});
