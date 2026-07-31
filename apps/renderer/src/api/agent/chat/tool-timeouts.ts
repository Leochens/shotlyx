const DEFAULT_TOOL_RESULT_TIMEOUT_MS = 120_000;
const VISION_TOOL_RESULT_TIMEOUT_MS = 10 * 60_000;
const VISION_ANALYSIS_TOOL_NAMES = new Set([
	"vision_analyze_image",
	"vision_analyze_video",
	"vision_analyze_media",
]);

export function getToolResultTimeoutMs(toolName: string): number {
	return VISION_ANALYSIS_TOOL_NAMES.has(toolName)
		? VISION_TOOL_RESULT_TIMEOUT_MS
		: DEFAULT_TOOL_RESULT_TIMEOUT_MS;
}
