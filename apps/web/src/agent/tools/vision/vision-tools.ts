import type { MediaAsset } from "@/media/types";
import type { Tool } from "@/agent/mcp/types";
import {
	optionalNumberParam,
	optionalStringParam,
} from "@/agent/mcp/validation";

type VisualMediaAsset = MediaAsset & { type: "image" | "video" };
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
	createVideoStoryboardDataUrl: (
		input: CreateVideoStoryboardDataUrlInput,
	) => Promise<VideoStoryboardDataUrl>;
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
const MINIMAX_M3_MEDIA_SIZE_LIMIT_BYTES = 52_428_800;
const LARGE_VIDEO_STORYBOARD_FRAME_COUNT = 8;
const LARGE_VIDEO_STORYBOARD_FRAME_LONG_SIDE = 360;

interface CreateVideoStoryboardDataUrlInput {
	file: File;
	durationSeconds?: number;
	maxFrames?: number;
	frameLongSide?: number;
}

interface VideoStoryboardDataUrl {
	dataUrl: string;
	mimeType: "image/jpeg";
	frameCount: number;
	width: number;
	height: number;
}

interface PreparedVisionMedia {
	name: string;
	type: "image" | "video";
	mimeType: string;
	dataUrl: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
	promptNote?: string;
}

function isVisionAnalysisType(value: string): value is VisionAnalysisType {
	return ANALYSIS_TYPES.some((item) => item === value);
}

function isVisionDetail(value: string): value is VisionDetail {
	return DETAILS.some((item) => item === value);
}

function normalizeAnalysisType(value: string | undefined): VisionAnalysisType {
	if (!value) return "editing_suggestions";
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

function normalizeMaxLongSidePixel(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value < 128 || value > 4096) {
		throw new Error(
			'类型不匹配："maxLongSidePixel" 必须为 128 到 4096 之间的整数',
		);
	}
	return value;
}

function isVisualMediaAsset(asset: MediaAsset): asset is VisualMediaAsset {
	return asset.type === "video" || asset.type === "image";
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
	mediaAssetId,
}: {
	editor: VisionToolEditor;
	mediaAssetId?: string;
}): VisualMediaAsset {
	const assets = editor.media.getAssets().filter((asset) => !asset.ephemeral);
	const resolvedId = mediaAssetId ?? resolveSelectedMediaAssetId(editor);
	const asset = resolvedId
		? assets.find((item) => item.id === resolvedId)
		: assets.filter(isVisualMediaAsset)[0];

	if (!asset) {
		throw new Error(
			"未找到可分析的图片或视频资源。请先导入或选择一个视觉素材。",
		);
	}
	if (!isVisualMediaAsset(asset)) {
		throw new Error("类型不匹配：视觉分析只支持图片或视频资源");
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

function formatMiB(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;
}

function buildLargeVideoStoryboardPromptNote({
	fileSize,
	frameCount,
}: {
	fileSize: number;
	frameCount: number;
}): string {
	return `注意：原视频超过 MiniMax M3 的 50MiB 媒体限制（当前约 ${formatMiB(fileSize)}），本次已改用从视频中均匀抽取的 ${frameCount} 帧 storyboard 图片进行视觉分析。请基于这些代表性画面给出内容理解、亮点和剪辑建议；如果需要精确动作连续性或完整时间点，请提示用户压缩视频或分析较短片段。`;
}

function waitForMediaEvent({
	element,
	event,
	errorEvent = "error",
}: {
	element: HTMLMediaElement;
	event: string;
	errorEvent?: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			element.removeEventListener(event, onEvent);
			element.removeEventListener(errorEvent, onError);
		};
		const onEvent = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("无法读取视频抽帧预览"));
		};
		element.addEventListener(event, onEvent, { once: true });
		element.addEventListener(errorEvent, onError, { once: true });
	});
}

async function seekVideoFrame({
	video,
	time,
}: {
	video: HTMLVideoElement;
	time: number;
}): Promise<void> {
	const target = Math.max(0, Math.min(time, video.duration || time));
	if (Math.abs(video.currentTime - target) < 0.05 && video.readyState >= 2) {
		return;
	}
	const wait = waitForMediaEvent({ element: video, event: "seeked" });
	video.currentTime = target;
	await wait;
}

