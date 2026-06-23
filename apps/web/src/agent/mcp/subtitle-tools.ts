import type { EditorCore } from "@/core";
import type { ParamValues } from "@/params";
import type {
	CreateTimelineElement,
	SubtitleElement,
	TimelineTrack,
} from "@/timeline/types";
import type { MediaAsset } from "@/media/types";
import type { MediaTime } from "@/wasm/media-time";
import type { TProjectSubtitleTrack, TProjectSubtitles } from "@/project/types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import {
	getSubtitleLayerDurationSeconds,
	normalizeSubtitleLayerCues,
} from "@/subtitles/layer";
import { DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE } from "@/subtitles/project-subtitles";
import { parseSrt } from "@/subtitles/srt";
import type {
	SubtitleLayerCue,
	SubtitleRevealMode,
	SubtitleToken,
} from "@/subtitles/types";
import {
	cutTranscriptTrackByTimeRanges,
	getTranscriptCueTokens,
	tokenEndTime,
} from "@/subtitles/transcript-editing";
import { generateUUID } from "@/utils/id";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalBooleanParam,
	optionalStringParam,
	requireEnumParam,
	requireStringParam,
} from "./validation";
import { buildDefaultTextParams } from "./text-overlay-planner";

const SUBTITLE_FORMATS = ["srt", "cues"] as const;
type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number];

const SUBTITLE_INSERT_MODES = ["project", "layer", "text-elements"] as const;
type SubtitleInsertMode = (typeof SUBTITLE_INSERT_MODES)[number];

const SUBTITLE_STYLES = ["clean", "documentary", "social"] as const;
type SubtitleStyle = (typeof SUBTITLE_STYLES)[number];

const SUBTITLE_PLACEMENTS = ["bottom", "lower_third"] as const;
type SubtitlePlacement = (typeof SUBTITLE_PLACEMENTS)[number];

const SUBTITLE_REVEAL_MODES = ["line", "token", "karaoke"] as const;
type UserSubtitleRevealMode = (typeof SUBTITLE_REVEAL_MODES)[number];

const SUBTITLE_LINE_BREAK_MODES = ["wrap", "page"] as const;
type SubtitleLineBreakMode = (typeof SUBTITLE_LINE_BREAK_MODES)[number];

const TRANSCRIPT_SOURCES = ["timeline", "asset"] as const;
type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

const TRANSCRIPT_MODES = ["plain", "anchored", "timed"] as const;
type TranscriptMode = (typeof TRANSCRIPT_MODES)[number];

const DEFAULT_EFFECT_PLAN_COUNT = 6;
const MAX_EFFECT_PLAN_COUNT = 12;

type SubtitleEffectKind =
	| "highlight_box"
	| "highlight_circle"
	| "arrow"
	| "sticker_pop";

interface SubtitleEffectPlan {
	cueIndex: number;
	text: string;
	startTimeSeconds: number;
	endTimeSeconds: number;
	durationSeconds: number;
	effectKind: SubtitleEffectKind;
	intensity: "subtle" | "medium" | "strong";
	reason: string;
	tool: "timeline_insert_visual_effect" | "animated_sticker_insert";
	params: Record<string, unknown>;
}

const DEFAULT_SUBTITLE_MAX_CHARS_PER_LINE = 30;
const DEFAULT_SUBTITLE_FONT_SIZE = 4;
const DEFAULT_SUBTITLE_BACKGROUND_COLOR = "#00000099";
const DEFAULT_SUBTITLE_LINE_BREAK_MODE: SubtitleLineBreakMode = "page";
const DEFAULT_SUBTITLE_KARAOKE_HIGHLIGHT_COLOR = "#93c5fd";

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

interface TranscriptCueAnchor {
	index: number;
	text: string;
	startTimeSeconds: number;
	endTimeSeconds: number;
	durationSeconds: number;
	timelineStartTimeSeconds?: number;
	timelineEndTimeSeconds?: number;
}

