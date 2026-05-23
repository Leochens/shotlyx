import type { EditorCore } from "@/core";
import type { ParamValues } from "@/params";
import type { CreateTimelineElement, TimelineTrack } from "@/timeline";
import type { MediaTime } from "@/wasm";
import {
	getSubtitleLayerDurationSeconds,
	normalizeSubtitleLayerCues,
} from "@/subtitles/layer";
import { parseSrt } from "@/subtitles/srt";
import type {
	SubtitleCue,
	SubtitleLayerCue,
	SubtitleRevealMode,
	SubtitleToken,
} from "@/subtitles/types";
import { generateUUID } from "@/utils/id";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireEnumParam,
	requireStringParam,
} from "./validation";
import { buildDefaultTextParams } from "./text-overlay-planner";

const SUBTITLE_FORMATS = ["srt", "cues"] as const;
type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number];

const SUBTITLE_INSERT_MODES = ["layer", "text-elements"] as const;
type SubtitleInsertMode = (typeof SUBTITLE_INSERT_MODES)[number];

const SUBTITLE_STYLES = ["clean", "documentary", "social"] as const;
type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];

const SUBTITLE_PLACEMENTS = ["bottom", "lower_third"] as const;
type SubtitlePlacement = (typeof SUBTITLE_PLACEMENTS)[number];

function getCanvasSize({ editor }: { editor: EditorCore }): {
	width: number;
	height: number;
} {
	const canvasSize = editor.project.getActiveOrNull()?.settings.canvasSize;
	return canvasSize ?? { width: 1024, height: 768 };
}

function hasCjk({ value }: { value: string }): boolean {
	return /[\u3400-\u9fff]/.test(value);
}

function wrapCueText({
	text,
	maxCharsPerLine,
}: {
	text: string;
	maxCharsPerLine: number;
}): string {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	if (!normalized) return "";
	return normalized
		.split("\n")
		.map((line) => {
			const trimmed = line.trim();
			if (trimmed.length <= maxCharsPerLine) return trimmed;
			if (hasCjk({ value: trimmed })) {
				const chars = Array.from(trimmed);
				const splitIndex = Math.ceil(chars.length / 2);
				return `${chars.slice(0, splitIndex).join("")}\n${chars
					.slice(splitIndex)
					.join("")}`;
			}
			const words = trimmed.split(/\s+/);
			const lines: string[] = [];
			let currentLine = "";
			for (const word of words) {
				const nextLine = currentLine ? `${currentLine} ${word}` : word;
				if (nextLine.length <= maxCharsPerLine) {
					currentLine = nextLine;
					continue;
				}
				if (currentLine) lines.push(currentLine);
				currentLine = word;
			}
			if (currentLine) lines.push(currentLine);
			return lines.slice(0, 2).join("\n");
		})
		.join("\n");
}

function resolveSubtitlePositionY({
	canvasHeight,
	placement,
}: {
	canvasHeight: number;
	placement: SubtitlePlacement;
}): number {
	return placement === "lower_third"
		? canvasHeight * 0.25
		: canvasHeight * 0.36;
}

