function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValueKey(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableValueKey(item)).join(",")}]`;
	}
	if (isRecord(value)) {
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableValueKey(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function buildVisionAnalysisDedupeKey(params: Record<string, unknown>): string {
	return stableValueKey({
		mediaAssetId: params.mediaAssetId,
		analysisType: params.analysisType,
		prompt: params.prompt,
		detail: params.detail,
		fps: params.fps,
		maxLongSidePixel: params.maxLongSidePixel,
	});
}

const VISION_ANALYSIS_TOOL_NAMES = new Set([
	"vision_analyze_image",
	"vision_analyze_video",
	"vision_analyze_media",
]);

export function shouldSuppressDuplicateToolCall({
	seen,
	toolName,
	params,
}: {
	seen: Set<string>;
	toolName: string;
	params: Record<string, unknown>;
}): boolean {
	if (!VISION_ANALYSIS_TOOL_NAMES.has(toolName)) return false;
	const key = `${toolName}:${buildVisionAnalysisDedupeKey(params)}`;
	if (seen.has(key)) return true;
	seen.add(key);
	return false;
}
