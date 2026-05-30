import type { ToolProgressRecord } from "@/agent/controller/types";
import type { ToolProgressEvent } from "@/agent/mcp/types";

export const MAX_TOOL_PROGRESS_EVENTS = 120;

function isSameProgressEvent({
	left,
	right,
}: {
	left: ToolProgressRecord;
	right: ToolProgressEvent;
}): boolean {
	return (
		left.stage === right.stage &&
		left.label === right.label &&
		left.status === right.status &&
		left.detail === right.detail &&
		left.current === right.current &&
		left.total === right.total &&
		left.jobId === right.jobId &&
		left.taskId === right.taskId &&
		left.taskLabel === right.taskLabel &&
		left.taskIndex === right.taskIndex
	);
}

export function appendToolProgressEvent({
	progress,
	event,
	timestamp = Date.now(),
	maxEvents = MAX_TOOL_PROGRESS_EVENTS,
}: {
	progress: ToolProgressRecord[];
	event: ToolProgressEvent;
	timestamp?: number;
	maxEvents?: number;
}): ToolProgressRecord[] {
	if (
		progress.some((existingEvent) =>
			isSameProgressEvent({ left: existingEvent, right: event }),
		)
	) {
		return progress;
	}

	const nextProgress = [...progress, { ...event, timestamp }];
	if (nextProgress.length <= maxEvents) {
		return nextProgress;
	}

	return nextProgress.slice(nextProgress.length - maxEvents);
}
