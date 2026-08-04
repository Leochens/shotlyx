import type { ToolPolicy } from "@/agent/mcp/types";

export type AgentExecutionPhase =
	| "deciding"
	| "awaiting_confirmation"
	| "executing"
	| "observing"
	| "verifying"
	| "completed"
	| "failed";

export interface AgentExecutionTransition {
	from: AgentExecutionPhase;
	to: AgentExecutionPhase;
	reason: string;
	callId?: string;
	tool?: string;
}

type ToolDecision =
	| { status: "allowed" }
	| {
			status: "confirmation_required";
			reason: "tool_requires_confirmation";
	  }
	| {
			status: "blocked";
			reason:
				| "tool_call_in_progress"
				| "awaiting_confirmation"
				| "max_tool_calls_exceeded"
				| "multiple_tool_calls_in_turn"
				| "duplicate_tool_call";
	  };

function stableValue(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableValue(item)).join(",")}]`;
	}
	if (typeof value === "object" && value !== null) {
		return `{${Object.entries(value)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? String(value);
}

export class AgentExecutionStateMachine {
	private phase: AgentExecutionPhase = "deciding";
	private activeCallId: string | null = null;
	private lastCompletedSignature: string | null = null;
	private lastCompletedSucceeded = false;
	private toolCallCount = 0;
	private toolCallsInTurn = 0;
	private readonly maxToolCalls: number;
	private readonly onTransition?: (
		transition: AgentExecutionTransition,
	) => void;

	constructor({
		maxToolCalls = 20,
		onTransition,
	}: {
		maxToolCalls?: number;
		onTransition?: (transition: AgentExecutionTransition) => void;
	} = {}) {
		this.maxToolCalls = maxToolCalls;
		this.onTransition = onTransition;
	}

	getPhase(): AgentExecutionPhase {
		return this.phase;
	}

	requestTool({
		callId,
		tool,
		params,
		policy,
		confirmed = false,
	}: {
		callId: string;
		tool: string;
		params: Record<string, unknown>;
		policy: ToolPolicy;
		confirmed?: boolean;
	}): ToolDecision {
		if (this.phase === "executing" || this.activeCallId) {
			return { status: "blocked", reason: "tool_call_in_progress" };
		}
		if (this.phase === "awaiting_confirmation") {
			return { status: "blocked", reason: "awaiting_confirmation" };
		}
		if (this.toolCallCount >= this.maxToolCalls) {
			return { status: "blocked", reason: "max_tool_calls_exceeded" };
		}
		if (this.toolCallsInTurn >= 1) {
			return { status: "blocked", reason: "multiple_tool_calls_in_turn" };
		}

		const signature = `${tool}:${stableValue(params)}`;
		if (
			signature === this.lastCompletedSignature &&
			this.lastCompletedSucceeded
		) {
			return { status: "blocked", reason: "duplicate_tool_call" };
		}
		if (policy.confirmation === "always" && !confirmed) {
			this.toolCallsInTurn += 1;
			this.transition({
				to: "awaiting_confirmation",
				reason: "tool_requires_confirmation",
				callId,
				tool,
			});
			return {
				status: "confirmation_required",
				reason: "tool_requires_confirmation",
			};
		}

		this.activeCallId = callId;
		this.toolCallCount += 1;
		this.toolCallsInTurn += 1;
		this.lastCompletedSignature = signature;
		this.transition({ to: "executing", reason: "tool_allowed", callId, tool });
		return { status: "allowed" };
	}

	startNextTurn(): void {
		if (this.phase === "executing") return;
		this.toolCallsInTurn = 0;
		if (this.phase !== "awaiting_confirmation") {
			this.transition({ to: "deciding", reason: "next_model_turn" });
		}
	}

	recordToolResult({
		callId,
		success,
		verified,
	}: {
		callId: string;
		success: boolean;
		verified?: boolean;
	}): void {
		if (this.activeCallId !== callId) return;
		this.transition({
			to: "observing",
			reason: success ? "tool_succeeded" : "tool_failed",
			callId,
		});
		this.lastCompletedSucceeded = success;
		this.transition({
			to: "verifying",
			reason:
				verified === false
					? "verification_inconclusive"
					: "verification_recorded",
			callId,
		});
		this.activeCallId = null;
		this.transition({
			to: "deciding",
			reason: "observation_available",
			callId,
		});
	}

	complete(): void {
		if (this.phase === "executing") return;
		this.transition({ to: "completed", reason: "final_response" });
	}

	fail(reason: string): void {
		this.activeCallId = null;
		this.transition({ to: "failed", reason });
	}

	private transition({
		to,
		reason,
		callId,
		tool,
	}: Omit<AgentExecutionTransition, "from">): void {
		const from = this.phase;
		this.phase = to;
		this.onTransition?.({ from, to, reason, callId, tool });
	}
}
