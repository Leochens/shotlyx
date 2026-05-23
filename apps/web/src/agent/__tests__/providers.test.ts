import { describe, expect, test } from "bun:test";
import { formatDeepSeekSyntheticContentChunk } from "@/agent/ai-sdk/providers";

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
});
