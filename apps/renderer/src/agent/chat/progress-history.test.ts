import { describe, expect, test } from "bun:test";
import type { ToolProgressRecord } from "@/agent/controller/types";
import type { ToolProgressEvent } from "@/agent/mcp/types";

const { appendToolProgressEvent, MAX_TOOL_PROGRESS_EVENTS } =
	await import("./progress-history");

function buildEvent(index: number): ToolProgressEvent {
	return {
		stage: `stage-${index}`,
		label: `Step ${index}`,
		status: "running",
		current: index,
		total: 1_000,
	};
}

describe("appendToolProgressEvent", () => {
	test("keeps progress history bounded while preserving the newest event", () => {
		let progress: ToolProgressRecord[] = [];
		for (let index = 0; index < MAX_TOOL_PROGRESS_EVENTS + 10; index += 1) {
			progress = appendToolProgressEvent({
				progress,
				event: buildEvent(index),
				timestamp: index,
			});
		}

		expect(progress).toHaveLength(MAX_TOOL_PROGRESS_EVENTS);
		expect(progress[0]?.stage).toBe("stage-10");
		expect(progress.at(-1)?.stage).toBe(
			`stage-${MAX_TOOL_PROGRESS_EVENTS + 9}`,
		);
	});

	test("ignores exact duplicate progress updates", () => {
		const event = buildEvent(1);
		const progress = appendToolProgressEvent({
			progress: [],
			event,
			timestamp: 1,
		});
		const nextProgress = appendToolProgressEvent({
			progress,
			event,
			timestamp: 2,
		});

		expect(nextProgress).toBe(progress);
		expect(nextProgress).toHaveLength(1);
		expect(nextProgress[0]?.timestamp).toBe(1);
	});
});
