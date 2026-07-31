import type { MediaAsset } from "@/media/types";
import type { Tool } from "@/agent/mcp/types";
import {
	optionalNumberParam,
	optionalStringParam,
} from "@/agent/mcp/validation";

type VisionMediaType = "image" | "video";
type ImageMediaAsset = MediaAsset & { type: "image" };
type VideoMediaAsset = MediaAsset & { type: "video" };
type VisualMediaAsset = ImageMediaAsset | VideoMediaAsset;
type VisionElementRef = { trackId: string; elementId: string };
type VisionToolEditor = {
	media: {
		getAssets: () => MediaAsset[];
	};
	selection: {
		getSelectedElements: () => VisionElementRef[];
	};
	timeline: {
		getElementsWithTracks: (input: {
			elements: VisionElementRef[];
		}) => Array<{ element: { mediaId?: string } }>;
	};
};
type VisionAnalysisType =
	| "editing_suggestions"
	| "visual_summary"
	| "quality_check"
	| "content_verification";
type VisionDetail = "low" | "default" | "high";
type VisionProgressStatus = "running" | "success" | "error";

export interface VisionToolDeps {
	fetchFn: typeof fetch;
	readFileAsDataUrl: (file: File) => Promise<string>;
}

export interface BuildVisionToolsOptions {
	editor: VisionToolEditor;
	deps?: Partial<VisionToolDeps>;
}

const ANALYSIS_TYPES: VisionAnalysisType[] = [
	"editing_suggestions",
	"visual_summary",
	"quality_check",
	"content_verification",
];
const DETAILS: VisionDetail[] = ["low", "default", "high"];
const GENERIC_MIME_TYPES = new Set([
	"application/octet-stream",
	"binary/octet-stream",
	"application/x-binary",
]);
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
};
interface PreparedVisionMedia {
	name: string;
	type: VisionMediaType;
	mimeType: string;
	dataUrl?: string;
	file?: File;
	durationSeconds?: number;
	width?: number;
	height?: number;
}

const VISION_MEDIA_LABELS: Record<VisionMediaType, string> = {
	image: "图片",
	video: "视频",
};

function isVisionAnalysisType(value: string): value is VisionAnalysisType {
	return ANALYSIS_TYPES.some((item) => item === value);
}

function isVisionDetail(value: string): value is VisionDetail {
	return DETAILS.some((item) => item === value);
}

function normalizeAnalysisType({
	defaultValue,
	value,
}: {
	defaultValue: VisionAnalysisType;
	value: string | undefined;
}): VisionAnalysisType {
	if (!value) return defaultValue;
	if (!isVisionAnalysisType(value)) {
		throw new Error(
			`类型不匹配："analysisType" 必须为以下之一：${ANALYSIS_TYPES.join(", ")}`,
		);
	}
	return value;
}

function normalizeDetail(value: string | undefined): VisionDetail {
	if (!value) return "default";
	if (!isVisionDetail(value)) {
		throw new Error(
			`类型不匹配："detail" 必须为以下之一：${DETAILS.join(", ")}`,
		);
	}
	return value;
}

function normalizeFps(value: number | undefined): number {
	const fps = value ?? 1;
	if (fps < 0.2 || fps > 5) {
		throw new Error('类型不匹配："fps" 必须在 0.2 到 5 之间');
	}
	return fps;
}

function normalizeMaxLongSidePixel(
	value: number | undefined,
): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 128 || value > 4096) {
		throw new Error(
			'类型不匹配："maxLongSidePixel" 必须为 128 到 4096 之间的整数',
		);
	}
	return value;
}

function shouldRouteVideoAnalysisToSemanticIndex({
	analysisType,
	asset,
}: {
	analysisType: VisionAnalysisType;
	asset: VisualMediaAsset;
}): boolean {
	return (
		asset.type === "video" &&
		(analysisType === "editing_suggestions" ||
			analysisType === "visual_summary")
	);
}

function isVisualMediaAssetOfType({
	asset,
	mediaType,
}: {
	asset: MediaAsset;
	mediaType: VisionMediaType;
}): asset is VisualMediaAsset {
	return asset.type === mediaType;
}

