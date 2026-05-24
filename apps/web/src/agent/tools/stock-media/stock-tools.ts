import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { Tool } from "@/agent/mcp/types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireStringParam,
} from "@/agent/mcp/validation";
import type {
	ExternalMediaSource,
	ExternalMediaSourceLicense,
} from "@/services/storage/types";
import type { ParamValues } from "@/params";
import type { CreateTimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import { isRecord } from "./providers/helpers";
import {
	getStockAsset,
	registerStockAsset,
} from "./stock-asset-store";
import type {
	StockAsset,
	StockAssetInput,
	StockMediaProviderId,
	StockMediaType,
} from "./types";
import {
	LICENSE_POLICIES,
	STOCK_MEDIA_PROVIDERS,
	STOCK_MEDIA_TYPES,
	STOCK_ORIENTATIONS,
	STOCK_RESOLUTIONS,
} from "./types";

type ProcessMediaAssetsFn = (input: {
	files: File[];
}) => Promise<Array<Omit<MediaAsset, "id">>>;

export interface StockMediaToolDeps {
	fetchFn: typeof fetch;
	processMediaAssetsFn: ProcessMediaAssetsFn;
	mediaTimeFromSecondsFn: (input: { seconds: number }) => MediaTime;
}

export interface ImportedStockAssetResult {
	mediaAssetId: string;
	name: string;
	type: StockMediaType;
	title: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
	previewUrl?: string;
	thumbnailUrl?: string;
	sourceUrl: string;
	author?: StockAsset["author"];
	license: ExternalMediaSourceLicense;
	alreadyImported: boolean;
	durationSeconds?: number;
}

async function defaultProcessMediaAssetsFn(input: { files: File[] }) {
	const { processMediaAssets } = await import("@/media/processing");
	return processMediaAssets(input);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ZERO_STOCK_MEDIA_TIME = 0 as MediaTime;

function defaultMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}

function requireEnumValue<T extends string>({
	value,
	key,
	allowed,
}: {
	value: unknown;
	key: string;
	allowed: readonly T[];
}): T {
	const match = typeof value === "string"
		? allowed.find((item) => item === value)
		: undefined;
	if (!match) {
		throw new Error(
			`类型不匹配："${key}" 必须为以下之一：${allowed.join(", ")}`,
		);
	}
	return match;
}

function optionalEnumValue<T extends string>({
	params,
	key,
	allowed,
}: {
	params: Record<string, unknown>;
	key: string;
	allowed: readonly T[];
}): T | undefined {
	const value = optionalStringParam(params, key);
	if (value === undefined) return undefined;
	return requireEnumValue({ value, key, allowed });
}

function optionalProviderList(
	params: Record<string, unknown>,
): StockMediaProviderId[] | undefined {
	const value = params.providers;
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error('类型不匹配："providers" 必须为数组');
	}
	return value.map((item) =>
		requireEnumValue({
			value: item,
			key: "providers",
			allowed: STOCK_MEDIA_PROVIDERS,
		}),
	);
}

function optionalDurationSeconds(params: Record<string, unknown>):
	| {
			min?: number;
			max?: number;
	  }
	| undefined {
	const value = params.durationSeconds;
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		throw new Error('类型不匹配："durationSeconds" 必须为对象');
	}
	const min = value.min;
	const max = value.max;
	if (min !== undefined && typeof min !== "number") {
		throw new Error('类型不匹配："durationSeconds.min" 必须为数字');
	}
	if (max !== undefined && typeof max !== "number") {
		throw new Error('类型不匹配："durationSeconds.max" 必须为数字');
	}
	return { min, max };
}

function normalizeCount(count?: number): number | undefined {
	if (count === undefined) return undefined;
	if (!Number.isInteger(count) || count < 1 || count > 20) {
		throw new Error('类型不匹配："count" 必须为 1 到 20 的整数');
	}
	return count;
}

