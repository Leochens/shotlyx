import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import { floatToFrameRate } from "@/fps/utils";
import type { TBackground } from "@/project/types";
import {
	requireEnumParam,
	requireNumberParam,
	requireStringParam,
} from "./validation";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((f) => f === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((q) => q === value);
}

export function buildProjectTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "project_get_summary",
			description:
				"获取当前项目元数据（名称、ID）和项目级 MG 资源摘要。不包含媒体资源文件。",
			parameters: {},
			handler: () => {
				const project = editor.project.getActiveOrNull();
				return {
					name: project?.metadata.name ?? "未加载项目",
					id: project?.metadata.id ?? null,
					hasActiveProject: project !== null,
					motionGraphicAssets: (project?.motionGraphicAssets ?? []).map(
						(asset) => ({
							id: asset.id,
							name: asset.name,
							definitionId: asset.definitionId,
							kind: asset.kind,
							duration: asset.duration,
						}),
					),
				};
			},
		},
		{
			name: "project_get_settings",
			description: "获取当前项目设置，包括帧率、画布尺寸和背景",
			parameters: {},
			handler: () => {
				const project = editor.project.getActiveOrNull();
				if (!project) {
					return {
						hasActiveProject: false,
					};
				}
				return {
					hasActiveProject: true,
					fps: project.settings.fps,
					canvasSize: project.settings.canvasSize,
					canvasSizeMode: project.settings.canvasSizeMode,
					background: project.settings.background,
				};
			},
		},
		{
			name: "project_update_fps",
			description: "修改项目帧率（如 24, 30, 60）",
			parameters: {
				fps: {
					type: "number",
					description: "目标帧率（0-240）",
				},
			},
			mutating: true,
			handler: (params) => {
				const fps = requireNumberParam(params, "fps");
				if (fps <= 0 || fps > 240) {
					throw new Error("fps 必须在 0-240 之间");
				}
				const frameRate = floatToFrameRate(fps);
				editor.project.updateSettings({
					settings: { fps: frameRate },
					pushHistory: true,
				});
				return { fps: frameRate };
			},
		},
		{
			name: "project_update_canvas_size",
			description: "修改项目画布尺寸（宽高像素）",
			parameters: {
				width: {
					type: "number",
					description: "画布宽度（1-7680）",
				},
				height: {
					type: "number",
					description: "画布高度（1-4320）",
				},
			},
			mutating: true,
			handler: (params) => {
				const width = requireNumberParam(params, "width");
				const height = requireNumberParam(params, "height");
				if (width < 1 || width > 7680) {
					throw new Error("width 必须在 1-7680 之间");
				}
				if (height < 1 || height > 4320) {
					throw new Error("height 必须在 1-4320 之间");
				}
				editor.project.updateSettings({
					settings: { canvasSize: { width, height } },
					pushHistory: true,
				});
				return { canvasSize: { width, height } };
			},
		},
		{
			name: "project_update_background",
			description:
				"修改项目背景。type=color 时需提供 color（十六进制），type=blur 时需提供 blurIntensity（0-100）",
			parameters: {
				type: {
					type: "string",
					description: '背景类型："color" 或 "blur"',
				},
				color: {
					type: "string",
					description: "十六进制颜色值（如 #000000），type=color 时必填",
					optional: true,
				},
				blurIntensity: {
					type: "number",
					description: "模糊强度（0-100），type=blur 时必填",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const bgType = requireEnumParam(params, "type", [
					"color",
					"blur",
				] as const);
				let background: TBackground;
				if (bgType === "color") {
					const color = requireStringParam(params, "color");
					if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
						throw new Error("color 必须是六位十六进制格式，如 #000000");
					}
					background = { type: "color", color };
				} else {
					const blurIntensity = requireNumberParam(params, "blurIntensity");
					if (blurIntensity < 0 || blurIntensity > 100) {
						throw new Error("blurIntensity 必须在 0-100 之间");
					}
					background = { type: "blur", blurIntensity };
				}
				editor.project.updateSettings({
					settings: { background },
					pushHistory: true,
				});
				return { background };
			},
		},
		{
			name: "project_export",
			description: "导出当前项目为视频文件",
			parameters: {
				format: {
					type: "string",
					description: `导出格式：${EXPORT_FORMAT_VALUES.join("、")}（默认：mp4）`,
					optional: true,
				},
				quality: {
					type: "string",
					description: `导出质量：${EXPORT_QUALITY_VALUES.join("、")}（默认：medium）`,
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const project = editor.project.getActiveOrNull();
				if (!project) {
					throw new Error("参数缺失：未加载项目，无法导出");
				}

				const rawFormat = params.format;
				const rawQuality = params.quality;

				const format: ExportFormat =
					typeof rawFormat === "string" && isExportFormat(rawFormat)
						? rawFormat
						: "mp4";
				const quality: ExportQuality =
					typeof rawQuality === "string" && isExportQuality(rawQuality)
						? rawQuality
						: "medium";

				const result = await editor.project.export({
					options: {
						format,
						quality,
						fps: project.settings.fps,
						includeAudio: true,
					},
				});

				return {
					success: result.success,
					cancelled: result.cancelled ?? false,
					error: result.error ?? null,
				};
			},
		},
	];
}
