import type { EditorCore } from "@/core";
import type { ParamValues } from "@/params";
import type {
	CreateTimelineElement,
	SubtitleElement,
	TimelineTrack,
} from "@/timeline";
import type { MediaTime } from "@/wasm";
import {
	getSubtitleLayerDurationSeconds,
	normalizeSubtitleLayerCues,
} from "@/subtitles/layer";
import { parseSrt } from "@/subtitles/srt";
import type {
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

const SUBTITLE_REVEAL_MODES = ["line", "token", "karaoke"] as const;
type UserSubtitleRevealMode = (typeof SUBTITLE_REVEAL_MODES)[number];

const SUBTITLE_LINE_BREAK_MODES = ["wrap", "page"] as const;
type SubtitleLineBreakMode = (typeof SUBTITLE_LINE_BREAK_MODES)[number];

interface SubtitleLayerRef {
	trackId: string;
	elementId: string;
	element: SubtitleElement;
}

interface SubtitleTranslationResult {
	provider?: string;
	targetLanguage?: string;
	translations: Array<{
		index: number;
		text: string;
	}>;
}

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

function isSubtitleElement(value: unknown): value is SubtitleElement {
	return (
		isRecord(value) &&
		value.type === "subtitle" &&
		Array.isArray(value.cues)
	);
}

function findFirstSubtitleLayerInTrack({
	track,
	elementId,
}: {
	track: TimelineTrack;
	elementId?: string;
}): SubtitleLayerRef | null {
	for (const element of track.elements) {
		if (!isSubtitleElement(element)) continue;
		if (elementId && element.id !== elementId) continue;
		return { trackId: track.id, elementId: element.id, element };
	}
	return null;
}

function resolveSubtitleLayer({
	editor,
	trackId,
	elementId,
}: {
	editor: EditorCore;
	trackId?: string;
	elementId?: string;
}): SubtitleLayerRef {
	if (trackId) {
		const track = editor.timeline.getTrackById({ trackId });
		if (!track) {
			throw new Error(`字幕不存在：找不到轨道 "${trackId}"`);
		}
		const match = findFirstSubtitleLayerInTrack({ track, elementId });
		if (!match) {
			throw new Error(
				elementId
					? `字幕不存在：找不到字幕元素 "${elementId}"`
					: `字幕不存在：轨道 "${trackId}" 中没有统一字幕层`,
			);
		}
		return match;
	}

	for (const track of getAllTracks({ editor })) {
		const match = findFirstSubtitleLayerInTrack({ track, elementId });
		if (match) return match;
	}

	throw new Error(
		elementId
			? `字幕不存在：找不到字幕元素 "${elementId}"`
			: "字幕不存在：请先生成或导入统一字幕层",
	);
}

async function parseSubtitleTranslationApiError({
	response,
}: {
	response: Response;
}): Promise<string> {
	try {
		const body = await response.json();
		if (
			typeof body === "object" &&
			body !== null &&
			"error" in body &&
			typeof body.error === "string"
		) {
			return body.error;
		}
	} catch {
		// Fall through.
	}
	return `provider_error: subtitle translation failed with ${response.status}`;
}

function parseSubtitleTranslationResult({
	value,
}: {
	value: unknown;
}): SubtitleTranslationResult {
	if (!isRecord(value)) {
		throw new Error("provider_error: subtitle translation response is invalid");
	}
	const translations = value.translations;
	if (!Array.isArray(translations)) {
		throw new Error(
			"provider_error: subtitle translation response missing translations",
		);
	}
	return {
		provider:
			typeof value.provider === "string" && value.provider.trim().length > 0
				? value.provider.trim()
				: undefined,
		targetLanguage:
			typeof value.targetLanguage === "string" &&
			value.targetLanguage.trim().length > 0
				? value.targetLanguage.trim()
				: undefined,
		translations: translations
			.map((item) => {
				if (!isRecord(item)) return null;
				const index = item.index;
				const text = item.text;
				if (
					typeof index !== "number" ||
					!Number.isInteger(index) ||
					typeof text !== "string" ||
					text.trim().length === 0
				) {
					return null;
				}
				return { index, text: text.trim() };
			})
			.filter((item): item is { index: number; text: string } => item !== null),
	};
}

function buildLayerCues({
	cues,
}: {
	cues: SubtitleLayerCue[];
}): SubtitleLayerCue[] {
	return normalizeSubtitleLayerCues({
		cues: cues.map((cue) => ({
			...cue,
			text: cue.text.trim(),
		})),
	});
}

function resolveDefaultMaxCharsPerLine({
	cues,
}: {
	cues: SubtitleLayerCue[];
}): number {
	return cues.some((cue) => hasCjk({ value: cue.text })) ? 18 : 42;
}

export function buildSubtitleTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: {
		mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime;
		fetchFn?: typeof fetch;
	};
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;
	const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);

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
				lineBreakMode: {
					type: "string",
					description:
						"Line overflow mode: wrap for automatic multi-line wrapping, or page to show one wrapped line at a time.",
					optional: true,
				},
				revealMode: {
					type: "string",
					description:
						"Display mode: line, token, or karaoke. Defaults to token when token timing exists, otherwise line.",
					optional: true,
				},
				highlightColor: {
					type: "string",
					description: "Karaoke highlight color, e.g. #22d3ee.",
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
					resolveDefaultMaxCharsPerLine({ cues });
				const rawLineBreakMode = optionalStringParam(params, "lineBreakMode");
				const lineBreakMode = rawLineBreakMode
					? (requireEnumParam(
							{ lineBreakMode: rawLineBreakMode },
							"lineBreakMode",
							SUBTITLE_LINE_BREAK_MODES,
						) as SubtitleLineBreakMode)
					: "wrap";
				const rawRevealMode = optionalStringParam(params, "revealMode");
				const explicitRevealMode = rawRevealMode
					? (requireEnumParam(
							{ revealMode: rawRevealMode },
							"revealMode",
							SUBTITLE_REVEAL_MODES,
						) as UserSubtitleRevealMode)
					: undefined;
				const highlightColor =
					optionalStringParam(params, "highlightColor") ?? "#22d3ee";
				const styleParams = buildSubtitleStyleParams({
					style,
					placement,
					canvasSize,
				});

				if (insertMode === "layer") {
					const layerCues = buildLayerCues({
						cues,
					});
					const layerDuration = getSubtitleLayerDurationSeconds({
						cues: layerCues,
					});
					const layerDurationTime = mediaTimeFromSeconds({
						seconds: layerDuration,
					});
					const revealMode: SubtitleRevealMode =
						explicitRevealMode ??
						(layerCues.some((cue) => (cue.tokens?.length ?? 0) > 0)
							? "token"
							: "line");
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
								"subtitle.maxCharsPerLine": maxCharsPerLine,
								"subtitle.lineBreakMode": lineBreakMode,
								"subtitle.highlightColor": highlightColor,
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
			name: "subtitles_translate",
			description:
				"Translate an existing unified subtitle layer into a bilingual subtitle layer. The translated line is shown line-by-line; token and karaoke reveal modes are disabled for bilingual display.",
			parameters: {
				targetLanguage: {
					type: "string",
					description:
						"Target language code or name, e.g. en, ja, English, Japanese",
				},
				sourceLanguage: {
					type: "string",
					description: "Optional source language code or name",
					optional: true,
				},
				subtitleTrackId: {
					type: "string",
					description:
						"Optional subtitle track ID. Omit to use the first subtitle layer in the active scene.",
					optional: true,
				},
				subtitleElementId: {
					type: "string",
					description:
						"Optional subtitle element ID. Omit to use the first subtitle layer.",
					optional: true,
				},
			},
			mutating: true,
			// eslint-disable-next-line shotlyx/prefer-object-params -- MCP tool handlers receive positional params/context.
			handler: async (params, context) => {
				const targetLanguage = requireStringParam(params, "targetLanguage").trim();
				if (!targetLanguage) {
					throw new Error("参数格式错误：targetLanguage 不能为空");
				}
				const sourceLanguage = optionalStringParam(params, "sourceLanguage");
				const trackId =
					optionalStringParam(params, "subtitleTrackId") ??
					optionalStringParam(params, "trackId");
				const elementId =
					optionalStringParam(params, "subtitleElementId") ??
					optionalStringParam(params, "elementId");
				const layer = resolveSubtitleLayer({
					editor,
					trackId,
					elementId,
				});

				context?.onProgress?.({
					stage: "translate",
					label: "Translating subtitle lines...",
					status: "running",
				});
				const response = await fetchFn("/api/agent/subtitle-translation", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						targetLanguage,
						sourceLanguage,
						cues: layer.element.cues.map((cue, index) => ({
							index,
							text: cue.text,
							startTime: cue.startTime,
							duration: cue.duration,
						})),
					}),
					signal: context?.signal,
				});
				if (!response.ok) {
					throw new Error(
						await parseSubtitleTranslationApiError({ response }),
					);
				}

				const translationResult = parseSubtitleTranslationResult({
					value: await response.json(),
				});
				const translatedByIndex = new Map(
					translationResult.translations.map((item) => [item.index, item.text]),
				);
				if (translatedByIndex.size === 0) {
					throw new Error("provider_error: subtitle translation returned no cues");
				}

				const provider = translationResult.provider ?? "agent-llm";
				const language = translationResult.targetLanguage ?? targetLanguage;
				const updatedAt = new Date().toISOString();
				const nextCues = layer.element.cues.map((cue, index) => {
					const translatedText = translatedByIndex.get(index);
					if (!translatedText) return cue;
					return {
						...cue,
						translations: {
							...cue.translations,
							[language]: {
								...cue.translations?.[language],
								text: translatedText,
								language,
								provider,
								updatedAt,
							},
						},
					};
				});

				editor.timeline.updateElements({
					updates: [
						{
							trackId: layer.trackId,
							elementId: layer.elementId,
							patch: {
								cues: nextCues,
								revealMode: "line",
								params: {
									"subtitle.bilingual.enabled": true,
									"subtitle.bilingual.targetLanguage": language,
									"subtitle.lineBreakMode": "wrap",
								},
							},
						},
					],
				});

				context?.onProgress?.({
					stage: "translate",
					label: "Bilingual subtitles updated",
					status: "success",
				});

				return {
					translated: true,
					targetLanguage: language,
					sourceLanguage,
					provider,
					trackId: layer.trackId,
					elementId: layer.elementId,
					cueCount: nextCues.length,
					revealMode: "line",
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
