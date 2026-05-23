import type { ToolCallRecord } from "@/agent/controller/types";

const MAX_SUMMARY_LENGTH = 420;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactText({
	value,
	maxLength = MAX_SUMMARY_LENGTH,
}: {
	value: string;
	maxLength?: number;
}): string {
	const compacted = value.replace(/\s+/g, " ").trim();
	if (compacted.length <= maxLength) return compacted;
	return `${compacted.slice(0, maxLength)}...`;
}

function safeJson({
	value,
	maxLength = MAX_SUMMARY_LENGTH,
}: {
	value: unknown;
	maxLength?: number;
}): string {
	try {
		const serialized = JSON.stringify(value);
		if (serialized !== undefined) {
			return compactText({ value: serialized, maxLength });
		}
	} catch {
		// Fall back to String below for non-serializable values.
	}
	return compactText({ value: String(value), maxLength });
}

function getStringField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): string | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "string" ? nextValue : undefined;
}

function formatProvider(value: string): string {
	return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function summarizeCandidateProviders(
	candidates: unknown[],
): string | undefined {
	const providers = [
		...new Set(
			candidates
				.map((candidate) =>
					getStringField({ value: candidate, key: "provider" }),
				)
				.filter((provider): provider is string => Boolean(provider)),
		),
	];
	const types = [
		...new Set(
			candidates
				.map((candidate) => getStringField({ value: candidate, key: "type" }))
				.filter((type): type is string => Boolean(type)),
		),
	];
	const parts = [
		providers.length > 0 ? providers.map(formatProvider).join("/") : null,
		types.length > 0 ? types.join("/") : null,
	].filter(Boolean);
	return parts.length > 0 ? `（${parts.join(" · ")}）` : undefined;
}

function summarizeStockSearchResult(data: unknown): string {
	if (!isRecord(data)) return safeJson({ value: data });
	const candidates = Array.isArray(data.candidates) ? data.candidates : [];
	const message = getStringField({ value: data, key: "message" });
	if (candidates.length === 0) return message ?? "没有找到候选";
	const providerSummary = summarizeCandidateProviders(candidates);
	const suffix = message ? `；${message}` : "";
	return `找到 ${candidates.length} 个候选${providerSummary ?? ""}${suffix}`;
}

function summarizeImportResult(data: unknown): string {
	if (!isRecord(data)) return safeJson({ value: data });
	const name =
		getStringField({ value: data, key: "name" }) ??
		getStringField({ value: data, key: "title" }) ??
		getStringField({ value: data, key: "mediaAssetId" }) ??
		getStringField({ value: data, key: "id" });
	const mediaAssetId = getStringField({ value: data, key: "mediaAssetId" });
	if (name && mediaAssetId && name !== mediaAssetId) {
		return `已导入 ${name} (${mediaAssetId})`;
	}
	if (name) return `已导入 ${name}`;
	return safeJson({ value: data });
}

function summarizeToolResultData({
	tool,
	data,
}: {
	tool: string;
	data: unknown;
}): string {
	if (data === undefined || data === null) return "";
	if (
		typeof data === "string" ||
		typeof data === "number" ||
		typeof data === "boolean"
	) {
		if (tool === "timeline_add_track" && typeof data === "string") {
			return `新建轨道 ${data}`;
		}
		return compactText({ value: String(data) });
	}

	if (tool === "stock_search_media") return summarizeStockSearchResult(data);
	if (
		tool === "stock_import_media" ||
		tool === "creative_import_asset" ||
		tool === "media_import"
	) {
		return summarizeImportResult(data);
	}

	if (tool === "creative_generate_image" && isRecord(data)) {
		const images = Array.isArray(data.images) ? data.images : undefined;
		if (images) return `生成 ${images.length} 张图片`;
	}

	if (isRecord(data)) {
		const message = getStringField({ value: data, key: "message" });
		if (message) return message;
	}

	return safeJson({ value: data });
}

export function formatToolCallForCopy(toolCall: ToolCallRecord): string {
	const params = safeJson({ value: toolCall.params });
	if (!toolCall.result) return `  工具: ${toolCall.tool}(${params})`;

	const statusMark = toolCall.result.status === "success" ? "✓" : "✗";
	const resultText =
		toolCall.result.status === "success"
			? summarizeToolResultData({
					tool: toolCall.tool,
					data: toolCall.result.data,
				})
			: compactText({ value: toolCall.result.error ?? "" });

	return `  工具: ${toolCall.tool}(${params}) → ${statusMark}${
		resultText ? ` ${resultText}` : ""
	}`;
}
