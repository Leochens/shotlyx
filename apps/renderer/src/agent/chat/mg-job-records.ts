import type { AgentMessage, ToolCallRecord } from "@/agent/controller/types";

export interface ShotlyxMGJobToolData {
	jobId: string;
	insertToTimeline: boolean;
	startTimeSeconds: number;
	sourcePrompt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getLatestToolProgress(toolCall: ToolCallRecord) {
	const progress = toolCall.progress ?? [];
	return progress[progress.length - 1];
}

export function getShotlyxMGJobIdFromToolCall({
	toolCall,
}: {
	toolCall: ToolCallRecord;
}): string | null {
	if (toolCall.result?.status !== "success" || !isRecord(toolCall.result.data)) {
		return null;
	}
	if (
		toolCall.result.data.runtime !== "shotlyx-mg-job-v1" ||
		toolCall.result.data.status !== "running" ||
		typeof toolCall.result.data.jobId !== "string"
	) {
		return null;
	}
	return toolCall.result.data.jobId;
}

export function getShotlyxMGJobDataFromToolCall({
	toolCall,
}: {
	toolCall: ToolCallRecord;
}): ShotlyxMGJobToolData | null {
	const jobId = getShotlyxMGJobIdFromToolCall({ toolCall });
	if (!jobId || !isRecord(toolCall.result?.data)) return null;
	const startTimeSeconds = toolCall.result.data.startTimeSeconds;
	const sourcePrompt = toolCall.params.prompt;
	return {
		jobId,
		insertToTimeline: toolCall.result.data.inserted === true,
		startTimeSeconds:
			typeof startTimeSeconds === "number" && Number.isFinite(startTimeSeconds)
				? startTimeSeconds
				: 0,
		sourcePrompt:
			typeof sourcePrompt === "string" && sourcePrompt.trim()
				? sourcePrompt
				: "Shotlyx MG",
	};
}

export function isTerminalShotlyxMGProgress(toolCall: ToolCallRecord): boolean {
	const latestProgress = getLatestToolProgress(toolCall);
	return (
		latestProgress?.status === "error" ||
		latestProgress?.stage === "completed" ||
		latestProgress?.stage === "complete" ||
		latestProgress?.stage === "cancelled"
	);
}

export function isRunningShotlyxMGToolCall(
	toolCall: ToolCallRecord,
): boolean {
	return (
		getShotlyxMGJobIdFromToolCall({ toolCall }) !== null &&
		!isTerminalShotlyxMGProgress(toolCall)
	);
}

export function getRunningShotlyxMGJobIdsFromMessages({
	messages,
}: {
	messages: AgentMessage[];
}): string[] {
	const jobIds = new Set<string>();
	for (const message of messages) {
		for (const toolCall of message.toolCalls ?? []) {
			if (!isRunningShotlyxMGToolCall(toolCall)) continue;
			const jobId = getShotlyxMGJobIdFromToolCall({ toolCall });
			if (jobId) {
				jobIds.add(jobId);
			}
		}
	}
	return [...jobIds];
}
