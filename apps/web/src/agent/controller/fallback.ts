import type { AgentPlan } from "./types";

export function fallbackPlan(reason: string): AgentPlan {
	return {
		complexity: "medium",
		reasoning: reason,
		steps: [],
		needsConfirmation: true,
	};
}

export function mockPlan(input: string): AgentPlan {
	const lower = input.toLowerCase();
	if (lower.includes("play")) {
		return {
			complexity: "simple",
			reasoning: "用户想要播放时间线",
			steps: [
				{
					tool: "playback_play",
					params: {},
					description: "开始播放",
					risk: "none",
				},
			],
			needsConfirmation: false,
		};
	}
	if (lower.includes("pause") || lower.includes("stop")) {
		return {
			complexity: "simple",
			reasoning: "用户想要暂停播放",
			steps: [
				{
					tool: "playback_pause",
					params: {},
					description: "暂停播放",
					risk: "none",
				},
			],
			needsConfirmation: false,
		};
	}
	if (lower.includes("summary") || lower.includes("status")) {
		return {
			complexity: "simple",
			reasoning: "用户想要时间线摘要",
			steps: [
				{
					tool: "timeline_get_summary",
					params: {},
					description: "获取时间线摘要",
					risk: "none",
				},
			],
			needsConfirmation: false,
		};
	}
	return {
		complexity: "medium",
		reasoning: "意图不明确，需要进一步确认",
		steps: [],
		needsConfirmation: true,
	};
}
