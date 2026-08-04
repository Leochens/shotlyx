import { describe, expect, test } from "bun:test";
import { AgentExecutionStateMachine } from "@/agent/controller/execution-state";

const readPolicy = {
	effect: "read" as const,
	confirmation: "never" as const,
	idempotent: true,
};

const destructivePolicy = {
	effect: "destructive" as const,
	confirmation: "always" as const,
	idempotent: false,
};

describe("AgentExecutionStateMachine", () => {
	test("blocks destructive tools until a confirmed plan authorizes them", () => {
		const machine = new AgentExecutionStateMachine();
		const decision = machine.requestTool({
			callId: "call-1",
			tool: "timeline_delete_clip",
			params: { elementId: "clip-1" },
			policy: destructivePolicy,
		});

		expect(decision).toEqual({
			status: "confirmation_required",
			reason: "tool_requires_confirmation",
		});
		expect(machine.getPhase()).toBe("awaiting_confirmation");
	});

	test("allows a confirmed destructive tool and records observation and verification", () => {
		const transitions: string[] = [];
		const machine = new AgentExecutionStateMachine({
			onTransition: ({ to }) => transitions.push(to),
		});
		const decision = machine.requestTool({
			callId: "call-1",
			tool: "timeline_delete_clip",
			params: { elementId: "clip-1" },
			policy: destructivePolicy,
			confirmed: true,
		});

		expect(decision.status).toBe("allowed");
		machine.recordToolResult({
			callId: "call-1",
			success: true,
			verified: true,
		});
		expect(machine.getPhase()).toBe("deciding");
		expect(transitions).toEqual([
			"executing",
			"observing",
			"verifying",
			"deciding",
		]);
	});

	test("rejects a second tool while one tool is still executing", () => {
		const machine = new AgentExecutionStateMachine();
		expect(
			machine.requestTool({
				callId: "call-1",
				tool: "timeline_get_summary",
				params: {},
				policy: readPolicy,
			}).status,
		).toBe("allowed");

		expect(
			machine.requestTool({
				callId: "call-2",
				tool: "selection_get_state",
				params: {},
				policy: readPolicy,
			}),
		).toEqual({
			status: "blocked",
			reason: "tool_call_in_progress",
		});
	});

	test("requires an explicit next turn before another tool can run", () => {
		const machine = new AgentExecutionStateMachine();
		machine.requestTool({
			callId: "call-1",
			tool: "timeline_get_summary",
			params: {},
			policy: readPolicy,
		});
		machine.recordToolResult({ callId: "call-1", success: true });

		expect(
			machine.requestTool({
				callId: "call-2",
				tool: "selection_get_state",
				params: {},
				policy: readPolicy,
			}),
		).toEqual({
			status: "blocked",
			reason: "multiple_tool_calls_in_turn",
		});

		machine.startNextTurn();
		expect(
			machine.requestTool({
				callId: "call-3",
				tool: "selection_get_state",
				params: {},
				policy: readPolicy,
			}).status,
		).toBe("allowed");
	});
});