function sampleVideoTimes({
	duration,
	count,
}: {
	duration: number;
	count: number;
}): number[] {
	const safeCount = Math.max(1, count);
	if (!Number.isFinite(duration) || duration <= 0) {
		return [0];
	}
	return Array.from({ length: safeCount }, (_, index) => {
		const time = (duration * (index + 0.5)) / safeCount;
		return Math.max(0, Math.min(duration, time));
	});
}

export async function createVideoStoryboardDataUrl({
	file,
	durationSeconds,
	maxFrames = LARGE_VIDEO_STORYBOARD_FRAME_COUNT,
	frameLongSide = LARGE_VIDEO_STORYBOARD_FRAME_LONG_SIDE,
}: CreateVideoStoryboardDataUrlInput): Promise<VideoStoryboardDataUrl> {
	if (
		typeof document === "undefined" ||
		typeof URL === "undefined" ||
		typeof URL.createObjectURL !== "function"
	) {
		throw new Error("system_error: video storyboard requires browser APIs");
	}

	const objectUrl = URL.createObjectURL(file);
	const video = document.createElement("video");
	video.muted = true;
	video.playsInline = true;
	video.preload = "metadata";

	try {
		const metadataLoaded = waitForMediaEvent({
			element: video,
			event: "loadedmetadata",
		});
		video.src = objectUrl;
		video.load();
		await metadataLoaded;

		const sourceWidth = Math.max(1, video.videoWidth || 1280);
		const sourceHeight = Math.max(1, video.videoHeight || 720);
		const scale = Math.min(
			1,
			Math.max(120, frameLongSide) / Math.max(sourceWidth, sourceHeight),
		);
		const frameWidth = Math.max(1, Math.round(sourceWidth * scale));
		const frameHeight = Math.max(1, Math.round(sourceHeight * scale));
		const labelHeight = 22;
		const duration =
			Number.isFinite(video.duration) && video.duration > 0
				? video.duration
				: (durationSeconds ?? 0);
		const frameCount = Math.max(
			1,
			Math.min(maxFrames, Number.isFinite(duration) && duration > 0 ? maxFrames : 1),
		);
		const columns = Math.min(4, frameCount);
		const rows = Math.ceil(frameCount / columns);
		const canvas = document.createElement("canvas");
		canvas.width = columns * frameWidth;
		canvas.height = rows * (frameHeight + labelHeight);
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("system_error: could not render video storyboard");
		}

		context.fillStyle = "#050505";
		context.fillRect(0, 0, canvas.width, canvas.height);
		context.font = "12px sans-serif";
		context.textBaseline = "middle";

		const times = sampleVideoTimes({ duration, count: frameCount });
		for (const [index, time] of times.entries()) {
			await seekVideoFrame({ video, time });
			const column = index % columns;
			const row = Math.floor(index / columns);
			const x = column * frameWidth;
			const y = row * (frameHeight + labelHeight);
			context.drawImage(video, x, y, frameWidth, frameHeight);
			context.fillStyle = "rgba(0, 0, 0, 0.72)";
			context.fillRect(x, y + frameHeight, frameWidth, labelHeight);
			context.fillStyle = "#ffffff";
			context.fillText(`${index + 1}. ${time.toFixed(1)}s`, x + 8, y + frameHeight + labelHeight / 2);
		}

		return {
			dataUrl: canvas.toDataURL("image/jpeg", 0.82),
			mimeType: "image/jpeg",
			frameCount,
			width: canvas.width,
			height: canvas.height,
		};
	} finally {
		URL.revokeObjectURL(objectUrl);
		video.remove();
	}
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
	mediaType,
}: {
	response: Response;
	context: Parameters<Tool["handler"]>[1];
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
				label: "MiniMax M3 正在思考画面内容",
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
				label: "MiniMax M3 正在输出分析结果",
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
			analysisType: "editing_suggestions",
			analysis,
			media: { type: mediaType },
		};
	}
	throw new Error("provider_error: vision stream finished without analysis");
}