async function readJsonError(response: Response): Promise<string> {
	try {
		const data: unknown = await response.json();
		return isRecord(data) && typeof data.error === "string"
			? data.error
			: `${response.status} ${response.statusText}`;
	} catch {
		return `${response.status} ${response.statusText}`;
	}
}

function parseStockAuthor(value: unknown): StockAssetInput["author"] {
	if (!isRecord(value)) return undefined;
	return {
		name: typeof value.name === "string" ? value.name : undefined,
		url: typeof value.url === "string" ? value.url : undefined,
	};
}

function isExternalMediaSourceLicense(
	value: unknown,
): value is ExternalMediaSourceLicense {
	if (!isRecord(value)) return false;
	if (
		typeof value.name !== "string" ||
		typeof value.attributionRequired !== "boolean" ||
		typeof value.sourceProvider !== "string" ||
		typeof value.sourceUrl !== "string" ||
		typeof value.verifiedAt !== "string"
	) {
		return false;
	}
	if (value.url !== undefined && typeof value.url !== "string") return false;
	if (
		value.commercialUse !== undefined &&
		typeof value.commercialUse !== "boolean"
	) {
		return false;
	}
	if (
		value.derivativesAllowed !== undefined &&
		typeof value.derivativesAllowed !== "boolean"
	) {
		return false;
	}
	return !(
		value.attributionText !== undefined &&
		typeof value.attributionText !== "string"
	);
}

function assertStockAssetInput(value: unknown): StockAssetInput {
	if (!isRecord(value)) {
		throw new Error("provider_error: invalid stock media candidate");
	}
	const provider = requireEnumValue({
		value: value.provider,
		key: "provider",
		allowed: STOCK_MEDIA_PROVIDERS,
	});
	const type = requireEnumValue({
		value: value.type,
		key: "type",
		allowed: STOCK_MEDIA_TYPES,
	});
	const providerAssetId = value.providerAssetId;
	const title = value.title;
	const previewUrl = value.previewUrl;
	const sourceUrl = value.sourceUrl;
	const license = value.license;
	if (
		typeof providerAssetId !== "string" ||
		typeof title !== "string" ||
		typeof previewUrl !== "string" ||
		typeof sourceUrl !== "string" ||
		!isExternalMediaSourceLicense(license)
	) {
		throw new Error("provider_error: invalid stock media candidate");
	}
	return {
		provider,
		providerAssetId,
		type,
		title,
		previewUrl,
		thumbnailUrl:
			typeof value.thumbnailUrl === "string" ? value.thumbnailUrl : undefined,
		downloadUrl:
			typeof value.downloadUrl === "string" ? value.downloadUrl : undefined,
		sourceUrl,
		width: typeof value.width === "number" ? value.width : undefined,
		height: typeof value.height === "number" ? value.height : undefined,
		durationSeconds:
			typeof value.durationSeconds === "number"
				? value.durationSeconds
				: undefined,
		author: parseStockAuthor(value.author),
		license,
	};
}

function parseStockSearchResponse(value: unknown): {
	candidates: unknown[];
	message?: string;
} {
	if (!isRecord(value) || !Array.isArray(value.candidates)) {
		return { candidates: [] };
	}
	return {
		candidates: value.candidates,
		message: typeof value.message === "string" ? value.message : undefined,
	};
}

function extensionFromContentType({
	contentType,
	type,
}: {
	contentType: string;
	type: StockMediaType;
}): string {
	if (contentType.includes("mp4")) return "mp4";
	if (contentType.includes("webm")) return "webm";
	if (contentType.includes("png")) return "png";
	if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
	if (type === "video") return "mp4";
	if (type === "image") return "png";
	return "bin";
}

function sanitizeFilenameBase(value: string): string {
	return [...value]
		.map((char) => (char.charCodeAt(0) < 32 ? "-" : char))
		.join("")
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80) || "stock-media";
}

function buildFilename({
	asset,
	contentType,
}: {
	asset: StockAsset;
	contentType: string;
}): string {
	return `${sanitizeFilenameBase(asset.title)}.${extensionFromContentType({
		contentType,
		type: asset.type,
	})}`;
}

