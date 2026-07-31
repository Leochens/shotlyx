import { describe, expect, test } from "bun:test";
import {
	formatDeepSeekSyntheticContentChunk,
	normalizeOpenAICompatibleReasoningRequestBody,
} from "@/agent/ai-sdk/providers";

function parseSSEDataLine(line: string): unknown {
	const trimmed = line.trim();
	if (!trimmed.startsWith("data: ")) {
		throw new Error("Expected SSE data line");
	}
	return JSON.parse(trimmed.slice("data: ".length));
}

describe("DeepSeek provider compatibility", () => {
	test("synthetic content chunks include OpenAI choice index", () => {
		const line = formatDeepSeekSyntheticContentChunk({
			content: "</think>",
			finishReason: "tool_calls",
		});

		expect(line.endsWith("\n\n")).toBe(true);
		expect(parseSSEDataLine(line)).toEqual({
			choices: [
				{
					index: 0,
					delta: { content: "</think>" },
					finish_reason: "tool_calls",
				},
			],
		});
	});

	test("adds empty reasoning_content to assistant tool-call history", () => {
		const request = normalizeOpenAICompatibleReasoningRequestBody({
			method: "POST",
			body: JSON.stringify({
				messages: [
					{ role: "user", content: "Add title" },
					{
						role: "assistant",
						content: "",
						tool_calls: [
							{
								id: "call_1",
								type: "function",
								function: {
									name: "timeline_add_text",
									arguments: "{}",
								},
							},
						],
					},
					{
						role: "tool",
						tool_call_id: "call_1",
						content: "{}",
					},
				],
			}),
		});

		const body = JSON.parse(String(request?.body));
		expect(body.messages[1]).toMatchObject({
			role: "assistant",
			reasoning_content: "",
		});
	});
});
