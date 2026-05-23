import { afterEach, describe, expect, test } from "bun:test";
import {
	clearPendingToolCallsForTests,
	registerPendingCall,
	resolveToolCall,
} from "../resolve";

describe("agent chat pending tool call registry", () => {
	afterEach(() => {
		clearPendingToolCallsForTests();
	});

	test("resolves a pending tool call result", async () => {
		const pending = registerPendingCall({
			sessionId: "session-1",
			callId: "tool-1",
			timeoutMs: 1000,
		});

		expect(
			resolveToolCall({
				sessionId: "session-1",
				callId: "tool-1",
				result: { ok: true },
			}),
		).toEqual({
			status: "resolved",
		});
		await expect(pending).resolves.toEqual({ ok: true });
	});

	test("queues a result that arrives before pending registration", async () => {
		expect(
			resolveToolCall({
				sessionId: "session-1",
				callId: "tool-1",
				result: { ok: true },
			}),
		).toEqual({
			status: "queued",
		});

		await expect(
			registerPendingCall({
				sessionId: "session-1",
				callId: "tool-1",
				timeoutMs: 1000,
			}),
		).resolves.toEqual({ ok: true });
	});
});