function buildExternalSource(asset: StockAsset): ExternalMediaSource {
	return {
		provider: asset.provider,
		providerAssetId: asset.providerAssetId,
		sourceUrl: asset.sourceUrl,
		importedAt: new Date().toISOString(),
		author: asset.author,
		license: asset.license,
	};
}

async function importStockAsset({
	editor,
	asset,
	deps,
}: {
	editor: EditorCore;
	asset: StockAsset;
	deps: StockMediaToolDeps;
}): Promise<ImportedStockAssetResult> {
	if (asset.mediaAssetId) {
		return {
			mediaAssetId: asset.mediaAssetId,
			name: asset.name ?? asset.title,
			type: asset.type,
			title: asset.title,
			sizeBytes: asset.sizeBytes,
			width: asset.width,
			height: asset.height,
			previewUrl: asset.previewUrl,
			thumbnailUrl: asset.thumbnailUrl,
			sourceUrl: asset.sourceUrl,
			author: asset.author,
			license: asset.license,
			alreadyImported: true,
			durationSeconds: asset.durationSeconds,
		};
	}

	const project = editor.project.getActiveOrNull();
	if (!project) {
		throw new Error("状态错误：未加载项目，无法导入素材");
	}

	const response = await deps.fetchFn("/api/agent/stock/download", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ candidate: asset }),
	});
	if (!response.ok) {
		throw new Error(`provider_error: ${await readJsonError(response)}`);
	}

	const blob = await response.blob();
	const contentType = blob.type || response.headers.get("Content-Type") || "";
	const file = new File([blob], buildFilename({ asset, contentType }), {
		type: blob.type || contentType,
	});
	const processed = await deps.processMediaAssetsFn({ files: [file] });
	const mediaAsset = processed[0];
	if (!mediaAsset) {
		throw new Error("媒体处理失败：无法处理外部素材");
	}

	const result = await editor.media.addMediaAsset({
		projectId: project.metadata.id,
		asset: {
			...mediaAsset,
			externalSource: buildExternalSource(asset),
		},
	});
	if (!result) {
		throw new Error("媒体导入失败：保存外部素材时出错");
	}

	asset.mediaAssetId = result.id;
	asset.name = result.name;
	asset.sizeBytes = result.file.size;
	asset.width = result.width ?? asset.width;
	asset.height = result.height ?? asset.height;
	asset.previewUrl = result.url ?? asset.previewUrl;
	asset.thumbnailUrl = result.thumbnailUrl ?? asset.thumbnailUrl;

	return {
		mediaAssetId: result.id,
		name: result.name,
		type: asset.type,
		title: asset.title,
		sizeBytes: result.file.size,
		width: result.width,
		height: result.height,
		previewUrl: result.url,
		thumbnailUrl: result.thumbnailUrl,
		sourceUrl: asset.sourceUrl,
		author: asset.author,
		license: asset.license,
		alreadyImported: false,
		durationSeconds: result.duration,
	};
}

interface BrollSegmentInput {
	query: string;
	startTimeSeconds: number;
	durationSeconds?: number;
	orientation?: (typeof STOCK_ORIENTATIONS)[number];
}

interface InsertedBrollSegment {
	query: string;
	provider: StockAsset["provider"];
	title: string;
	mediaAssetId: string;
	sourceUrl: string;
	startTimeSeconds: number;
	durationSeconds: number;
	license: ExternalMediaSourceLicense;
}

interface SkippedBrollSegment {
	query: string;
	startTimeSeconds: number;
	reason: string;
}