export function buildVisionTools({
	editor,
	deps,
}: BuildVisionToolsOptions): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;
	const readDataUrl = deps?.readFileAsDataUrl ?? readFileAsDataUrl;
	const createStoryboard =
		deps?.createVideoStoryboardDataUrl ?? createVideoStoryboardDataUrl;

	return [
		{
			name: "vision_analyze_media",
			description:
				"分析项目中的图片或视频内容。用于视频内容理解、视觉验证、画面质量检查、找亮点、给剪辑建议、判断是否符合用户描述。",
			parameters: {
				mediaAssetId: {
					type: "string",
					description:
						"要分析的媒体资源 ID。可来自 media_get_all、media_search 或 Agent References；留空时优先分析当前选中的视觉片段，否则使用资源库中的第一个图片/视频。",
					optional: true,
				},
				analysisType: {
					type: "string",
					description:
						"分析类型：editing_suggestions、visual_summary、quality_check 或 content_verification。默认 editing_suggestions。",
					optional: true,
				},
				prompt: {
					type: "string",
					description:
						"给视觉模型的具体问题。例如：分析视频内容并给出剪辑建议、检查画面是否有遮挡、确认生成视频是否符合脚本。",
					optional: true,
				},
				detail: {
					type: "string",
					description:
						"MiniMax M3 视觉 detail：low、default 或 high。默认 default。",
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
						"可选最长边像素上限，128 到 4096。用于控制视觉 token 成本。",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const asset = resolveTargetAsset({
					editor,
					mediaAssetId: optionalStringParam(params, "mediaAssetId"),
				});
				const analysisType = normalizeAnalysisType(
					optionalStringParam(params, "analysisType"),
				);
				const prompt = optionalStringParam(params, "prompt");
				const detail = normalizeDetail(optionalStringParam(params, "detail"));
				const fps = normalizeFps(optionalNumberParam(params, "fps"));
				const maxLongSidePixel = normalizeMaxLongSidePixel(
					optionalNumberParam(params, "maxLongSidePixel"),
				);

				emitVisionProgress({
					context,
					stage: "vision-prepare",
					label: "正在读取媒体文件",
					status: "running",
					current: 1,
				});
				let preparedMedia: PreparedVisionMedia;
				if (
					asset.type === "video" &&
					asset.file.size > MINIMAX_M3_MEDIA_SIZE_LIMIT_BYTES
				) {
					emitVisionProgress({
						context,
						stage: "vision-prepare",
						label: "视频较大，正在生成抽帧预览",
						status: "running",
						current: 1,
					});
					const storyboard = await createStoryboard({
						file: asset.file,
						durationSeconds: asset.duration,
						maxFrames: LARGE_VIDEO_STORYBOARD_FRAME_COUNT,
						frameLongSide: LARGE_VIDEO_STORYBOARD_FRAME_LONG_SIDE,
					});
					preparedMedia = {
						name: `${asset.name} storyboard.jpg`,
						type: "image",
						mimeType: storyboard.mimeType,
						dataUrl: storyboard.dataUrl,
						durationSeconds: asset.duration,
						width: storyboard.width,
						height: storyboard.height,
						promptNote: buildLargeVideoStoryboardPromptNote({
							fileSize: asset.file.size,
							frameCount: storyboard.frameCount,
						}),
					};
				} else {
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
					const mimeType = mimeTypeForAsset(asset);
					preparedMedia = {
						name: asset.name,
						type: asset.type,
						mimeType,
						dataUrl: rewriteDataUrlMimeType({
							dataUrl,
							mimeType,
						}),
						durationSeconds: asset.duration,
						width: asset.width,
						height: asset.height,
					};
				}

				emitVisionProgress({
					context,
					stage: "vision-provider",
					label: "正在请求 MiniMax M3 视觉分析",
					status: "running",
					current: 2,
				});
				const promptParts = [prompt, preparedMedia.promptNote].filter(
					(value): value is string => Boolean(value),
				);
				const responsePromise = fetchFn("/api/agent/vision/analyze", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						analysisType,
						prompt:
							promptParts.length > 0 ? promptParts.join("\n\n") : undefined,
						detail,
						fps,
						maxLongSidePixel,
						stream: true,
						media: {
							mediaAssetId: asset.id,
							name: preparedMedia.name,
							type: preparedMedia.type,
							mimeType: preparedMedia.mimeType,
							dataUrl: preparedMedia.dataUrl,
							durationSeconds: preparedMedia.durationSeconds,
							width: preparedMedia.width,
							height: preparedMedia.height,
						},
					}),
					signal: context?.signal,
				});
				emitVisionProgress({
					context,
					stage: "vision-provider",
					label:
						asset.type === "video"
							? "MiniMax M3 正在理解视频画面"
							: "MiniMax M3 正在理解图片画面",
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
					...result,
					mediaAssetId: asset.id,
					mediaName: asset.name,
					mediaType: asset.type,
				};
			},
		},
	];
}
