import { describe, expect, test } from "bun:test";
import type { ToolCallRecord } from "@/agent/controller/types";
import {
	buildDuplicateToolCallResult,
	findSuppressibleDuplicateToolCall,
	getToolCallSignature,
} from "@/agent/chat/tool-call-dedupe";

describe("tool call dedupe", () => {
	test("suppresses duplicate completed tool calls with the same parameters", () => {
		const existingToolCalls: ToolCallRecord[] = [
			{
				callId: "call-1",
				tool: "subtitles_generate_from_video",
				params: { revealMode: "karaoke", source: "timeline" },
				result: { status: "success", data: { message: "字幕已插入时间线" } },
			},
		];

		const duplicate = findSuppressibleDuplicateToolCall({
			existingToolCalls,
			tool: "subtitles_generate_from_video",
			params: { source: "timeline", revealMode: "karaoke" },
		});

		expect(duplicate?.callId).toBe("call-1");
	});

	test("suppresses duplicate tool calls while the first call is still running", () => {
		const existingToolCalls: ToolCallRecord[] = [
			{
				callId: "call-1",
				tool: "subtitles_generate_from_video",
				params: { source: "timeline" },
			},
		];

		const duplicate = findSuppressibleDuplicateToolCall({
			existingToolCalls,
			tool: "subtitles_generate_from_video",
			params: { source: "timeline" },
		});

		expect(duplicate?.callId).toBe("call-1");
	});

	test("allows retry after the previous matching tool call failed", () => {
		const existingToolCalls: ToolCallRecord[] = [
			{
				callId: "call-1",
				tool: "subtitles_generate_from_video",
				params: { source: "timeline" },
				result: { status: "error", error: "Whisper failed" },
			},
		];

		const duplicate = findSuppressibleDuplicateToolCall({
			existingToolCalls,
			tool: "subtitles_generate_from_video",
			params: { source: "timeline" },
		});

		expect(duplicate).toBeNull();
	});

	test("does not suppress the same tool when parameters differ", () => {
		const existingToolCalls: ToolCallRecord[] = [
			{
				callId: "call-1",
				tool: "subtitles_generate_from_video",
				params: { source: "selection" },
			},
		];

		const duplicate = findSuppressibleDuplicateToolCall({
			existingToolCalls,
			tool: "subtitles_generate_from_video",
			params: { source: "timeline" },
		});

		expect(duplicate).toBeNull();
	});

	test("builds a stable signature for nested parameters", () => {
		expect(
			getToolCallSignature({
				tool: "stock_search_media",
				params: { filters: { orientation: "landscape", duration: [5, 10] } },
			}),
		).toBe(
			getToolCallSignature({
				tool: "stock_search_media",
				params: { filters: { duration: [5, 10], orientation: "landscape" } },
			}),
		);
	});

	test("returns a successful skipped result for duplicate calls", () => {
		const result = buildDuplicateToolCallResult({
			duplicate: {
				callId: "call-1",
				tool: "subtitles_generate_from_video",
				params: { source: "timeline" },
			},
		});

		expect(result.status).toBe("success");
		expect(result.data).toMatchObject({
			skipped: true,
			reason: "duplicate_tool_call_running",
			originalCallId: "call-1",
		});
	});
});