function buildSubtitleStyleParams({
	style,
	placement,
	canvasSize,
	overrides,
}: {
	style: SubtitleStyle;
	placement: SubtitlePlacement;
	canvasSize: { width: number; height: number };
	overrides?: {
		color?: string;
		fontSize?: number;
		fontFamily?: string;
	};
}): ParamValues {
	const base: ParamValues = {
		fontFamily: "Arial",
		fontSize: 4.4,
		color: "#ffffff",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		letterSpacing: 0,
		lineHeight: 1.2,
		"background.enabled": false,
		"background.color": "#000000",
		"background.cornerRadius": 8,
		"background.paddingX": 22,
		"background.paddingY": 24,
		"background.offsetX": 0,
		"background.offsetY": 0,
		"transform.positionX": 0,
		"transform.positionY": resolveSubtitlePositionY({
			canvasHeight: canvasSize.height,
			placement,
		}),
		"transform.scaleX": 1,
		"transform.scaleY": 1,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};

	if (style === "documentary") {
		base["background.enabled"] = true;
		base["background.color"] = "#0f172a";
		base["background.cornerRadius"] = 10;
	}
	if (style === "social") {
		base.fontSize = 5.2;
		base["background.enabled"] = true;
		base["background.color"] = "#000000";
		base["background.cornerRadius"] = 18;
		base["background.paddingX"] = 24;
		base["background.paddingY"] = 26;
	}

	return {
		...base,
		...(overrides?.color ? { color: overrides.color } : {}),
		...(overrides?.fontSize !== undefined
			? { fontSize: overrides.fontSize }
			: {}),
		...(overrides?.fontFamily ? { fontFamily: overrides.fontFamily } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTokensArray({
	value,
	cueIndex,
}: {
	value: unknown;
	cueIndex: number;
}): SubtitleToken[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error(`参数格式错误：cues[${cueIndex}].tokens 必须为数组`);
	}
	return value.map((item, tokenIndex) => {
		if (!isRecord(item)) {
			throw new Error(
				`参数格式错误：cues[${cueIndex}].tokens[${tokenIndex}] 必须为对象`,
			);
		}
		const text = item.text;
		const startTime = item.startTimeSeconds ?? item.startTime;
		const endTime = item.endTimeSeconds ?? item.endTime;
		const duration = item.durationSeconds ?? item.duration;
		if (typeof text !== "string" || text.length === 0) {
			throw new Error(
				`参数格式错误：cues[${cueIndex}].tokens[${tokenIndex}].text 不能为空`,
			);
		}
		if (typeof startTime !== "number" || !Number.isFinite(startTime)) {
			throw new Error(
				`参数格式错误：cues[${cueIndex}].tokens[${tokenIndex}].startTimeSeconds 必须为数字`,
			);
		}
		const resolvedDuration =
			typeof duration === "number"
				? duration
				: typeof endTime === "number"
					? endTime - startTime
					: Number.NaN;
		if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
			throw new Error(
				`参数格式错误：cues[${cueIndex}].tokens[${tokenIndex}] 缺少有效 duration`,
			);
		}
		return {
			text,
			startTime,
			duration: resolvedDuration,
			...(typeof item.confidence === "number"
				? { confidence: item.confidence }
				: {}),
		};
	});
}

function parseCuesArray({ value }: { value: unknown }): SubtitleLayerCue[] {
	if (!Array.isArray(value)) {
		throw new Error("参数格式错误：cues 必须为数组");
	}
	return value.map((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`参数格式错误：cues[${index}] 必须为对象`);
		}
		const text = item.text;
		const startTime = item.startTimeSeconds ?? item.startTime;
		const endTime = item.endTimeSeconds;
		const duration = item.durationSeconds ?? item.duration;
		if (typeof text !== "string" || text.trim().length === 0) {
			throw new Error(`参数格式错误：cues[${index}].text 不能为空`);
		}
		if (typeof startTime !== "number" || Number.isNaN(startTime)) {
			throw new Error(
				`参数格式错误：cues[${index}].startTimeSeconds 必须为数字`,
			);
		}
		const resolvedDuration =
			typeof duration === "number"
				? duration
				: typeof endTime === "number"
					? endTime - startTime
					: Number.NaN;
		if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
			throw new Error(`参数格式错误：cues[${index}] 缺少有效 duration`);
		}
		return {
			text,
			startTime,
			duration: resolvedDuration,
			tokens: parseTokensArray({
				value: item.tokens ?? item.words,
				cueIndex: index,
			}),
		};
	});
}

function getSubtitleCuesFromParams({
	params,
	format,
}: {
	params: Record<string, unknown>;
	format: SubtitleFormat;
}): { cues: SubtitleLayerCue[]; skippedCueCount: number; warnings: string[] } {
	if (format === "srt") {
		const content = requireStringParam(params, "content");
		const result = parseSrt({ input: content });
		return {
			cues: result.captions,
			skippedCueCount: result.skippedCueCount,
			warnings: result.warnings,
		};
	}
	return {
		cues: parseCuesArray({ value: params.cues }),
		skippedCueCount: 0,
		warnings: [],
	};
}

