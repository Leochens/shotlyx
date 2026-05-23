import type { AgentStep } from "./types";

const PREVIEW_SAFE_TOOLS = [
	"creative_search_video",
	"stock_search_media",
	"creative_generate_image",
	"silence_analyze_timeline",
] as const;

export function isPreviewSafeTool(toolName: string): boolean {
	return PREVIEW_SAFE_TOOLS.some((name) => name === toolName);
}

export function isPreviewSafeCreativeTool(toolName: string): boolean {
	return isPreviewSafeTool(toolName);
}

export function splitPreviewSafeSteps({
	steps,
}: {
	steps: AgentStep[];
}): {
	previewSteps: AgentStep[];
	remainingSteps: AgentStep[];
} {
	const previewSteps: AgentStep[] = [];
	const remainingSteps: AgentStep[] = [];
	let reachedNonPreviewStep = false;

	for (const step of steps) {
		if (!reachedNonPreviewStep && isPreviewSafeTool(step.tool)) {
			previewSteps.push(step);
			continue;
		}

		reachedNonPreviewStep = true;
		remainingSteps.push(step);
	}

	return {
		previewSteps,
		remainingSteps,
	};
}