function optionalBrollSegments(
	params: Record<string, unknown>,
): BrollSegmentInput[] | undefined {
	const value = params.segments;
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error('类型不匹配："segments" 必须为数组');
	}
	return value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`类型不匹配："segments[${index}]" 必须为对象`);
		}
		const query = item.query;
		const startTimeSeconds = item.startTimeSeconds;
		const durationSeconds = item.durationSeconds;
		if (typeof query !== "string" || query.length === 0) {
			throw new Error(`参数缺失："segments[${index}].query" 必须为非空字符串`);
		}
		if (typeof startTimeSeconds !== "number" || Number.isNaN(startTimeSeconds)) {
			throw new Error(`参数缺失："segments[${index}].startTimeSeconds" 必须为数字`);
		}
		if (
			durationSeconds !== undefined &&
			(typeof durationSeconds !== "number" || Number.isNaN(durationSeconds))
		) {
			throw new Error(`类型不匹配："segments[${index}].durationSeconds" 必须为数字`);
		}
		return {
			query,
			startTimeSeconds,
			durationSeconds,
			orientation:
				item.orientation === undefined
					? undefined
					: requireEnumValue({
							value: item.orientation,
							key: `segments[${index}].orientation`,
							allowed: STOCK_ORIENTATIONS,
						}),
		};
	});
}

function buildBrollSegments(params: Record<string, unknown>): BrollSegmentInput[] {
	const segments = optionalBrollSegments(params);
	if (segments?.length) return segments;

	const query =
		optionalStringParam(params, "query") ?? optionalStringParam(params, "script");
	if (!query) {
		throw new Error('参数缺失：需要提供 "segments"、"query" 或 "script"');
	}
	return [
		{
			query: query.slice(0, 160),
			startTimeSeconds: optionalNumberParam(params, "startTimeSeconds") ?? 0,
			durationSeconds: optionalNumberParam(params, "durationSeconds"),
		},
	];
}

function findOrCreateBrollTrack({
	editor,
	targetTrackId,
}: {
	editor: EditorCore;
	targetTrackId?: string;
}): string {
	if (targetTrackId) return targetTrackId;

	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		throw new Error("状态错误：未加载场景，无法插入 B-roll");
	}
	const overlayVideoTrack = scene.tracks.overlay.find(
		(track) => track.type === "video",
	);
	return overlayVideoTrack?.id ?? editor.timeline.addTrack({ type: "video" });
}

function buildVideoElement({
	mediaAssetId,
	name,
	startTimeSeconds,
	durationSeconds,
	mediaTimeFromSeconds,
}: {
	mediaAssetId: string;
	name: string;
	startTimeSeconds: number;
	durationSeconds: number;
	mediaTimeFromSeconds: (input: { seconds: number }) => MediaTime;
}): CreateTimelineElement {
	const params: ParamValues = {};
	return {
		name,
		type: "video",
		mediaId: mediaAssetId,
		startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
		duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
		trimStart: ZERO_STOCK_MEDIA_TIME,
		trimEnd: ZERO_STOCK_MEDIA_TIME,
		params,
	};
}

function pickUnusedCandidate({
	candidates,
	usedKeys,
}: {
	candidates: StockAsset[];
	usedKeys: Set<string>;
}): StockAsset | null {
	return (
		candidates.find((candidate) => {
			const key = `${candidate.provider}:${candidate.providerAssetId}`;
			return !usedKeys.has(key);
		}) ?? candidates[0] ?? null
	);
}