function resolveSelectedMediaAssetId(editor: VisionToolEditor): string | null {
	const [selected] = editor.selection.getSelectedElements();
	if (!selected) return null;
	const [resolved] = editor.timeline.getElementsWithTracks({
		elements: [selected],
	});
	if (!resolved || !("mediaId" in resolved.element)) return null;
	return resolved.element.mediaId;
}

function resolveTargetAsset({
	editor,
	mediaType,
	mediaAssetId,
}: {
	editor: VisionToolEditor;
	mediaType: VisionMediaType;
	mediaAssetId?: string;
}): VisualMediaAsset {
	const assets = editor.media.getAssets().filter((asset) => !asset.ephemeral);
	const selectedId = resolveSelectedMediaAssetId(editor);
	const resolvedId = mediaAssetId ?? selectedId ?? undefined;
	const asset = resolvedId
		? assets.find((item) => item.id === resolvedId)
		: assets.find((item) =>
				isVisualMediaAssetOfType({ asset: item, mediaType }),
			);
	const mediaLabel = VISION_MEDIA_LABELS[mediaType];

	if (!asset) {
		if (mediaAssetId) {
			throw new Error(`未找到媒体资源：${mediaAssetId}`);
		}
		throw new Error(
			`未找到可分析的${mediaLabel}素材。请先导入或选择${mediaLabel}。`,
		);
	}
	if (!isVisualMediaAssetOfType({ asset, mediaType })) {
		const actualLabel =
			asset.type === "image"
				? VISION_MEDIA_LABELS.image
				: asset.type === "video"
					? VISION_MEDIA_LABELS.video
					: asset.type;
		throw new Error(
			`类型不匹配：${mediaLabel}视觉分析只支持${mediaLabel}素材，当前资源为${actualLabel}`,
		);
	}
	return asset;
}

function extensionForName(name: string): string {
	const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
	return match?.[1] ?? "";
}

function isUsableMimeType({
	type,
	mimeType,
}: {
	type: VisualMediaAsset["type"];
	mimeType: string | undefined;
}): mimeType is string {
	if (!mimeType) return false;
	const normalized = mimeType.trim().toLowerCase();
	if (!normalized || GENERIC_MIME_TYPES.has(normalized)) return false;
	return type === "video"
		? normalized.startsWith("video/")
		: normalized.startsWith("image/");
}

function mimeTypeForAsset(asset: VisualMediaAsset): string {
	if (isUsableMimeType({ type: asset.type, mimeType: asset.file.type })) {
		return asset.file.type.trim().toLowerCase();
	}
	const extension = extensionForName(asset.name || asset.file.name);
	if (asset.type === "video" && VIDEO_MIME_BY_EXTENSION[extension]) {
		return VIDEO_MIME_BY_EXTENSION[extension];
	}
	if (asset.type === "image" && IMAGE_MIME_BY_EXTENSION[extension]) {
		return IMAGE_MIME_BY_EXTENSION[extension];
	}
	return asset.type === "video" ? "video/mp4" : "image/png";
}

function rewriteDataUrlMimeType({
	dataUrl,
	mimeType,
}: {
	dataUrl: string;
	mimeType: string;
}): string {
	if (!dataUrl.startsWith("data:")) return dataUrl;
	const commaIndex = dataUrl.indexOf(",");
	if (commaIndex < 0) return dataUrl;
	const metadata = dataUrl.slice(5, commaIndex);
	const suffixIndex = metadata.indexOf(";");
	const suffix = suffixIndex >= 0 ? metadata.slice(suffixIndex) : "";
	return `data:${mimeType}${suffix},${dataUrl.slice(commaIndex + 1)}`;
}

function emitVisionProgress({
	context,
	stage,
	label,
	status,
	current,
	detail,
}: {
	context: Parameters<Tool["handler"]>[1];
	stage: string;
	label: string;
	status: VisionProgressStatus;
	current: number;
	detail?: string;
}) {
	context?.onProgress?.({
		stage,
		label,
		status,
		current,
		total: 4,
		detail,
	});
}

