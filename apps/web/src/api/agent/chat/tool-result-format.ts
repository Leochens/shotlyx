import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
		parts.push(
			"You may retry with corrected parameters or try a different approach.",
		);
		return parts.join("\n");
	}

	const data = "data" in r ? r.data : modelResult;
	if (
		toolName === "vision_analyze_media" &&
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
		toolName === "vision_analyze_media" &&
		isRecord(data) &&
		data.analysisMissing === true
	) {
		return [
			`Tool "${toolName}" did not return usable visual analysis content.`,
			typeof data.message === "string"
				? data.message
				: "视觉分析没有返回可用内容。",
			"Do not claim the video has been analyzed. Retry once with adjusted visual parameters, or ask the user to split/compress/upload a smaller clip if the provider limit is the blocker.",
		].join("\n");
	}

	const verified =
		typeof r.verified === "boolean" ? ` (verified: ${r.verified})` : "";
	return typeof data === "string"
		? `${data}${verified}`
		: `${JSON.stringify(data)}${verified}`;
}