interface TranscriptCueSource {
	cues: SubtitleLayerCue[];
	source: TranscriptSource;
	hasTiming: boolean;
	assetId?: string;
	assetName?: string;
	trackId?: string;
	elementId?: string;
	element?: SubtitleElement;
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
		fontSize: DEFAULT_SUBTITLE_FONT_SIZE,
		color: "#ffffff",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		letterSpacing: 0,
		lineHeight: 1.2,
		"background.enabled": true,
		"background.color": DEFAULT_SUBTITLE_BACKGROUND_COLOR,
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
		base["background.color"] = DEFAULT_SUBTITLE_BACKGROUND_COLOR;
		base["background.cornerRadius"] = 10;
	}
	if (style === "social") {
		base.fontSize = 5.2;
		base["background.enabled"] = true;
		base["background.color"] = DEFAULT_SUBTITLE_BACKGROUND_COLOR;
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
		isRecord(value) && value.type === "subtitle" && Array.isArray(value.cues)
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

function resolveDefaultMaxCharsPerLine(): number {
	return DEFAULT_SUBTITLE_MAX_CHARS_PER_LINE;
}

function normalizeTranscriptCueText({ text }: { text: string }): string {
	return text.replace(/\s+/g, " ").trim();
}

function buildTranscriptText({ cues }: { cues: SubtitleLayerCue[] }): string {
	return cues
		.map((cue) => normalizeTranscriptCueText({ text: cue.text }))
		.filter((text) => text.length > 0)
		.join("\n");
}

function formatTranscriptTimestamp({ seconds }: { seconds: number }): string {
	const safeMilliseconds = Math.max(0, Math.round(seconds * 1000));
	const hours = Math.floor(safeMilliseconds / 3_600_000);
	const minutes = Math.floor((safeMilliseconds % 3_600_000) / 60_000);
	const wholeSeconds = Math.floor((safeMilliseconds % 60_000) / 1000);
	const milliseconds = safeMilliseconds % 1000;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
		2,
		"0",
	)}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(
		3,
		"0",
	)}`;
}

function getSubtitleElementTimelineOffsetSeconds({
	element,
}: {
	element?: SubtitleElement;
}): number | undefined {
	if (!element) return undefined;
	return (element.startTime - element.trimStart) / MEDIA_TIME_TICKS_PER_SECOND;
}

function buildTranscriptAnchors({
	cues,
	element,
}: {
	cues: SubtitleLayerCue[];
	element?: SubtitleElement;
}): TranscriptCueAnchor[] {
	const timelineOffset = getSubtitleElementTimelineOffsetSeconds({ element });
	return cues
		.map((cue, index) => {
			const text = normalizeTranscriptCueText({ text: cue.text });
			const startTimeSeconds = cue.startTime;
			const endTimeSeconds = cue.startTime + cue.duration;
			return {
				index,
				text,
				startTimeSeconds,
				endTimeSeconds,
				durationSeconds: cue.duration,
				...(timelineOffset !== undefined
					? {
							timelineStartTimeSeconds: timelineOffset + startTimeSeconds,
							timelineEndTimeSeconds: timelineOffset + endTimeSeconds,
						}
					: {}),
			};
		})
		.filter((anchor) => anchor.text.length > 0);
}

function buildTimedTranscriptText({
	anchors,
}: {
	anchors: TranscriptCueAnchor[];
}): string {
	return anchors
		.map((anchor) => {
			const startSeconds =
				anchor.timelineStartTimeSeconds ?? anchor.startTimeSeconds;
			const endSeconds = anchor.timelineEndTimeSeconds ?? anchor.endTimeSeconds;
			return `[${formatTranscriptTimestamp({
				seconds: startSeconds,
			})} -> ${formatTranscriptTimestamp({
				seconds: endSeconds,
			})}] ${anchor.text}`;
		})
		.join("\n");
}

function containsAnyPattern({
	text,
	patterns,
}: {
	text: string;
	patterns: RegExp[];
}): boolean {
	return patterns.some((pattern) => pattern.test(text));
}

function scoreEffectAnchor({
	anchor,
	totalCueCount,
}: {
	anchor: TranscriptCueAnchor;
	totalCueCount: number;
}): number {
	const text = anchor.text.toLowerCase();
	let score = 0;

	if (anchor.index === 0) score += 2;
	if (anchor.index === totalCueCount - 1) score += 1;
	if (anchor.text.length >= 8) score += 1;
	if (anchor.durationSeconds >= 1.2 && anchor.durationSeconds <= 6) score += 1;
	if (
		containsAnyPattern({
			text,
			patterns: [
				/关键|重点|核心|注意|观点|结论|总结|亮点|重点|看点/,
				/key|important|core|takeaway|highlight|summary|conclusion/,
			],
		})
	) {
		score += 4;
	}
	if (
		containsAnyPattern({
			text,
			patterns: [
				/第一|第二|第三|步骤|方法|流程|先|然后|最后/,
				/step|first|second|third|method|process|finally/,
			],
		})
	) {
		score += 3;
	}
	if (
		containsAnyPattern({
			text,
			patterns: [
				/这里|这个位置|位置|屏幕|按钮|点击|指向|看这里|看到/,
				/here|position|screen|button|click|point|look/,
			],
		})
	) {
		score += 5;
	}
	if (
		containsAnyPattern({
			text,
			patterns: [
				/惊喜|恭喜|开心|太好了|震撼|爆点|高能|彩蛋/,
				/surprise|congrats|great|wow|amazing|boom/,
			],
		})
	) {
		score += 2;
	}

	return score;
}

function clampEffectDuration({ duration }: { duration: number }): number {
	return Math.max(0.8, Math.min(3.2, Number(duration.toFixed(2))));
}

function resolveEffectPlanCount({
	params,
}: {
	params: Record<string, unknown>;
}): number {
	const requested = optionalNumberParam(params, "maxEffects");
	if (requested === undefined) return DEFAULT_EFFECT_PLAN_COUNT;
	return Math.max(1, Math.min(MAX_EFFECT_PLAN_COUNT, Math.floor(requested)));
}

function classifyEffectAnchor({ anchor }: { anchor: TranscriptCueAnchor }): {
	effectKind: SubtitleEffectKind;
	intensity: SubtitleEffectPlan["intensity"];
	reason: string;
	tool: SubtitleEffectPlan["tool"];
	params: Record<string, unknown>;
} {
	const text = anchor.text.toLowerCase();
	const startTimeSeconds =
		anchor.timelineStartTimeSeconds ?? anchor.startTimeSeconds;
	const durationSeconds = clampEffectDuration({
		duration: anchor.durationSeconds,
	});

	if (
		containsAnyPattern({
			text,
			patterns: [
				/这里|这个位置|位置|屏幕|按钮|点击|指向|看这里|看到/,
				/here|position|screen|button|click|point|look/,
			],
		})
	) {
		return {
			effectKind: "arrow",
			intensity: "medium",
			reason: "字幕指向具体位置，适合用箭头做视觉引导。",
			tool: "timeline_insert_visual_effect",
			params: {
				kind: "arrow",
				startTimeSeconds,
				durationSeconds,
				color: "#facc15",
			},
		};
	}

	if (
		containsAnyPattern({
			text,
			patterns: [
				/惊喜|恭喜|开心|太好了|震撼|爆点|高能|彩蛋/,
				/surprise|congrats|great|wow|amazing|boom/,
			],
		})
	) {
		return {
			effectKind: "sticker_pop",
			intensity: "strong",
			reason: "字幕是情绪或爆点表达，适合短促贴纸动效。",
			tool: "animated_sticker_insert",
			params: {
				query: "sparkle",
				startTimeSeconds,
				durationSeconds: Math.min(durationSeconds, 1.6),
				positionX: 0.28,
				positionY: -0.22,
				scale: 0.7,
			},
		};
	}

	if (
		containsAnyPattern({
			text,
			patterns: [
				/关键|重点|核心|注意|观点|结论|总结|亮点|看点/,
				/key|important|core|takeaway|highlight|summary|conclusion/,
			],
		})
	) {
		return {
			effectKind: "highlight_circle",
			intensity: "medium",
			reason: "字幕包含重点或结论，适合用圈选强调。",
			tool: "timeline_insert_visual_effect",
			params: {
				kind: "circle",
				startTimeSeconds,
				durationSeconds,
				color: "#facc15",
				fill: "#facc1526",
			},
		};
	}

	return {
		effectKind: "highlight_box",
		intensity: "subtle",
		reason: "字幕是可包装的信息节点，适合轻量框选强调。",
		tool: "timeline_insert_visual_effect",
		params: {
			kind: "box",
			startTimeSeconds,
			durationSeconds,
			color: "#facc15",
			fill: "#facc151f",
		},
	};
}

function buildSubtitleEffectPlan({
	anchors,
	maxEffects,
}: {
	anchors: TranscriptCueAnchor[];
	maxEffects: number;
}): SubtitleEffectPlan[] {
	return anchors
		.map((anchor) => ({
			anchor,
			score: scoreEffectAnchor({
				anchor,
				totalCueCount: anchors.length,
			}),
		}))
		.filter((item) => item.score > 0)
		.sort((left, right) => {
			if (right.score !== left.score) return right.score - left.score;
			return left.anchor.index - right.anchor.index;
		})
		.slice(0, maxEffects)
		.sort((left, right) => {
			const leftStart =
				left.anchor.timelineStartTimeSeconds ?? left.anchor.startTimeSeconds;
			const rightStart =
				right.anchor.timelineStartTimeSeconds ?? right.anchor.startTimeSeconds;
			return leftStart - rightStart;
		})
		.map(({ anchor }) => {
			const startTimeSeconds =
				anchor.timelineStartTimeSeconds ?? anchor.startTimeSeconds;
			const endTimeSeconds =
				anchor.timelineEndTimeSeconds ?? anchor.endTimeSeconds;
			const durationSeconds = clampEffectDuration({
				duration: anchor.durationSeconds,
			});
			const effect = classifyEffectAnchor({ anchor });
			return {
				cueIndex: anchor.index,
				text: anchor.text,
				startTimeSeconds,
				endTimeSeconds,
				durationSeconds,
				effectKind: effect.effectKind,
				intensity: effect.intensity,
				reason: effect.reason,
				tool: effect.tool,
				params: effect.params,
			};
		});
}

function resolveTranscriptMode({
	params,
}: {
	params: Record<string, unknown>;
}): TranscriptMode {
	const rawMode = optionalStringParam(params, "mode");
	if (!rawMode) return "anchored";
	return requireEnumParam({ mode: rawMode }, "mode", TRANSCRIPT_MODES);
}

function resolveTranscriptSource({
	params,
}: {
	params: Record<string, unknown>;
}): TranscriptSource {
	const rawSource = optionalStringParam(params, "source");
	if (!rawSource) {
		return optionalStringParam(params, "assetId") ? "asset" : "timeline";
	}
	return requireEnumParam({ source: rawSource }, "source", TRANSCRIPT_SOURCES);
}

function getTranscriptCuesFromTextAsset({
	text,
}: {
	text: string;
}): SubtitleLayerCue[] {
	return text
		.split(/\n+/)
		.map((line) => normalizeTranscriptCueText({ text: line }))
		.filter((line) => line.length > 0)
		.map((line, index) => ({
			text: line,
			startTime: index,
			duration: 1,
		}));
}

async function resolveTranscriptCueSourceFromAsset({
	editor,
	assetId,
}: {
	editor: EditorCore;
	assetId: string;
}): Promise<TranscriptCueSource> {
	const asset = editor.media
		.getAssets()
		.find((item: MediaAsset) => item.id === assetId);
	if (!asset) {
		throw new Error(`未找到媒体资源：${assetId}`);
	}
	if (asset.type !== "subtitle" && asset.type !== "text") {
		throw new Error("类型不匹配：只能从字幕或文本资源生成稿件");
	}

	const rawText = await asset.file.text();
	const cues =
		asset.type === "subtitle"
			? parseSrt({ input: rawText }).captions
			: getTranscriptCuesFromTextAsset({ text: rawText });
	if (cues.length === 0) {
		throw new Error("字幕为空：没有找到可生成稿件的文本内容");
	}
	return {
		source: "asset",
		hasTiming: asset.type === "subtitle",
		assetId: asset.id,
		assetName: asset.name,
		cues: buildLayerCues({ cues }),
	};
}

function resolveTranscriptCueSourceFromTimeline({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): TranscriptCueSource {
	const trackId =
		optionalStringParam(params, "subtitleTrackId") ??
		optionalStringParam(params, "trackId");
	const elementId =
		optionalStringParam(params, "subtitleElementId") ??
		optionalStringParam(params, "elementId");
	const layer = resolveSubtitleLayer({ editor, trackId, elementId });
	return {
		source: "timeline",
		hasTiming: true,
		trackId: layer.trackId,
		elementId: layer.elementId,
		element: layer.element,
		cues: buildLayerCues({ cues: layer.element.cues }),
	};
}

function getTranscriptAssetName({
	source,
}: {
	source: TranscriptCueSource;
}): string {
	const baseName =
		source.assetName?.replace(/\.[^.]+$/, "").trim() ||
		(source.elementId ? `subtitle-${source.elementId}` : "subtitle");
	return `${baseName}-transcript.txt`;
}

async function saveTranscriptTextAsset({
	editor,
	source,
	text,
}: {
	editor: EditorCore;
	source: TranscriptCueSource;
	text: string;
}): Promise<{ savedTextAssetId?: string; savedTextAssetName?: string }> {
	const project = editor.project.getActive();
	const fileName = getTranscriptAssetName({ source });
	const file = new File([`${text}\n`], fileName, {
		type: "text/plain;charset=utf-8",
	});
	const result = await editor.media.addMediaAsset({
		projectId: project.metadata.id,
		asset: {
			name: file.name,
			type: "text",
			file,
			url:
				typeof URL !== "undefined" && "createObjectURL" in URL
					? URL.createObjectURL(file)
					: undefined,
		},
	});
	if (!result) return {};
	return {
		savedTextAssetId: result.id,
		savedTextAssetName: result.name,
	};
}

const DEFAULT_FILLER_WORDS = [
	"啊",
	"啊啊",
	"嗯",
	"嗯嗯",
	"呃",
	"呃呃",
	"额",
	"额额",
	"哦",
	"噢",
	"喔",
	"唔",
	"唉",
	"哎",
	"呐",
	"哈",
	"呃嗯",
	"um",
	"uh",
	"uhh",
	"umm",
	"er",
	"erm",
	"ah",
	"oh",
] as const;

interface FillerCutCandidate {
	trackId: string;
	trackLabel: string;
	sourceTrackId: string;
	cueIndex: number;
	tokenIndex: number;
	text: string;
	startTime: number;
	endTime: number;
	duration: number;
}

function normalizeFillerText({ text }: { text: string }): string {
	return text
		.toLowerCase()
		.replace(/[\s，。！？、,.!?;；:：'"“”‘’（）()[\]{}<>《》…~·\-—_]/g, "")
		.trim();
}

function resolveFillerWords({
	value,
}: {
	value: unknown;
}): Set<string> {
	const customWords = Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
	return new Set(
		[...DEFAULT_FILLER_WORDS, ...customWords]
			.map((word) => normalizeFillerText({ text: word }))
			.filter((word) => word.length > 0),
	);
}

function getStoredProjectTranscriptTracks({
	subtitles,
}: {
	subtitles: TProjectSubtitles;
}): TProjectSubtitleTrack[] {
	if (subtitles.tracks && subtitles.tracks.length > 0) {
		return subtitles.tracks;
	}
	if (subtitles.cues.length === 0) return [];
	return [
		{
			id: "track:global",
			label: "全局字幕",
			cues: subtitles.cues,
			updatedAt: subtitles.updatedAt,
		},
	];
}

function resolveFillerCutTracks({
	subtitles,
	params,
}: {
	subtitles: TProjectSubtitles;
	params: Record<string, unknown>;
}): TProjectSubtitleTrack[] {
	const tracks = getStoredProjectTranscriptTracks({ subtitles });
	if (optionalBooleanParam(params, "allTracks") === true) {
		return tracks;
	}
	const requestedTrackId =
		optionalStringParam(params, "transcriptTrackId") ??
		optionalStringParam(params, "trackId") ??
		subtitles.selectedTrackId;
	if (requestedTrackId) {
		return tracks.filter((track) => track.id === requestedTrackId);
	}
	return tracks.slice(0, 1);
}

function findFillerCutCandidates({
	tracks,
	fillerWords,
}: {
	tracks: TProjectSubtitleTrack[];
	fillerWords: Set<string>;
}): FillerCutCandidate[] {
	return tracks.flatMap((track) => {
		const sourceTrackId = track.sourceTrackId;
		if (!sourceTrackId) return [];
		return track.cues.flatMap((cue, cueIndex) =>
			getTranscriptCueTokens({ cue }).flatMap((token, tokenIndex) => {
				const normalized = normalizeFillerText({ text: token.text });
				if (!fillerWords.has(normalized)) return [];
				const endTime = tokenEndTime({ token });
				if (endTime <= token.startTime) return [];
				return [
					{
						trackId: track.id,
						trackLabel: track.label,
						sourceTrackId,
						cueIndex,
						tokenIndex,
						text: token.text,
						startTime: token.startTime,
						endTime,
						duration: endTime - token.startTime,
					},
				];
			}),
		);
	});
}

function mergeSecondRanges({
	ranges,
}: {
	ranges: Array<{ startTime: number; endTime: number }>;
}): Array<{ startTime: number; endTime: number }> {
	const sortedRanges = ranges
		.filter((range) => range.endTime > range.startTime)
		.sort((left, right) => left.startTime - right.startTime);
	const result: Array<{ startTime: number; endTime: number }> = [];
	for (const range of sortedRanges) {
		const previous = result.at(-1);
		if (!previous || range.startTime > previous.endTime) {
			result.push({ ...range });
			continue;
		}
		previous.endTime = Math.max(previous.endTime, range.endTime);
	}
	return result;
}

function trackElementsOverlappingTimeRange({
	track,
	startTime,
	endTime,
}: {
	track: TimelineTrack;
	startTime: MediaTime;
	endTime: MediaTime;
}): Array<{ trackId: string; elementId: string }> {
	return track.elements
		.filter((element) => {
			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;
			return elementStart < endTime && elementEnd > startTime;
		})
		.map((element) => ({
			trackId: track.id,
			elementId: element.id,
		}));
}

function buildFillerCutTargets({
	editor,
	mediaTimeFromSeconds,
	candidates,
	paddingSeconds,
}: {
	editor: EditorCore;
	mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime;
	candidates: FillerCutCandidate[];
	paddingSeconds: number;
}): Array<{
	trackId: string;
	elementId: string;
	ranges: Array<{ startTime: MediaTime; endTime: MediaTime }>;
}> {
	const targetsByElement = new Map<
		string,
		{
			trackId: string;
			elementId: string;
			ranges: Array<{ startTime: MediaTime; endTime: MediaTime }>;
		}
	>();
	for (const candidate of candidates) {
		const sourceTrack = editor.timeline.getTrackById({
			trackId: candidate.sourceTrackId,
		});
		if (!sourceTrack) continue;
		const startSeconds = Math.max(0, candidate.startTime - paddingSeconds);
		const endSeconds = Math.max(startSeconds, candidate.endTime + paddingSeconds);
		const startTime = mediaTimeFromSeconds({ seconds: startSeconds });
		const endTime = mediaTimeFromSeconds({ seconds: endSeconds });
		for (const elementRef of trackElementsOverlappingTimeRange({
			track: sourceTrack,
			startTime,
			endTime,
		})) {
			const key = `${elementRef.trackId}:${elementRef.elementId}`;
			const target =
				targetsByElement.get(key) ??
				{
					...elementRef,
					ranges: [],
				};
			target.ranges.push({ startTime, endTime });
			targetsByElement.set(key, target);
		}
	}
	return Array.from(targetsByElement.values());
}

function filterApplicableFillerCandidates({
	editor,
	mediaTimeFromSeconds,
	candidates,
	paddingSeconds,
}: {
	editor: EditorCore;
	mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime;
	candidates: FillerCutCandidate[];
	paddingSeconds: number;
}): FillerCutCandidate[] {
	return candidates.filter((candidate) => {
		const sourceTrack = editor.timeline.getTrackById({
			trackId: candidate.sourceTrackId,
		});
		if (!sourceTrack) return false;
		const startSeconds = Math.max(0, candidate.startTime - paddingSeconds);
		const endSeconds = Math.max(startSeconds, candidate.endTime + paddingSeconds);
		const startTime = mediaTimeFromSeconds({ seconds: startSeconds });
		const endTime = mediaTimeFromSeconds({ seconds: endSeconds });
		return (
			trackElementsOverlappingTimeRange({
				track: sourceTrack,
				startTime,
				endTime,
			}).length > 0
		);
	});
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
			name: "subtitles_extract_transcript",
			description:
				"Convert an existing subtitle asset or timeline subtitle layer into an AI-readable transcript. Default output keeps clean text plus timing anchors so the model can understand the script and still map edits back to exact subtitle times.",
			parameters: {
				source: {
					type: "string",
					description:
						"Transcript source: timeline for an existing subtitle layer, or asset for a subtitle/text media asset. Defaults to asset when assetId is provided, otherwise timeline.",
					optional: true,
				},
				assetId: {
					type: "string",
					description: "Subtitle or text media asset ID when source is asset.",
					optional: true,
				},
				subtitleTrackId: {
					type: "string",
					description:
						"Optional subtitle track ID when source is timeline. Omit to use the first subtitle layer.",
					optional: true,
				},
				subtitleElementId: {
					type: "string",
					description:
						"Optional subtitle element ID when source is timeline. Omit to use the first subtitle layer.",
					optional: true,
				},
				mode: {
					type: "string",
					description:
						"Transcript view: plain returns only clean text; anchored returns clean text plus cue anchors; timed also includes human-readable timestamped lines.",
					optional: true,
				},
				saveAsTextAsset: {
					type: "boolean",
					description:
						"Save the clean transcript as a TXT media asset in the project library.",
					optional: true,
				},
			},
			handler: async (params) => {
				const source = resolveTranscriptSource({ params });
				const mode = resolveTranscriptMode({ params });
				const cueSource =
					source === "asset"
						? await resolveTranscriptCueSourceFromAsset({
								editor,
								assetId: requireStringParam(params, "assetId"),
							})
						: resolveTranscriptCueSourceFromTimeline({ editor, params });
				const text = buildTranscriptText({ cues: cueSource.cues });
				if (mode === "timed" && !cueSource.hasTiming) {
					throw new Error(
						"文本资源没有时间戳：请使用 mode=plain，或选择字幕资产/时间线字幕层。",
					);
				}
				const anchors = cueSource.hasTiming
					? buildTranscriptAnchors({
							cues: cueSource.cues,
							element: cueSource.element,
						})
					: [];
				const savedTextAsset = optionalBooleanParam(params, "saveAsTextAsset")
					? await saveTranscriptTextAsset({
							editor,
							source: cueSource,
							text,
						})
					: {};

				return {
					source: cueSource.source,
					mode,
					hasTiming: cueSource.hasTiming,
					text,
					cueCount: cueSource.cues.length,
					...(cueSource.assetId
						? { assetId: cueSource.assetId, assetName: cueSource.assetName }
						: {}),
					...(cueSource.trackId
						? { trackId: cueSource.trackId, elementId: cueSource.elementId }
						: {}),
					...(mode !== "plain" ? { anchors } : {}),
					...(mode === "timed"
						? { timedText: buildTimedTranscriptText({ anchors }) }
						: {}),
					...savedTextAsset,
				};
			},
		},
		{
			name: "subtitles_plan_effects",
			description:
				"Plan automatic visual effects from a timed subtitle asset or timeline subtitle layer. Use this before adding automatic visual effects, emphasis stickers, arrows, circles, highlight boxes, or subtitle-timed packaging so the model can execute effects at exact subtitle times.",
			parameters: {
				source: {
					type: "string",
					description:
						"Planning source: timeline for an existing subtitle layer, or asset for a subtitle media asset. Defaults to asset when assetId is provided, otherwise timeline.",
					optional: true,
				},
				assetId: {
					type: "string",
					description: "Subtitle media asset ID when source is asset.",
					optional: true,
				},
				subtitleTrackId: {
					type: "string",
					description:
						"Optional subtitle track ID when source is timeline. Omit to use the first subtitle layer.",
					optional: true,
				},
				subtitleElementId: {
					type: "string",
					description:
						"Optional subtitle element ID when source is timeline. Omit to use the first subtitle layer.",
					optional: true,
				},
				maxEffects: {
					type: "number",
					description:
						"Maximum effect suggestions to return. Defaults to 6 and is capped at 12.",
					optional: true,
				},
			},
			handler: async (params) => {
				const source = resolveTranscriptSource({ params });
				const cueSource =
					source === "asset"
						? await resolveTranscriptCueSourceFromAsset({
								editor,
								assetId: requireStringParam(params, "assetId"),
							})
						: resolveTranscriptCueSourceFromTimeline({ editor, params });
				if (!cueSource.hasTiming) {
					throw new Error(
						"字幕素材没有时间戳：请使用 SRT/VTT 字幕素材或时间线字幕层来规划特效。",
					);
				}
				const anchors = buildTranscriptAnchors({
					cues: cueSource.cues,
					element: cueSource.element,
				});
				const plannedEffects = buildSubtitleEffectPlan({
					anchors,
					maxEffects: resolveEffectPlanCount({ params }),
				});

				return {
					source: cueSource.source,
					hasTiming: cueSource.hasTiming,
					cueCount: cueSource.cues.length,
					...(cueSource.assetId
						? { assetId: cueSource.assetId, assetName: cueSource.assetName }
						: {}),
					...(cueSource.trackId
						? { trackId: cueSource.trackId, elementId: cueSource.elementId }
						: {}),
					plannedEffects,
					nextSteps: [
						"Review plannedEffects, then call each item's tool with its params. Prefer timeline_insert_visual_effect for arrows, boxes, circles, and mosaic callouts.",
						"Use animated_sticker_insert only for short emotional beats; keep stickers subtle and avoid covering subtitles or important faces/UI.",
						"Skip weak suggestions instead of filling every cue. Do not duplicate effects on the same subtitle line.",
					],
				};
			},
		},
		{
			name: "subtitles_import",
			description:
				"Import subtitles into the project-level global transcript by default. Accepts SRT text or structured cues, including optional per-word/per-character tokens.",
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
					sourceTrackId: {
						type: "string",
						description:
							"Optional source audio track ID for project-global transcript grouping.",
						optional: true,
					},
					sourceTrackName: {
						type: "string",
						description:
							"Optional source audio track display name for project-global transcript grouping.",
						optional: true,
					},
					sourceElementId: {
						type: "string",
						description:
							"Optional source audio element ID when transcript was generated from one clip.",
						optional: true,
					},
				insertMode: {
					type: "string",
					description:
						"Insert mode: project for the global transcript, layer for a legacy timeline subtitle component, or text-elements for legacy one-element-per-cue insertion.",
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
						"Line overflow mode: wrap for automatic multi-line wrapping, or page to show one wrapped line at a time. Defaults to page.",
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
					description: "Karaoke highlight color, e.g. #93c5fd.",
					optional: true,
				},
				subtitleAssetId: {
					type: "string",
					description:
						"Optional linked subtitle media asset ID. Unified subtitle layers store this so cue edits can sync back to the asset.",
					optional: true,
				},
				subtitleAssetName: {
					type: "string",
					description: "Optional linked subtitle media asset display name.",
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
					: "project";

				const groupId = `subtitle-${generateUUID()}`;
				const canvasSize = getCanvasSize({ editor });
				const maxCharsPerLine =
					optionalNumberParam(params, "maxCharsPerLine") ??
					(insertMode === "project"
						? DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE
						: resolveDefaultMaxCharsPerLine());
				const rawLineBreakMode = optionalStringParam(params, "lineBreakMode");
				const lineBreakMode = rawLineBreakMode
					? (requireEnumParam(
							{ lineBreakMode: rawLineBreakMode },
							"lineBreakMode",
							SUBTITLE_LINE_BREAK_MODES,
						) as SubtitleLineBreakMode)
					: DEFAULT_SUBTITLE_LINE_BREAK_MODE;
				const rawRevealMode = optionalStringParam(params, "revealMode");
				const explicitRevealMode = rawRevealMode
					? (requireEnumParam(
							{ revealMode: rawRevealMode },
							"revealMode",
							SUBTITLE_REVEAL_MODES,
						) as UserSubtitleRevealMode)
					: undefined;
				const highlightColor =
					optionalStringParam(params, "highlightColor") ??
					DEFAULT_SUBTITLE_KARAOKE_HIGHLIGHT_COLOR;
				const subtitleAssetId = optionalStringParam(params, "subtitleAssetId");
					const subtitleAssetName = optionalStringParam(
						params,
						"subtitleAssetName",
					);
					const sourceTrackId = optionalStringParam(params, "sourceTrackId");
					const sourceTrackName = optionalStringParam(params, "sourceTrackName");
					const sourceElementId = optionalStringParam(params, "sourceElementId");
					const styleParams = buildSubtitleStyleParams({
					style,
					placement,
					canvasSize,
				});
				const layerCues = buildLayerCues({
					cues,
				});
				const revealMode: SubtitleRevealMode =
					explicitRevealMode ??
					(layerCues.some((cue) => (cue.tokens?.length ?? 0) > 0)
						? "token"
						: "line");

				if (insertMode === "project") {
					const previousSubtitles =
						editor.project.getActiveOrNull()?.settings.subtitles ?? null;
					const sourceId = sourceTrackId ?? "global";
					const trackIdForTranscript = `track:${sourceId}`;
					const previousTracks = previousSubtitles?.tracks ?? [];
					const previousTrack = previousTracks.find(
						(track) => track.id === trackIdForTranscript,
					);
					const assetFields = subtitleAssetId
						? {
								assetId: subtitleAssetId,
								...(subtitleAssetName ? { assetName: subtitleAssetName } : {}),
							}
						: {};
					const nextTrack: TProjectSubtitleTrack = {
						id: trackIdForTranscript,
						label:
							sourceTrackName ??
							(sourceTrackId ? `轨道 ${sourceTrackId}` : "全局字幕"),
						cues: layerCues,
						renderEnabled: previousTrack?.renderEnabled ?? true,
						...(sourceTrackId ? { sourceTrackId } : {}),
						...(sourceElementId ? { sourceElementId } : {}),
						...assetFields,
						updatedAt: new Date().toISOString(),
					};
					const nextTracks = [
						...previousTracks.filter((track) => track.id !== trackIdForTranscript),
						nextTrack,
					];
					void editor.project.updateSettings({
						settings: {
							subtitles: {
								enabled: true,
								cues: sourceTrackId
									? (previousSubtitles?.cues ?? [])
									: layerCues,
								tracks: nextTracks,
								selectedTrackId: trackIdForTranscript,
								revealMode,
								lineBreakMode,
								maxCharsPerLine,
								...(subtitleAssetId
									? {
											assetId: subtitleAssetId,
											...(subtitleAssetName
												? { assetName: subtitleAssetName }
												: {}),
										}
									: previousSubtitles?.assetId
										? {
												assetId: previousSubtitles.assetId,
												...(previousSubtitles.assetName
													? { assetName: previousSubtitles.assetName }
													: {}),
											}
										: {}),
								updatedAt: new Date().toISOString(),
							},
						},
					});

					return {
						imported: true,
						insertMode,
						cueCount: layerCues.length,
						skippedCueCount,
						warnings,
						style,
						placement,
						revealMode,
						global: true,
						sourceTrackId,
						sourceTrackName: nextTrack.label,
						...(subtitleAssetId
							? {
									subtitleAssetId,
									...(subtitleAssetName ? { subtitleAssetName } : {}),
								}
							: {}),
					};
				}

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

				if (insertMode === "layer") {
					const layerDuration = getSubtitleLayerDurationSeconds({
						cues: layerCues,
					});
					const layerDurationTime = mediaTimeFromSeconds({
						seconds: layerDuration,
					});
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
								...(subtitleAssetId
									? {
											"subtitle.assetId": subtitleAssetId,
											...(subtitleAssetName
												? { "subtitle.assetName": subtitleAssetName }
												: {}),
										}
									: {}),
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
						...(subtitleAssetId
							? {
									subtitleAssetId,
									...(subtitleAssetName ? { subtitleAssetName } : {}),
								}
							: {}),
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
			name: "subtitles_cut_filler_words",
			description:
				"基于项目级全局文字稿识别并直接剪除独立气口词/口头气声，如“啊、嗯、呃、哦、额”。用于子 Agent 在生成全局字幕后做一键剪气口；如果还没有全局文字稿，先调用 subtitles_generate_from_video。",
			parameters: {
				transcriptTrackId: {
					type: "string",
					description:
						"要处理的全局文字稿轨道 ID。省略时使用当前选中的文字稿轨道。",
					optional: true,
				},
				trackId: {
					type: "string",
					description: "transcriptTrackId 的兼容别名。",
					optional: true,
				},
				allTracks: {
					type: "boolean",
					description:
						"是否处理所有带 sourceTrackId 的文字稿轨道。默认 false，只处理当前轨道。",
					optional: true,
				},
				fillerWords: {
					type: "array",
					description:
						"额外气口词数组。工具默认已包含 啊、嗯、呃、哦、额、um、uh 等保守词表。",
					items: { type: "string", description: "气口词" },
					optional: true,
				},
				paddingMs: {
					type: "number",
					description:
						"每个气口词两侧额外剪掉的毫秒数，默认 0。通常保持 0，避免误伤语义。",
					optional: true,
				},
			},
			mutating: true,
			// eslint-disable-next-line shotlyx/prefer-object-params -- MCP tool handlers receive positional params/context.
			handler: (params, context) => {
				const subtitles = editor.project.getActiveOrNull()?.settings.subtitles;
				if (!subtitles) {
					throw new Error("当前项目还没有全局文字稿，请先生成字幕");
				}
				const candidateTracks = resolveFillerCutTracks({ subtitles, params });
				if (candidateTracks.length === 0) {
					throw new Error("没有找到可处理的文字稿轨道");
				}
				const paddingSeconds =
					Math.max(0, optionalNumberParam(params, "paddingMs") ?? 0) / 1000;
				const candidates = findFillerCutCandidates({
					tracks: candidateTracks,
					fillerWords: resolveFillerWords({ value: params.fillerWords }),
				});

				if (candidates.length === 0) {
					return {
						applied: false,
						candidateCount: 0,
						removedSeconds: 0,
						message: "没有识别到可剪除的独立气口词。",
					};
				}

				context?.onProgress?.({
					stage: "subtitle-filler-cut",
					label: "正在剪除气口",
					status: "running",
					detail: `${candidates.length} tokens`,
				});

				const applicableCandidates = filterApplicableFillerCandidates({
					editor,
					mediaTimeFromSeconds,
					candidates,
					paddingSeconds,
				});

				if (applicableCandidates.length === 0) {
					return {
						applied: false,
						candidateCount: candidates.length,
						removedSeconds: 0,
						message: "识别到了气口词，但没有命中对应素材片段。",
					};
				}

				const targets = buildFillerCutTargets({
					editor,
					mediaTimeFromSeconds,
					candidates: applicableCandidates,
					paddingSeconds,
				});

				if (targets.length === 0) {
					return {
						applied: false,
						candidateCount: applicableCandidates.length,
						removedSeconds: 0,
						message: "识别到了气口词，但没有命中对应素材片段。",
					};
				}

				const didApply = editor.timeline.applySilenceCutPlan({ targets });
				if (!didApply) {
					return {
						applied: false,
						candidateCount: candidates.length,
						removedSeconds: 0,
						message: "剪气口没有产生可应用的时间线变化。",
					};
				}

				const cutRanges = mergeSecondRanges({
					ranges: applicableCandidates.map((candidate) => ({
						startTime: Math.max(0, candidate.startTime - paddingSeconds),
						endTime: candidate.endTime + paddingSeconds,
					})),
				});
				const currentSubtitles =
					editor.project.getActiveOrNull()?.settings.subtitles ?? subtitles;
				const storedTracks = getStoredProjectTranscriptTracks({
					subtitles: currentSubtitles,
				});
				const nextTracks = storedTracks.map((track) =>
					cutTranscriptTrackByTimeRanges({
						track,
						ranges: cutRanges,
					}),
				);
				const legacyOnly =
					(!currentSubtitles.tracks || currentSubtitles.tracks.length === 0) &&
					nextTracks.length === 1 &&
					nextTracks[0]?.id === "track:global";
				void editor.project.updateSettings({
					settings: {
						subtitles: {
							...currentSubtitles,
							tracks: nextTracks,
							cues: legacyOnly
								? (nextTracks[0]?.cues ?? [])
								: currentSubtitles.cues,
							updatedAt: new Date().toISOString(),
						},
					},
				});

				const removedSeconds = cutRanges.reduce(
					(total, range) => total + (range.endTime - range.startTime),
					0,
				);
				context?.onProgress?.({
					stage: "subtitle-filler-cut",
					label: "气口剪除完成",
					status: "success",
					detail: `${candidates.length} tokens`,
				});

				return {
					applied: true,
					candidateCount: applicableCandidates.length,
					rangeCount: cutRanges.length,
					targetCount: targets.length,
					removedSeconds,
					tracks: Array.from(
						new Set(applicableCandidates.map((candidate) => candidate.trackId)),
					),
					candidates: applicableCandidates
						.slice(0, 20)
						.map((candidate) => ({
							text: candidate.text,
							trackId: candidate.trackId,
							sourceTrackId: candidate.sourceTrackId,
							startTimeSeconds: candidate.startTime,
							endTimeSeconds: candidate.endTime,
						})),
					truncatedCandidates: applicableCandidates.length > 20,
					message: `已剪掉 ${applicableCandidates.length} 个气口词，时间线缩短约 ${removedSeconds.toFixed(2)} 秒。`,
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
				const targetLanguage = requireStringParam(
					params,
					"targetLanguage",
				).trim();
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
					throw new Error(await parseSubtitleTranslationApiError({ response }));
				}

				const translationResult = parseSubtitleTranslationResult({
					value: await response.json(),
				});
				const translatedByIndex = new Map(
					translationResult.translations.map((item) => [item.index, item.text]),
				);
				if (translatedByIndex.size === 0) {
					throw new Error(
						"provider_error: subtitle translation returned no cues",
					);
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
									"subtitle.lineBreakMode": DEFAULT_SUBTITLE_LINE_BREAK_MODE,
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