export function readFileAsDataUrl(file: File): Promise<string> {
	if (typeof FileReader === "undefined") {
		throw new Error("system_error: FileReader is not available");
	}
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("读取媒体文件失败"));
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error("读取媒体文件失败：结果不是 data URL"));
				return;
			}
			resolve(reader.result);
		};
		reader.readAsDataURL(file);
	});
}

async function parseAgentApiError(response: Response): Promise<string> {
	try {
		const data: unknown = await response.json();
		if (
			typeof data === "object" &&
			data !== null &&
			"error" in data &&
			typeof data.error === "string"
		) {
			return data.error;
		}
	} catch {
		// Fall through.
	}
	return `provider_error: vision analysis failed with ${response.status}`;
}

function truncateProgressDetail(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length <= 1200) return trimmed;
	return `${trimmed.slice(-1200)}`;
}

function isStreamingResponse(response: Response): boolean {
	return (response.headers.get("Content-Type") ?? "").includes(
		"text/event-stream",
	);
}

function getRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value;
}

function getSseData(frame: string): string | null {
	const dataLines = frame
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trimStart());
	if (dataLines.length === 0) return null;
	return dataLines.join("\n");
}

function splitSseFrames(input: string): { frames: string[]; rest: string } {
	const normalized = input.replace(/\r\n/g, "\n");
	const parts = normalized.split("\n\n");
	return {
		frames: parts.slice(0, -1),
		rest: parts.at(-1) ?? "",
	};
}

async function readVisionStream({
	response,
	context,
	analysisType,
	mediaType,
}: {
	response: Response;
	context: Parameters<Tool["handler"]>[1];
	analysisType: VisionAnalysisType;
	mediaType: VisualMediaAsset["type"];
}): Promise<Record<string, unknown>> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("provider_error: vision analysis stream was empty");
	}

	const decoder = new TextDecoder();
	let pending = "";
	let reasoning = "";
	let analysis = "";
	let doneResult: Record<string, unknown> | null = null;

	const processFrame = (frame: string) => {
		const dataText = getSseData(frame);
		if (!dataText || dataText === "[DONE]") return;
		let data: unknown;
		try {
			data = JSON.parse(dataText);
		} catch {
			return;
		}
		const record = getRecord(data);
		if (!record) return;
		const type = typeof record.type === "string" ? record.type : "";
		if (type === "reasoning_delta" && typeof record.text === "string") {
			reasoning += record.text;
			emitVisionProgress({
				context,
				stage: "vision-reasoning",
				label: "视觉模型正在思考画面内容",
				status: "running",
				current: 3,
				detail: truncateProgressDetail(reasoning),
			});
			return;
		}
		if (type === "content_delta" && typeof record.text === "string") {
			analysis += record.text;
			emitVisionProgress({
				context,
				stage: "vision-output",
				label: "视觉模型正在输出分析结果",
				status: "running",
				current: 3,
				detail: truncateProgressDetail(analysis),
			});
			return;
		}
		if (type === "error") {
			const error =
				typeof record.error === "string"
					? record.error
					: "provider_error: vision stream failed";
			throw new Error(error);
		}
		if (type === "done") {
			doneResult = record;
			if (typeof record.analysis === "string") {
				analysis = record.analysis;
			}
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		pending += decoder.decode(value, { stream: true });
		const { frames, rest } = splitSseFrames(pending);
		pending = rest;
		for (const frame of frames) {
			processFrame(frame);
		}
	}
	if (pending.trim()) {
		processFrame(pending);
	}

	if (doneResult) return doneResult;
	if (analysis) {
		return {
			provider: "minimax",
			analysisType,
			analysis,
			media: { type: mediaType },
		};
	}
	throw new Error("provider_error: vision stream finished without analysis");
}

