const MAX_MODEL_STRING_LENGTH = 800;
const MAX_MODEL_ARRAY_ITEMS = 20;
const MAX_WEB_FETCH_CONTENT_LENGTH = 6000;
const MAX_WEB_SEARCH_SNIPPET_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactStringForModel(value: string): string {
	if (value.startsWith("data:")) {
		const mime = value.slice(0, value.indexOf(";"));
		return `[omitted ${mime || "data URL"}]`;
	}
	if (value.length <= MAX_MODEL_STRING_LENGTH) return value;
	return `${value.slice(0, MAX_MODEL_STRING_LENGTH)}... [truncated ${value.length} chars]`;
}

function compactValueForModel(value: unknown): unknown {
	if (typeof value === "string") return compactStringForModel(value);
	if (Array.isArray(value)) {
		return value
			.slice(0, MAX_MODEL_ARRAY_ITEMS)
			.map((item) => compactValueForModel(item));
	}
	if (!isRecord(value)) return value;

	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [
			key,
			compactValueForModel(item),
		]),
	);
}

function compactGeneratedImageForModel(
	image: unknown,
): Record<string, unknown> {
	if (!isRecord(image)) return {};

	return {
		id: image.id,
		title: image.title,
		name: image.name,
		sizeBytes: image.sizeBytes,
		width: image.width,
		height: image.height,
		mediaAssetId: image.mediaAssetId,
		imported: image.imported,
	};
}

function compactStockCandidateForModel(
	candidate: unknown,
): Record<string, unknown> {
	if (!isRecord(candidate)) return {};

	const author = isRecord(candidate.author) ? candidate.author : {};
	const license = isRecord(candidate.license) ? candidate.license : {};

	return {
		id: candidate.id,
		title: candidate.title,
		provider: candidate.provider,
		type: candidate.type,
		width: candidate.width,
		height: candidate.height,
		durationSeconds: candidate.durationSeconds,
		author: typeof author.name === "string" ? { name: author.name } : undefined,
		license: {
			name: license.name,
			commercialUse: license.commercialUse,
			attributionRequired: license.attributionRequired,
			derivativesAllowed: license.derivativesAllowed,
		},
		mediaAssetId: candidate.mediaAssetId,
	};
}

function compactTextToLength({
	value,
	maxLength,
}: {
	value: unknown;
	maxLength: number;
}): unknown {
	if (typeof value !== "string") return value;
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}... [truncated ${value.length} chars]`;
}

function compactWebSearchResultForModel(
	result: unknown,
): Record<string, unknown> {
	if (!isRecord(result)) return {};
	return {
		title: result.title,
		url: result.url,
		snippet: compactTextToLength({
			value: result.snippet,
			maxLength: MAX_WEB_SEARCH_SNIPPET_LENGTH,
		}),
		publishedDate: result.publishedDate,
		score: result.score,
		source: result.source,
	};
}

function compactWebFetchForModel(data: unknown): Record<string, unknown> {
	if (!isRecord(data)) return {};
	return {
		provider: data.provider,
		url: data.url,
		title: data.title,
		content: compactTextToLength({
			value: data.content,
			maxLength: MAX_WEB_FETCH_CONTENT_LENGTH,
		}),
		truncated: data.truncated,
		contentLength: data.contentLength,
		fetchedAt: data.fetchedAt,
		instruction:
			"Use this fetched page content as source text. If more detail is needed and truncated is true, call web_fetch again with a higher maxCharacters value.",
	};
}

function compactSilenceAnalysisForModel(data: unknown): Record<string, unknown> {
	if (!isRecord(data)) return {};
	return {
		planId: data.planId,
		analyzedClipCount: data.analyzedClipCount,
		targetCount: data.targetCount,
		segmentCount: data.segmentCount,
		totalSilenceSeconds: data.totalSilenceSeconds,
		options: data.options,
		targets: compactValueForModel(data.targets),
		truncated: data.truncated,
		message: data.message,
		instruction:
			"If segmentCount > 0 and the user confirmed or asked to apply directly, call silence_apply_cut_plan with this planId. If segmentCount is 0, do not apply.",
	};
}

export function sanitizeToolResultForModel({
	toolName,
	result,
}: {
	toolName: string;
	result: unknown;
}): unknown {
	if (!isRecord(result)) return compactValueForModel(result);

	const status = result.status;
	if (status === "error") {
		return {
			status,
			error: result.error,
			errorCategory: result.errorCategory,
			suggestion: result.suggestion,
			verified: result.verified,
		};
	}

	if (toolName !== "creative_generate_image") {
		if (toolName === "stock_search_media") {
			const data = isRecord(result.data) ? result.data : {};
			const candidates = Array.isArray(data.candidates) ? data.candidates : [];
			return {
				status,
				verified: result.verified,
				data: {
					ui: "stock_media_cards",
					message: data.message,
					candidates: candidates.map((candidate) =>
						compactStockCandidateForModel(candidate),
					),
					instruction:
						"候选素材已经由 UI 渲染为资源卡片。不要用 Markdown 复述候选列表；需要导入时使用候选 id 调用 stock_import_media。",
				},
			};
		}
		if (toolName === "web_search") {
			const data = isRecord(result.data) ? result.data : {};
			const results = Array.isArray(data.results) ? data.results : [];
			return {
				status,
				verified: result.verified,
				data: {
					provider: data.provider,
					query: data.query,
					answer: compactTextToLength({
						value: data.answer,
						maxLength: MAX_WEB_SEARCH_SNIPPET_LENGTH,
					}),
					results: results.map((item) =>
						compactWebSearchResultForModel(item),
					),
					message: data.message,
					instruction:
						"Use web_fetch on promising result URLs before relying on exact page details.",
				},
			};
		}
		if (toolName === "web_fetch") {
			const data = isRecord(result.data) ? result.data : {};
			return {
				status,
				verified: result.verified,
				data: compactWebFetchForModel(data),
			};
		}
		if (toolName === "silence_analyze_timeline") {
			const data = isRecord(result.data) ? result.data : {};
			return {
				status,
				verified: result.verified,
				data: compactSilenceAnalysisForModel(data),
			};
		}
		return compactValueForModel(result);
	}

	const data = isRecord(result.data) ? result.data : {};
	const images = Array.isArray(data.images) ? data.images : [];

	return {
		status,
		verified: result.verified,
		data: {
			images: images.map((image) => compactGeneratedImageForModel(image)),
		},
	};
}
