const DEFAULT_TOOL_RESULT_TIMEOUT_MS = 120_000;
const MG_GENERATION_TOOL_RESULT_TIMEOUT_MS = 4 * 60_000;
const VISION_TOOL_RESULT_TIMEOUT_MS = 10 * 60_000;
const VISION_ANALYSIS_TOOL_NAMES = new Set([
	"vision_analyze_image",
	"vision_analyze_video",
	"vision_analyze_media",
]);
const MG_GENERATION_TOOL_NAMES = new Set([
	"shotlyx_generate_mg_component",
	"shotlyx_generate_mg_composition",
]);

export function isVisionAnalysisTool(toolName: string): boolean {
	return VISION_ANALYSIS_TOOL_NAMES.has(toolName);
}

export function isMGGenerationTool(toolName: string): boolean {
	return MG_GENERATION_TOOL_NAMES.has(toolName);
}

export function requiresExplicitToolRetry(toolName: string): boolean {
	return isVisionAnalysisTool(toolName) || isMGGenerationTool(toolName);
}

export function getToolResultTimeoutMs(toolName: string): number {
	if (isVisionAnalysisTool(toolName)) return VISION_TOOL_RESULT_TIMEOUT_MS;
	if (isMGGenerationTool(toolName)) return MG_GENERATION_TOOL_RESULT_TIMEOUT_MS;
	return DEFAULT_TOOL_RESULT_TIMEOUT_MS;
}
