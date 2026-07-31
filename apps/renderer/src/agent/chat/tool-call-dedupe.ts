import type { ToolCallRecord } from "@/agent/controller/types";
import type { ToolResult } from "@/agent/mcp/types";

type JsonLike =
	| string
	| number
	| boolean
	| null
	| JsonLike[]
	| { [key: string]: JsonLike };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeForSignature(value: unknown): JsonLike {
	if (value === null) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((item) => normalizeForSignature(item));
	}
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.filter((key) => value[key] !== undefined)
				.map((key) => [key, normalizeForSignature(value[key])]),
		);
	}
	return String(value);
}

export function getToolCallSignature({
	tool,
	params,
}: {
	tool: string;
	params: Record<string, unknown>;
}): string {
	return JSON.stringify({
		tool,
		params: normalizeForSignature(params),
	});
}

export function findSuppressibleDuplicateToolCall({
	existingToolCalls,
	tool,
	params,
}: {
	existingToolCalls: ToolCallRecord[];
	tool: string;
	params: Record<string, unknown>;
}): ToolCallRecord | null {
	const signature = getToolCallSignature({ tool, params });
	return (
		existingToolCalls.find((toolCall) => {
			if (toolCall.result?.status === "error") return false;
			return (
				getToolCallSignature({
					tool: toolCall.tool,
					params: toolCall.params,
				}) === signature
			);
		}) ?? null
	);
}

export function buildDuplicateToolCallResult({
	duplicate,
}: {
	duplicate: ToolCallRecord;
}): ToolResult {
	const isCompleted = duplicate.result?.status === "success";
	return {
		status: "success",
		verified: true,
		data: {
			skipped: true,
			reason: isCompleted
				? "duplicate_tool_call_completed"
				: "duplicate_tool_call_running",
			originalCallId: duplicate.callId,
			message: isCompleted
				? "已跳过重复工具调用；相同工具和参数已经成功执行。"
				: "已跳过重复工具调用；相同工具和参数仍在执行中。",
			instruction:
				"Do not call this tool again with the same parameters unless the previous result is an error and the tool result explicitly indicates retry is appropriate.",
		},
	};
}
