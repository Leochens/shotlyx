import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import {
	isMGGenerationTool,
	isVisionAnalysisTool,
	requiresExplicitToolRetry,
} from "./tool-timeouts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatVerificationEvidence(result: Record<string, unknown>): string {
	const parts: string[] = [];
	if (typeof result.verified === "boolean") {
		parts.push(`verified: ${result.verified}`);
	}
	const verification = isRecord(result.verification)
		? result.verification
		: null;
	const expectation = isRecord(verification?.expectation)
		? verification.expectation
		: null;
	if (typeof expectation?.description === "string") {
		parts.push(
			`expectation: ${expectation.description} (${expectation.satisfied === true ? "satisfied" : "not satisfied"})`,
		);
	}
	const changes = Array.isArray(verification?.changes)
		? verification.changes
		: [];
	const changeSummary = changes.slice(0, 8).flatMap((change) => {
		if (!isRecord(change)) return [];
		if (typeof change.type !== "string" || typeof change.target !== "string") {
			return [];
		}
		return [
			`${change.type} ${change.target}${typeof change.detail === "string" ? ` ${change.detail}` : ""}`,
		];
	});
	if (changeSummary.length > 0) {
		parts.push(`changes: ${changeSummary.join(", ")}`);
	}
	return parts.length > 0 ? ` (${parts.join("; ")})` : "";
}

function formatChoiceOptions(options: unknown): string {
	if (!Array.isArray(options)) return "";
	return options
		.map((option) => {
			if (!isRecord(option)) return null;
			const label = typeof option.label === "string" ? option.label : null;
			const description =
				typeof option.description === "string" ? option.description : null;
			if (!label) return null;
			return description ? `- ${label}: ${description}` : `- ${label}`;
		})
		.filter((line): line is string => Boolean(line))
		.join("\n");
}

function buildVisionRetryInstruction(toolName: string): string {
	if (toolName === "vision_analyze_image") {
		return "Ask the user whether to retry with lower detail or a smaller image before trying again.";
	}
	return "Ask the user whether to keep waiting, retry with lower detail/fps, or split/compress the video before trying again.";
}

export function formatToolResultForModel({
	toolName,
	result,
}: {
	toolName: string;
	result: unknown;
}): unknown {
	const modelResult = sanitizeToolResultForModel({
		toolName,
		result,
	});
	const r = isRecord(modelResult) ? modelResult : {};

	if (r.status === "error") {
		const parts: string[] = [
			`Tool "${toolName}" failed: ${
				typeof r.error === "string" ? r.error : "unknown error"
			}`,
		];
		if (typeof r.errorCategory === "string") {
			parts.push(`Category: ${r.errorCategory}`);
		}
		if (typeof r.suggestion === "string") {
			parts.push(`Suggestion: ${r.suggestion}`);
		}
		if (requiresExplicitToolRetry(toolName)) {
			parts.push(
				`Do not call ${toolName} again automatically.`,
				isMGGenerationTool(toolName)
					? "Report the MG generation failure and ask the user before starting another full generation."
					: buildVisionRetryInstruction(toolName),
			);
			return parts.join("\n");
		}
		parts.push(
			"You may retry with corrected parameters or try a different approach.",
		);
		return parts.join("\n");
	}

	const data = "data" in r ? r.data : modelResult;
	if (
		isVisionAnalysisTool(toolName) &&
		isRecord(data) &&
		data.requiresUserChoice === true
	) {
		const message =
			typeof data.message === "string"
				? data.message
				: "视频超过 MiniMax M3 单次媒体限制。";
		const options = formatChoiceOptions(data.options);
		return [
			`Tool "${toolName}" cannot continue automatically because this video exceeds MiniMax M3's per-media size limit.`,
			message,
			"Do not claim the video has been analyzed. Ask the user to choose one option before continuing:",
			options,
		]
			.filter((line) => line.length > 0)
			.join("\n");
	}

	if (
		isVisionAnalysisTool(toolName) &&
		isRecord(data) &&
		data.analysisMissing === true
	) {
		return [
			`Tool "${toolName}" did not return usable visual analysis content.`,
			typeof data.message === "string"
				? data.message
				: "视觉分析没有返回可用内容。",
			`Do not claim the media has been analyzed. Do not call ${toolName} again automatically. ${buildVisionRetryInstruction(toolName)}`,
		].join("\n");
	}

	const verificationEvidence = formatVerificationEvidence(r);
	return typeof data === "string"
		? `${data}${verificationEvidence}`
		: `${JSON.stringify(data)}${verificationEvidence}`;
}
