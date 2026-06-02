const DEFAULT_TOOL_RESULT_TIMEOUT_MS = 120_000;
const VISION_TOOL_RESULT_TIMEOUT_MS = 10 * 60_000;

export function getToolResultTimeoutMs(toolName: string): number {
	return toolName === "vision_analyze_media"
		? VISION_TOOL_RESULT_TIMEOUT_MS
		: DEFAULT_TOOL_RESULT_TIMEOUT_MS;
}