export function buildStockMediaTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps?: Partial<StockMediaToolDeps>;
}): Tool[] {
	const stockDeps: StockMediaToolDeps = {
		fetchFn: deps?.fetchFn ?? fetch,
		processMediaAssetsFn:
			deps?.processMediaAssetsFn ?? defaultProcessMediaAssetsFn,
		mediaTimeFromSecondsFn:
			deps?.mediaTimeFromSecondsFn ?? defaultMediaTimeFromSeconds,
	};

	const searchCandidates = async ({
		query,
		type = "video",
		orientation,
		durationSeconds,
		resolution,
		locale,
		count,
		licensePolicy = "safe-commercial",
		providers,
	}: {
		query: string;
		type?: (typeof STOCK_MEDIA_TYPES)[number];
		orientation?: (typeof STOCK_ORIENTATIONS)[number];
		durationSeconds?: { min?: number; max?: number };
		resolution?: (typeof STOCK_RESOLUTIONS)[number];
		locale?: string;
		count?: number;
		licensePolicy?: (typeof LICENSE_POLICIES)[number];
		providers?: StockMediaProviderId[];
	}): Promise<{ candidates: StockAsset[]; message?: string }> => {
		const body = {
			query,
			type,
			orientation,
			durationSeconds,
			resolution,
			locale,
			count,
			licensePolicy,
			providers,
		};
		const response = await stockDeps.fetchFn("/api/agent/stock/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			throw new Error(`provider_error: ${await readJsonError(response)}`);
		}

		const data = parseStockSearchResponse(await response.json());
		const candidates = data.candidates
			.map(assertStockAssetInput)
			.map(registerStockAsset);
		return { candidates, message: data.message };
	};

	return [
		{
			name: "stock_search_media",
			description:
				"搜索真实外部素材库的视频素材，返回候选资源和来源授权信息，不修改项目状态",
			parameters: {
				query: {
					type: "string",
					description: "搜索关键词",
				},
				type: {
					type: "string",
					description: "素材类型，第一版主要使用 video",
					optional: true,
				},
				orientation: {
					type: "string",
					description: "画幅方向：landscape、portrait、square",
					optional: true,
				},
				durationSeconds: {
					type: "object",
					description: "时长范围，例如 { max: 8 }",
					optional: true,
				},
				resolution: {
					type: "string",
					description: "期望清晰度：hd、fullhd、4k",
					optional: true,
				},
				locale: {
					type: "string",
					description: "搜索语言/地区，例如 zh-CN 或 en-US",
					optional: true,
				},
				count: {
					type: "number",
					description: "返回数量，默认 8，最大 20",
					optional: true,
				},
				licensePolicy: {
					type: "string",
					description:
						"授权策略：safe-commercial、allow-attribution、public-domain-only",
					optional: true,
				},
				providers: {
					type: "array",
					description: "指定素材源，可选：pexels、pixabay",
					optional: true,
				},
			},
			handler: async (params) => {
				const query = requireStringParam(params, "query");
				const type =
					optionalEnumValue({
						params,
						key: "type",
						allowed: STOCK_MEDIA_TYPES,
					}) ?? "video";
				const orientation = optionalEnumValue({
					params,
					key: "orientation",
					allowed: STOCK_ORIENTATIONS,
				});
				const resolution = optionalEnumValue({
					params,
					key: "resolution",
					allowed: STOCK_RESOLUTIONS,
				});
				const licensePolicy =
					optionalEnumValue({
						params,
						key: "licensePolicy",
						allowed: LICENSE_POLICIES,
					}) ?? "safe-commercial";
				return searchCandidates({
					query,
					type,
					orientation,
					durationSeconds: optionalDurationSeconds(params),
					resolution,
					locale: optionalStringParam(params, "locale"),
					count: normalizeCount(optionalNumberParam(params, "count")),
					licensePolicy,
					providers: optionalProviderList(params),
				});
			},
		},
		{
			name: "stock_import_media",
			description:
				"将 stock_search_media 返回的外部素材候选下载并导入 Shotlyx 媒体库，保留来源和授权 metadata",
			parameters: {
				candidateId: {
					type: "string",
					description: "stock candidate ID",
				},
			},
			mutating: true,
			handler: async (params) => {
				const candidateId = requireStringParam(params, "candidateId");
				const asset = getStockAsset({ id: candidateId });
				if (!asset) {
					throw new Error(`资源不存在：找不到 stock candidate "${candidateId}"`);
				}
				return importStockAsset({ editor, asset, deps: stockDeps });
			},
		},
		{
			name: "autocut_insert_broll",
			description:
				"根据脚本或分段自动搜索真实视频素材、导入最高匹配候选，并插入为 B-roll 视频轨道。用于自动剪辑/B-roll 插入。",
			parameters: {
				segments: {
					type: "array",
					description:
						"待插入的 B-roll 段落数组，每项包含 query、startTimeSeconds、可选 durationSeconds/orientation",
					optional: true,
				},
				query: {
					type: "string",
					description: "单段 B-roll 搜索词；未提供 segments 时使用",
					optional: true,
				},
				script: {
					type: "string",
					description: "脚本文本；未提供 segments/query 时用作单段搜索词",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description: "单段 B-roll 开始时间，默认 0",
					optional: true,
				},
				durationSeconds: {
					type: "number",
					description: "单段 B-roll 时长，默认 5",
					optional: true,
				},
				targetTrackId: {
					type: "string",
					description: "可选目标视频轨道；不提供时复用或创建一个视频 overlay 轨道",
					optional: true,
				},
				orientation: {
					type: "string",
					description: "默认画幅方向：landscape、portrait、square",
					optional: true,
				},
				countPerSegment: {
					type: "number",
					description: "每段搜索候选数量，默认 5，最大 20",
					optional: true,
				},
				licensePolicy: {
					type: "string",
					description:
						"授权策略：safe-commercial、allow-attribution、public-domain-only",
					optional: true,
				},
				providers: {
					type: "array",
					description: "指定素材源，可选：pexels、pixabay",
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const segments = buildBrollSegments(params);
				const defaultOrientation = optionalEnumValue({
					params,
					key: "orientation",
					allowed: STOCK_ORIENTATIONS,
				});
				const licensePolicy =
					optionalEnumValue({
						params,
						key: "licensePolicy",
						allowed: LICENSE_POLICIES,
					}) ?? "safe-commercial";
				const countPerSegment =
					normalizeCount(optionalNumberParam(params, "countPerSegment")) ?? 5;
				const providers = optionalProviderList(params);
				const targetTrackId = optionalStringParam(params, "targetTrackId");
				const usedKeys = new Set<string>();
				const insertedSegments: InsertedBrollSegment[] = [];
				const skippedSegments: SkippedBrollSegment[] = [];
				let trackId: string | null = null;

				for (const segment of segments) {
					const searchResult = await searchCandidates({
						query: segment.query,
						type: "video",
						orientation: segment.orientation ?? defaultOrientation,
						count: countPerSegment,
						licensePolicy,
						providers,
					});
					const candidate = pickUnusedCandidate({
						candidates: searchResult.candidates,
						usedKeys,
					});
					if (!candidate) {
						skippedSegments.push({
							query: segment.query,
							startTimeSeconds: segment.startTimeSeconds,
							reason:
								searchResult.message ??
								"没有找到可用的视频素材候选",
						});
						continue;
					}

					usedKeys.add(`${candidate.provider}:${candidate.providerAssetId}`);
					const imported = await importStockAsset({
						editor,
						asset: candidate,
						deps: stockDeps,
					});
					trackId ??= findOrCreateBrollTrack({ editor, targetTrackId });
					const durationSeconds =
						segment.durationSeconds ??
						Math.min(imported.durationSeconds ?? candidate.durationSeconds ?? 5, 5);
					editor.timeline.insertElement({
						element: buildVideoElement({
							mediaAssetId: imported.mediaAssetId,
							name: imported.name,
							startTimeSeconds: segment.startTimeSeconds,
							durationSeconds,
							mediaTimeFromSeconds: stockDeps.mediaTimeFromSecondsFn,
						}),
						placement: { mode: "explicit", trackId },
					});
					insertedSegments.push({
						query: segment.query,
						provider: candidate.provider,
						title: candidate.title,
						mediaAssetId: imported.mediaAssetId,
						sourceUrl: candidate.sourceUrl,
						startTimeSeconds: segment.startTimeSeconds,
						durationSeconds,
						license: candidate.license,
					});
				}

				return {
					trackId,
					insertedCount: insertedSegments.length,
					insertedSegments,
					skippedSegments,
				};
			},
		},
	];
}
