import type { ModelMessage } from "ai";

const MAX_TOOL_RESULT_CONTINUATION_DEPTH = 1;

function formatContinuationToolResult(result: unknown): string {
	if (typeof result === "string") return result;
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}

const NO_AUTOMATIC_VISION_RETRY_MARKERS = [
	"Do not call vision_analyze_image again automatically.",
	"Do not call vision_analyze_video again automatically.",
	"Do not call vision_analyze_media again automatically.",
	"Do not call shotlyx_generate_mg_component again automatically.",
	"Do not call shotlyx_generate_mg_composition again automatically.",
];

function hasNoAutomaticRetryToolResult(results: unknown[]): boolean {
	return results.some((result) =>
		NO_AUTOMATIC_VISION_RETRY_MARKERS.some((marker) =>
			formatContinuationToolResult(result).includes(marker),
		),
	);
}

export function shouldRunToolResultContinuation({
	assistantText,
	toolCallCount,
	formattedToolResults,
	continuationDepth,
}: {
	assistantText: string;
	toolCallCount: number;
	formattedToolResults: unknown[];
	continuationDepth: number;
}): boolean {
	return (
		continuationDepth < MAX_TOOL_RESULT_CONTINUATION_DEPTH &&
		toolCallCount > 0 &&
		formattedToolResults.length > 0 &&
		assistantText.trim().length === 0 &&
		!hasNoAutomaticRetryToolResult(formattedToolResults)
	);
}

export function buildToolResultContinuationMessages({
	messages,
	formattedToolResults,
}: {
	messages: ModelMessage[];
	formattedToolResults: unknown[];
}): ModelMessage[] {
	const toolResultText = formattedToolResults
		.map((result, index) => {
			return `Result ${index + 1}:\n${formatContinuationToolResult(result)}`;
		})
		.join("\n\n");
	const hasNoAutomaticRetry =
		hasNoAutomaticRetryToolResult(formattedToolResults);

	return [
		...messages,
		{
			role: "user",
			content: [
				"[Tool Result Continuation]",
				"The previous assistant turn called tools but did not produce a final response after the tool results arrived.",
				"Continue autonomously from these tool results now.",
				hasNoAutomaticRetry
					? "Do not call the same tool again automatically. If the result says to wait or ask the user, provide that concise user-facing response without invoking another tool."
					: "If a tool failed, inspect the failure, retry with corrected parameters when possible, or choose an available alternative tool.",
				"If a tool result says the user must choose an option, ask the user to choose that option in one concise question.",
				"Do not claim the requested work is complete unless the tool result contains the actual requested output or verified edit.",
				"",
				toolResultText,
				"[/Tool Result Continuation]",
			].join("\n"),
		},
	];
}