async function runVisionAnalysis({
	asset,
	context,
	fetchFn,
	params,
	readDataUrl,
}: {
	asset: VisualMediaAsset;
	context: Parameters<Tool["handler"]>[1];
	fetchFn: typeof fetch;
	params: Record<string, unknown>;
	readDataUrl: VisionToolDeps["readFileAsDataUrl"];
}): Promise<Record<string, unknown>> {
	const analysisType = normalizeAnalysisType({
		defaultValue: asset.type === "image" ? "visual_summary" : "quality_check",
		value: optionalStringParam(params, "analysisType"),
	});
	if (shouldRouteVideoAnalysisToSemanticIndex({ analysisType, asset })) {
		throw new Error(
			"视频素材的内容理解和剪辑建议请使用 video_semantic_index_analyze 或 video_semantic_index_get。vision_analyze_video 仅用于视频质量检查或与 prompt 的窄范围验证。",
		);
	}
	const prompt = optionalStringParam(params, "prompt");
	const detail = normalizeDetail(optionalStringParam(params, "detail"));
	const fps =
		asset.type === "video"
			? normalizeFps(optionalNumberParam(params, "fps"))
			: undefined;
	const maxLongSidePixel = normalizeMaxLongSidePixel(
		optionalNumberParam(params, "maxLongSidePixel"),
	);
	const mediaLabel = VISION_MEDIA_LABELS[asset.type];

	emitVisionProgress({
		context,
		stage: "vision-prepare",
		label: `正在读取${mediaLabel}文件`,
		status: "running",
		current: 1,
	});
	let preparedMedia: PreparedVisionMedia;
	if (asset.type === "video") {
		const mimeType = mimeTypeForAsset(asset);
		preparedMedia = {
			name: asset.name,
			type: asset.type,
			mimeType,
			file: asset.file,
			durationSeconds: asset.duration,
			width: asset.width,
			height: asset.height,
		};
	} else {
		preparedMedia = {
			name: asset.name,
			type: asset.type,
			mimeType: mimeTypeForAsset(asset),
			durationSeconds: asset.duration,
			width: asset.width,
			height: asset.height,
		};
		let dataUrl: string;
		try {
			dataUrl = await readDataUrl(asset.file);
		} catch (error) {
			emitVisionProgress({
				context,
				stage: "vision-prepare",
				label: "读取媒体文件失败",
				status: "error",
				current: 1,
			});
			throw error;
		}
		preparedMedia.dataUrl = rewriteDataUrlMimeType({
			dataUrl,
			mimeType: preparedMedia.mimeType,
		});
	}

	emitVisionProgress({
		context,
		stage: "vision-provider",
		label: `正在请求视觉模型进行${mediaLabel}分析`,
		status: "running",
		current: 2,
	});
	const payload = {
		analysisType,
		prompt,
		detail,
		...(fps === undefined ? {} : { fps }),
		maxLongSidePixel,
		stream: preparedMedia.type === "image",
		media: {
			mediaAssetId: asset.id,
			name: preparedMedia.name,
			type: preparedMedia.type,
			mimeType: preparedMedia.mimeType,
			...(preparedMedia.dataUrl ? { dataUrl: preparedMedia.dataUrl } : {}),
			durationSeconds: preparedMedia.durationSeconds,
			width: preparedMedia.width,
			height: preparedMedia.height,
		},
	};
	const requestTarget =
		preparedMedia.type === "video"
			? `/api/agent/vision/analyze?payload=${encodeURIComponent(
					JSON.stringify(payload),
				)}`
			: "/api/agent/vision/analyze";
	const requestInit: RequestInit =
		preparedMedia.type === "video"
			? (() => {
					const file = preparedMedia.file;
					if (!file) {
						throw new Error("读取媒体文件失败：缺少视频文件");
					}
					return {
						method: "POST",
						headers: { "Content-Type": preparedMedia.mimeType },
						body: file,
						signal: context?.signal,
					};
				})()
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
					signal: context?.signal,
				};
	const responsePromise = fetchFn(requestTarget, requestInit);
	emitVisionProgress({
		context,
		stage: "vision-provider",
		label: `视觉模型正在理解${mediaLabel}画面`,
		status: "running",
		current: 3,
	});

	let response: Response;
	try {
		response = await responsePromise;
	} catch (error) {
		emitVisionProgress({
			context,
			stage: "vision-provider",
			label: "视觉分析请求失败",
			status: "error",
			current: 3,
		});
		throw error;
	}
	if (!response.ok) {
		const message = await parseAgentApiError(response);
		emitVisionProgress({
			context,
			stage: "vision-provider",
			label: "视觉分析失败",
			status: "error",
			current: 3,
		});
		throw new Error(message);
	}
	const result = isStreamingResponse(response)
		? await readVisionStream({
				response,
				context,
				analysisType,
				mediaType: asset.type,
			})
		: await response.json();
	emitVisionProgress({
		context,
		stage: "vision-provider",
		label: "视觉分析已完成",
		status: "success",
		current: 4,
	});
	return {
		...(getRecord(result) ?? {}),
		mediaAssetId: asset.id,
		mediaName: asset.name,
		mediaType: asset.type,
	};
}

