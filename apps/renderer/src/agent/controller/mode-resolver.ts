import type { ExecutionMode, AgentPlan } from "./types";

export interface ResolveResult {
	strategy: "execute" | "suggest" | "step_by_step";
	reason: string;
}

export function resolveExecutionMode({
	userMode,
	plan,
}: {
	userMode: ExecutionMode;
	plan: AgentPlan;
}): ResolveResult {
	switch (userMode) {
		case "auto": {
			const hasDestructiveStep = plan.steps.some(
				(s) =>
					s.risk === "destructive" || s.risk === "irreversible",
			);
			if (!hasDestructiveStep && !plan.needsConfirmation) {
				return {
					strategy: "execute",
					reason: "Auto mode: non-destructive task, executing directly",
				};
			}
			return {
				strategy: "suggest",
				reason: "Auto mode: destructive or confirmation-required task",
			};
		}
		case "suggest":
			return {
				strategy: "suggest",
				reason: "Suggest mode: always suggest first",
			};
		case "manual":
			return {
				strategy: "step_by_step",
				reason: "Manual mode: step by step confirmation",
			};
		default:
			return {
				strategy: "suggest",
				reason: "Unknown mode, fallback to suggest",
			};
	}
}