function getAllTracks({ editor }: { editor: EditorCore }): TimelineTrack[] {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return [];
	return [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
}

function findSubtitleElements({
	editor,
	groupId,
}: {
	editor: EditorCore;
	groupId: string;
}): Array<{ trackId: string; elementId: string; cueCount: number }> {
	return getAllTracks({ editor }).flatMap((track) =>
		track.elements.flatMap((element) => {
			if (
				element.type === "text" &&
				element.params["subtitle.groupId"] === groupId
			) {
				return [{ trackId: track.id, elementId: element.id, cueCount: 1 }];
			}
			if (
				element.type === "subtitle" &&
				element.params["subtitle.groupId"] === groupId
			) {
				return [
					{
						trackId: track.id,
						elementId: element.id,
						cueCount: element.cues.length,
					},
				];
			}
			return [];
		}),
	);
}

function buildLayerCues({
	cues,
	maxCharsPerLine,
}: {
	cues: SubtitleLayerCue[];
	maxCharsPerLine: number;
}): SubtitleLayerCue[] {
	return normalizeSubtitleLayerCues({
		cues: cues.map((cue) => ({
			...cue,
			text:
				cue.tokens && cue.tokens.length > 0
					? cue.text.trim()
					: wrapCueText({
							text: cue.text,
							maxCharsPerLine,
						}),
		})),
	});
}

export function buildSubtitleTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime };
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;

	return [
		{
			name: "subtitles_import",
			description:
				"Import subtitles as one editable subtitle layer by default. Accepts SRT text or structured cues, including optional per-word/per-character tokens.",
			parameters: {
				format: {
					type: "string",
					description: "Subtitle input format: srt or cues",
				},
				content: {
					type: "string",
					description: "SRT content when format is srt",
					optional: true,
				},
				cues: {
					type: "array",
					description:
						"Structured cues when format is cues: { text, startTimeSeconds, durationSeconds }",
					optional: true,
				},
				trackId: {
					type: "string",
					description:
						"Optional target text track ID. Omit to create a new subtitle text track.",
					optional: true,
				},
				insertMode: {
					type: "string",
					description:
						"Insert mode: layer for one unified subtitle component, or text-elements for legacy one-element-per-cue insertion.",
					optional: true,
				},
				style: {
					type: "string",
					description: "Unified subtitle style: clean, documentary, social",
					optional: true,
				},
				placement: {
					type: "string",
					description: "Subtitle placement: bottom or lower_third",
					optional: true,
				},
				maxCharsPerLine: {
					type: "number",
					description: "Optional line wrapping limit",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const format = requireEnumParam(
					params,
					"format",
					SUBTITLE_FORMATS,
				) as SubtitleFormat;
				const rawStyle = optionalStringParam(params, "style");
				const style = rawStyle
					? (requireEnumParam(
							{ style: rawStyle },
							"style",
							SUBTITLE_STYLES,
						) as SubtitleStyle)
					: "clean";
				const rawPlacement = optionalStringParam(params, "placement");
				const placement = rawPlacement
					? (requireEnumParam(
							{ placement: rawPlacement },
							"placement",
							SUBTITLE_PLACEMENTS,
						) as SubtitlePlacement)
					: "bottom";
				const { cues, skippedCueCount, warnings } = getSubtitleCuesFromParams({
					params,
					format,
				});
				if (cues.length === 0) {
					throw new Error("字幕为空：没有找到有效字幕 cue");
				}
				const rawInsertMode = optionalStringParam(params, "insertMode");
				const insertMode = rawInsertMode
					? (requireEnumParam(
							{ insertMode: rawInsertMode },
							"insertMode",
							SUBTITLE_INSERT_MODES,
						) as SubtitleInsertMode)
					: "layer";

				const explicitTrackId = optionalStringParam(params, "trackId");
				const trackId =
					explicitTrackId ??
					editor.timeline.addTrack({ type: "text", index: 0 });
				const track = editor.timeline.getTrackById({ trackId });
				if (explicitTrackId && !track) {
					throw new Error(`轨道不存在：找不到轨道 "${explicitTrackId}"`);
				}
				if (track && track.type !== "text") {
					throw new Error(`类型不匹配：无法将字幕插入 ${track.type} 轨道`);
				}

				const groupId = `subtitle-${generateUUID()}`;
				const canvasSize = getCanvasSize({ editor });
				const maxCharsPerLine =
					optionalNumberParam(params, "maxCharsPerLine") ??
					(cues.some((cue) => hasCjk({ value: cue.text })) ? 18 : 42);
				const styleParams = buildSubtitleStyleParams({
					style,
					placement,
					canvasSize,
				});

				if (insertMode === "layer") {
					const layerCues = buildLayerCues({
						cues,
						maxCharsPerLine,
					});
					const layerDuration = getSubtitleLayerDurationSeconds({
						cues: layerCues,
					});
					const layerDurationTime = mediaTimeFromSeconds({
						seconds: layerDuration,
					});
					const revealMode: SubtitleRevealMode = layerCues.some(
						(cue) => (cue.tokens?.length ?? 0) > 0,
					)
						? "token"
						: "full";
					const insertResult = editor.timeline.insertElement({
						element: {
							type: "subtitle",
							name: "Subtitles",
							startTime: mediaTimeFromSeconds({ seconds: 0 }),
							duration: layerDurationTime,
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							sourceDuration: layerDurationTime,
							params: {
								...buildDefaultTextParams({ content: "" }),
								...styleParams,
								content: "",
								"subtitle.role": "layer",
								"subtitle.groupId": groupId,
							},
							cues: layerCues,
							revealMode,
						},
						placement: { mode: "explicit", trackId },
					});

					return {
						imported: true,
						insertMode,
						groupId,
						trackId,
						elementId: insertResult.elementId,
						cueCount: layerCues.length,
						skippedCueCount,
						warnings,
						style,
						placement,
						revealMode,
					};
				}

				cues.forEach((cue, index) => {
					const content = wrapCueText({
						text: cue.text,
						maxCharsPerLine,
					});
					const paramsForCue: ParamValues = {
						...buildDefaultTextParams({ content }),
						...styleParams,
						content,
						"subtitle.role": "cue",
						"subtitle.groupId": groupId,
						"subtitle.index": index,
					};
					const element: CreateTimelineElement = {
						type: "text",
						name: `Subtitle ${index + 1}`,
						startTime: mediaTimeFromSeconds({ seconds: cue.startTime }),
						duration: mediaTimeFromSeconds({ seconds: cue.duration }),
						trimStart: mediaTimeFromSeconds({ seconds: 0 }),
						trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
						params: paramsForCue,
					};
					editor.timeline.insertElement({
						element,
						placement: { mode: "explicit", trackId },
					});
				});

				return {
					imported: true,
					insertMode,
					groupId,
					trackId,
					cueCount: cues.length,
					skippedCueCount,
					warnings,
					style,
					placement,
				};
			},
		},
		{
			name: "subtitles_update_style",
			description:
				"Update the shared visual style for every cue in an imported subtitle group.",
			parameters: {
				groupId: {
					type: "string",
					description: "Subtitle group ID returned by subtitles_import",
				},
				style: {
					type: "string",
					description: "Unified subtitle style: clean, documentary, social",
					optional: true,
				},
				placement: {
					type: "string",
					description: "Subtitle placement: bottom or lower_third",
					optional: true,
				},
				fontSize: {
					type: "number",
					description: "Optional font size override",
					optional: true,
				},
				color: {
					type: "string",
					description: "Optional text color override",
					optional: true,
				},
				fontFamily: {
					type: "string",
					description: "Optional font family override",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const groupId = requireStringParam(params, "groupId");
				const rawStyle = optionalStringParam(params, "style");
				const style = rawStyle
					? (requireEnumParam(
							{ style: rawStyle },
							"style",
							SUBTITLE_STYLES,
						) as SubtitleStyle)
					: "clean";
				const rawPlacement = optionalStringParam(params, "placement");
				const placement = rawPlacement
					? (requireEnumParam(
							{ placement: rawPlacement },
							"placement",
							SUBTITLE_PLACEMENTS,
						) as SubtitlePlacement)
					: "bottom";
				const matches = findSubtitleElements({ editor, groupId });
				if (matches.length === 0) {
					throw new Error(`字幕不存在：找不到字幕组 "${groupId}"`);
				}

				const patchParams = buildSubtitleStyleParams({
					style,
					placement,
					canvasSize: getCanvasSize({ editor }),
					overrides: {
						color: optionalStringParam(params, "color"),
						fontFamily: optionalStringParam(params, "fontFamily"),
						fontSize: optionalNumberParam(params, "fontSize"),
					},
				});

				editor.timeline.updateElements({
					updates: matches.map(({ trackId, elementId }) => ({
						trackId,
						elementId,
						patch: { params: patchParams },
					})),
				});

				return {
					updated: true,
					groupId,
					cueCount: matches.reduce((total, match) => total + match.cueCount, 0),
					style,
					placement,
				};
			},
		},
	];
}