export function buildVisionTools({
	editor,
	deps,
}: BuildVisionToolsOptions): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;
	const readDataUrl = deps?.readFileAsDataUrl ?? readFileAsDataUrl;

	return [
		{
			name: "vision_analyze_image",
			description:
				"理解或分析项目中的单张图片。只接受图片素材；不要用于视频素材、视频内容理解或视频剪辑建议。",
			parameters: {
				mediaAssetId: {
					type: "string",
					description:
						"图片媒体资源 ID。可来自 media_get_all、media_search 或 Agent References；留空时优先分析当前选中的图片，否则使用资源库中的第一张图片。",
					optional: true,
				},
				analysisType: {
					type: "string",
					description:
						"分析类型：editing_suggestions、visual_summary、quality_check 或 content_verification。默认 visual_summary。",
					optional: true,
				},
				prompt: {
					type: "string",
					description:
						"给图片视觉模型的具体问题。例如：总结图片内容、识别画面文字、检查构图质量、确认图片是否符合脚本或封面需求。",
					optional: true,
				},
				detail: {
					type: "string",
					description:
						"视觉 detail：low、default 或 high。默认 default。",
					optional: true,
				},
				maxLongSidePixel: {
					type: "number",
					description:
						"可选最长边像素上限，128 到 4096。用于控制图片视觉 token 成本。",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const asset = resolveTargetAsset({
					editor,
					mediaType: "image",
					mediaAssetId: optionalStringParam(params, "mediaAssetId"),
				});
				return runVisionAnalysis({
					asset,
					context,
					fetchFn,
					params,
					readDataUrl,
				});
			},
		},
		{
			name: "vision_analyze_video",
			description:
				"对项目中的视频做窄范围视觉 QA、生成视频验证或画面细节检查。只接受视频素材；普通视频内容理解、找亮点、剪辑建议请优先使用 video_semantic_index_analyze/get。",
			parameters: {
				mediaAssetId: {
					type: "string",
					description:
						"视频媒体资源 ID。可来自 media_get_all、media_search 或 Agent References；留空时优先分析当前选中的视频，否则使用资源库中的第一个视频。",
					optional: true,
				},
				analysisType: {
					type: "string",
					description:
						"分析类型：editing_suggestions、visual_summary、quality_check 或 content_verification。默认 quality_check。",
					optional: true,
				},
				prompt: {
					type: "string",
					description:
						"给视频视觉模型的具体问题。例如：检查画面是否有遮挡、确认生成视频是否符合脚本、分析某个时间段的画面细节。",
					optional: true,
				},
				detail: {
					type: "string",
					description:
						"视觉 detail：low、default 或 high。默认 default。",
					optional: true,
				},
				fps: {
					type: "number",
					description:
						"视频抽帧帧率，0.2 到 5。默认 1；较高值会增加请求体和视觉 token。",
					optional: true,
				},
				maxLongSidePixel: {
					type: "number",
					description:
						"可选最长边像素上限，128 到 4096。用于控制视觉 token 成本；MiniMax 视频请求会在服务端自动限制到更稳定的 672 长边。",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const asset = resolveTargetAsset({
					editor,
					mediaType: "video",
					mediaAssetId: optionalStringParam(params, "mediaAssetId"),
				});
				return runVisionAnalysis({
					asset,
					context,
					fetchFn,
					params,
					readDataUrl,
				});
			},
		},
	];
}
