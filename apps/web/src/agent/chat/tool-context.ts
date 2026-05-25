import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import type { ToolCallRecord } from "@/agent/controller/types";

const CONTEXT_TOOL_NAMES = new Set([
	"silence_analyze_timeline",
	"rough_cut_create_review",
]);
const MAX_CONTEXT_TOOL_CALLS = 4;

export function buildToolResultContext({
	toolCalls,
}: {
	toolCalls?: ToolCallRecord[];
}): string {
	const relevantToolCalls = (toolCalls ?? [])
		.filter(
			(toolCall) =>
				CONTEXT_TOOL_NAMES.has(toolCall.tool) && toolCall.result !== undefined,
		)
		.slice(-MAX_CONTEXT_TOOL_CALLS);

	if (relevantToolCalls.length === 0) return "";

	const entries = relevantToolCalls.map((toolCall) => ({
		tool: toolCall.tool,
		params: toolCall.params,
		result: sanitizeToolResultForModel({
			toolName: toolCall.tool,
			result: toolCall.result,
		}),
	}));

	return `\n\n[Recent Tool Results]\n${JSON.stringify(entries)}\n[/Recent Tool Results]`;
}
