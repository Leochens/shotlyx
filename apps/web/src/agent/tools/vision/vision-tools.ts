import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { Tool } from "@/agent/mcp/types";
import {
	optionalNumberParam,
	optionalStringParam,
} from "@/agent/mcp/validation";

type VisualMediaAsset = MediaAsset & { type: "image" | "video" };
type VisionAnalysisType =
	| "editing_suggestions"
	| "visual_summary"
	| "quality_check"
	| "content_verification";
type VisionDetail = "low" | "default" | "high";

export interface VisionToolDeps {
	fetchFn: typeof fetch;
	readFileAsDataUrl: (file: File) => Promise<string>;
}

export interface BuildVisionToolsOptions {
	editor: EditorCore;
	deps?: Partial<VisionToolDeps>;
}

const ANALYSIS_TYPES: VisionAnalysisType[] = [
	"editing_suggestions",
	"visual_summary",
	"quality_check",
	"content_verification",
];
const DETAILS: VisionDetail[] = ["low", "default", "high"];

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

function resolveSelectedMediaAssetId(editor: EditorCore): string | null {
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
	editor: EditorCore;
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

function mimeTypeForAsset(asset: VisualMediaAsset): string {
	if (asset.file.type) return asset.file.type;
	return asset.type === "video" ? "video/mp4" : "image/png";
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

export function buildVisionTools({
	editor,
	deps,
}: BuildVisionToolsOptions): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;
	const readDataUrl = deps?.readFileAsDataUrl ?? readFileAsDataUrl;

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
				const dataUrl = await readDataUrl(asset.file);
				const response = await fetchFn("/api/agent/vision/analyze", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						analysisType: normalizeAnalysisType(
							optionalStringParam(params, "analysisType"),
						),
						prompt: optionalStringParam(params, "prompt"),
						detail: normalizeDetail(optionalStringParam(params, "detail")),
						fps: normalizeFps(optionalNumberParam(params, "fps")),
						maxLongSidePixel: normalizeMaxLongSidePixel(
							optionalNumberParam(params, "maxLongSidePixel"),
						),
						media: {
							mediaAssetId: asset.id,
							name: asset.name,
							type: asset.type,
							mimeType: mimeTypeForAsset(asset),
							dataUrl,
							durationSeconds: asset.duration,
							width: asset.width,
							height: asset.height,
						},
					}),
					signal: context?.signal,
				});
				if (!response.ok) {
					throw new Error(await parseAgentApiError(response));
				}
				const result = await response.json();
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
