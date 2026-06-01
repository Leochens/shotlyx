import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import {
	requireNumberParam,
	requireStringParam,
	optionalStringParam,
} from "./validation";
import type { MediaAsset } from "@/media/types";

function assetToResult(asset: MediaAsset) {
	return {
		id: asset.id,
		name: asset.name,
		type: asset.type,
		duration: asset.duration,
		width: asset.width,
		height: asset.height,
	};
}

const ALLOWED_MEDIA_TYPES = ["video", "audio", "image"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: string): value is AllowedMediaType {
	return ALLOWED_MEDIA_TYPES.some((t) => t === value);
}

function parseAllowedMediaType(
	value: string | undefined,
): AllowedMediaType | undefined {
	if (!value) return undefined;
	if (!isAllowedMediaType(value)) {
		throw new Error(
			`类型不匹配：type 必须为 ${ALLOWED_MEDIA_TYPES.join("、")} 之一`,
		);
	}
	return value;
}

export function buildMediaTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "media_search",
			description: "按名称或类型搜索媒体资源",
			parameters: {
				query: {
					type: "string",
					description: "搜索关键词（匹配名称，可选）",
					optional: true,
				},
				type: {
					type: "string",
					description: "按类型筛选：image、video、audio（可选）",
					optional: true,
				},
			},
			handler: (params) => {
				const query = params.query ? String(params.query).toLowerCase() : "";
				const typeFilter = params.type
					? String(params.type).toLowerCase()
					: null;
				const assets = editor.media.getAssets().filter((asset) => !asset.ephemeral);
				const results = assets.filter((asset) => {
					const nameMatch =
						query === "" || asset.name.toLowerCase().includes(query);
					const typeMatch = typeFilter ? asset.type === typeFilter : true;
					return nameMatch && typeMatch;
				});
				return {
					results: results.map(assetToResult),
					count: results.length,
				};
			},
		},
		{
			name: "media_get_all",
			description: "获取项目中的所有媒体资源",
			parameters: {},
			handler: () => {
				const assets = editor.media.getAssets().filter((asset) => !asset.ephemeral);
				return {
					results: assets.map(assetToResult),
					count: assets.length,
				};
			},
		},
		{
			name: "media_read_text_asset",
			description:
				"读取项目资源库中的文本或字幕文件内容。用于在生成配音前读取 SRT/VTT/TXT 文案。",
			parameters: {
				assetId: {
					type: "string",
					description: "媒体资源 ID，必须是 subtitle 或 text 类型",
				},
				maxChars: {
					type: "number",
					description: "最多返回字符数，默认 20000",
					optional: true,
				},
			},
			handler: async (params) => {
				const assetId = requireStringParam(params, "assetId");
				const maxChars =
					params.maxChars === undefined
						? 20_000
						: requireNumberParam(params, "maxChars");
				const asset = editor.media
					.getAssets()
					.find((item) => item.id === assetId);
				if (!asset) {
					throw new Error(`未找到媒体资源：${assetId}`);
				}
				if (asset.type !== "subtitle" && asset.type !== "text") {
					throw new Error("类型不匹配：只能读取字幕或文本文件");
				}
				const text = await asset.file.text();
				const truncated = text.length > maxChars;
				return {
					id: asset.id,
					name: asset.name,
					type: asset.type,
					text: truncated ? text.slice(0, maxChars) : text,
					truncated,
					totalChars: text.length,
				};
			},
		},
		{
			name: "media_import",
			description:
				"从 URL 导入媒体资源。注意：由于 CORS 限制，某些 URL 可能无法访问。",
			parameters: {
				source: {
					type: "string",
					description: "媒体文件 URL",
				},
				type: {
					type: "string",
					description: "媒体类型：video、audio、image（可选，用于辅助识别）",
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const source = requireStringParam(params, "source");
				const typeHint = optionalStringParam(params, "type");
				const allowedTypeHint = parseAllowedMediaType(typeHint);

				const project = editor.project.getActiveOrNull();
				if (!project) {
					throw new Error("参数缺失：未加载项目，无法导入媒体");
				}

				let response: Response;
				try {
					response = await fetch(source, { method: "GET" });
				} catch {
					throw new Error(
						"网络错误：无法获取媒体文件，可能是 CORS 限制或网络问题",
					);
				}

				if (!response.ok) {
					throw new Error(
						`网络错误：获取媒体文件失败 (${response.status} ${response.statusText})`,
					);
				}

				const blob = await response.blob();
				const filename =
					source.split("/").pop()?.split("?")[0] || "imported-media";
				const file = new File([blob], filename, { type: blob.type });

				const { processMediaAssets } = await import("@/media/processing");
				const processed = await processMediaAssets({
					files: [file],
				});

				if (processed.length === 0) {
					throw new Error("媒体处理失败：无法处理该文件");
				}

				const asset = processed[0];

				// Override type if user provided a valid hint
				if (allowedTypeHint) {
					asset.type = allowedTypeHint;
				}

				const result = await editor.media.addMediaAsset({
					projectId: project.metadata.id,
					asset: {
						...asset,
						ephemeral: false,
					},
				});

				if (!result) {
					throw new Error("媒体导入失败：保存资源时出错");
				}

				return {
					id: result.id,
					name: result.name,
					type: result.type,
					duration: result.duration,
					width: result.width,
					height: result.height,
				};
			},
		},
	];
}
