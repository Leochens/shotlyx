import { describe, expect, test } from "bun:test";
import {
	INTERRUPTED_TOOL_CALL_ERROR,
	recoverInterruptedToolCalls,
} from "../interrupted-tool-calls";
import type { ChatSession } from "../types";

function createSession(): ChatSession {
	return {
		id: "session-1",
		projectId: "project-1",
		name: "测试会话",
		createdAt: 1,
		updatedAt: 2,
		messages: [
			{
				id: "assistant-1",
				role: "assistant",
				content: "",
				timestamp: 2,
				toolCalls: [
					{
						callId: "pending-search",
						tool: "web_search",
						params: { query: "销量" },
					},
					{
						callId: "completed-search",
						tool: "web_search",
						params: { query: "销量" },
						result: { status: "success", data: { results: [] } },
					},
				],
			},
		],
	};
}

describe("interrupted tool call recovery", () => {
	test("marks persisted unfinished calls as interrupted", () => {
		const sessions = recoverInterruptedToolCalls([createSession()]);
		const toolCalls = sessions[0]?.messages[0]?.toolCalls;

		expect(toolCalls?.[0]?.result).toEqual({
			status: "error",
			error: INTERRUPTED_TOOL_CALL_ERROR,
		});
		expect(toolCalls?.[1]?.result?.status).toBe("success");
	});

	test("preserves references when every call is already terminal", () => {
		const session = createSession();
		session.messages[0]!.toolCalls = [
			{
				tool: "web_search",
				params: { query: "销量" },
				result: { status: "error", error: "failed" },
			},
		];
		const sessions = [session];

		expect(recoverInterruptedToolCalls(sessions)).toBe(sessions);
	});
});
