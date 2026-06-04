import type { TextElement, SubtitleElement } from "@/timeline";
import type {
	SubtitleCue,
	SubtitleCueTranslation,
	SubtitleLineBreakMode,
	SubtitleLayerCue,
	SubtitleRevealMode,
	SubtitleToken,
} from "./types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const EPSILON_SECONDS = 1 / 1000;
const DEFAULT_MAX_CHARS_PER_LINE_CJK = 18;
const DEFAULT_MAX_CHARS_PER_LINE_WORDS = 42;
const DEFAULT_HIGHLIGHT_COLOR = "#22d3ee";

export interface ResolvedSubtitleText {
	text: string;
	highlightText?: string;
	highlightColor?: string;
	cue: SubtitleLayerCue;
	cueIndex: number;
	sourceTimeSeconds: number;
}

export function getSubtitleSourceTimeSeconds({
	element,
	timelineTime,
}: {
	element: SubtitleElement;
	timelineTime: number;
}): number {
	return (
		(timelineTime - element.startTime + element.trimStart) /
		MEDIA_TIME_TICKS_PER_SECOND
	);
}

export function normalizeSubtitleLayerCues({
	cues,
}: {
	cues: SubtitleCue[];
}): SubtitleLayerCue[] {
	return cues
		.filter((cue) => cue.text.trim().length > 0 && cue.duration > 0)
		.map((cue) => ({
			...cue,
			text: cue.text.trim(),
			tokens: normalizeTokens({ cue }),
		}))
		.sort((a, b) => a.startTime - b.startTime);
}

export function getSubtitleLayerDurationSeconds({
	cues,
}: {
	cues: SubtitleLayerCue[];
}): number {
	return cues.reduce(
		(maxEnd, cue) => Math.max(maxEnd, cue.startTime + cue.duration),
		0,
	);
}

export function findSubtitleCueAtSourceTime({
	cues,
	sourceTimeSeconds,
}: {
	cues: SubtitleLayerCue[];
	sourceTimeSeconds: number;
}): { cue: SubtitleLayerCue; cueIndex: number } | null {
	const cueIndex = cues.findIndex(
		(cue) =>
			sourceTimeSeconds >= cue.startTime - EPSILON_SECONDS &&
			sourceTimeSeconds < cue.startTime + cue.duration + EPSILON_SECONDS,
	);
	if (cueIndex === -1) {
		return null;
	}
	return { cue: cues[cueIndex], cueIndex };
}

export function resolveSubtitleTextAtTime({
	element,
	timelineTime,
	revealMode = element.revealMode ?? "line",
}: {
	element: SubtitleElement;
	timelineTime: number;
	revealMode?: SubtitleRevealMode;
}): ResolvedSubtitleText | null {
	if (
		timelineTime < element.startTime ||
		timelineTime >= element.startTime + element.duration
	) {
		return null;
	}

	const sourceTimeSeconds = getSubtitleSourceTimeSeconds({
		element,
		timelineTime,
	});
	const match = findSubtitleCueAtSourceTime({
		cues: element.cues,
		sourceTimeSeconds,
	});
	if (!match) {
		return null;
	}

	const normalizedRevealMode = normalizeRevealMode({ revealMode });
	const text = resolveTextForMode({
		cue: match.cue,
		sourceTimeSeconds,
		revealMode: normalizedRevealMode,
		element,
	});
	return {
		...text,
		cue: match.cue,
		cueIndex: match.cueIndex,
		sourceTimeSeconds,
	};
}

export function buildRenderableTextElementFromSubtitle({
	element,
	timelineTime,
}: {
	element: SubtitleElement;
	timelineTime: number;
}): TextElement | null {
	const resolved = resolveSubtitleTextAtTime({ element, timelineTime });
	if (!resolved || resolved.text.length === 0) {
		return null;
	}

	return {
		id: element.id,
		type: "text",
		name: element.name,
		startTime: element.startTime,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		sourceDuration: element.sourceDuration,
		animations: element.animations,
		hidden: element.hidden,
		effects: element.effects,
		params: {
			...element.params,
			content: resolved.text,
			"subtitle.highlightText": resolved.highlightText ?? "",
			"subtitle.highlightColor":
				resolved.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR,
		},
	};
}

function normalizeTokens({ cue }: { cue: SubtitleCue }): SubtitleToken[] | undefined {
	const maybeCueWithTokens = cue as SubtitleLayerCue;
	if (!maybeCueWithTokens.tokens || maybeCueWithTokens.tokens.length === 0) {
		return undefined;
	}
	return maybeCueWithTokens.tokens
		.filter((token) => token.text.length > 0 && token.duration > 0)
		.map((token) => ({
			...token,
			startTime: resolveAbsoluteTokenStartTime({ cue, token }),
		}))
		.sort((a, b) => a.startTime - b.startTime);
}

function resolveAbsoluteTokenStartTime({
	cue,
	token,
}: {
	cue: SubtitleCue;
	token: SubtitleToken;
}): number {
	const tokenLooksRelative =
		token.startTime < cue.startTime &&
		token.startTime <= cue.duration + EPSILON_SECONDS;
	return tokenLooksRelative ? cue.startTime + token.startTime : token.startTime;
}

function resolveTokenRevealText({
	cue,
	sourceTimeSeconds,
	fallbackToCue = false,
}: {
	cue: SubtitleLayerCue;
	sourceTimeSeconds: number;
	fallbackToCue?: boolean;
}): string {
	const tokens = getVisibleTokens({ cue, sourceTimeSeconds });
	if (!tokens || tokens.length === 0) {
		return cue.tokens && cue.tokens.length > 0
			? ""
			: fallbackToCue
				? cue.text
				: "";
	}
	return joinTokens({
		tokens,
		originalText: cue.text,
	});
}

function getVisibleTokens({
	cue,
	sourceTimeSeconds,
}: {
	cue: SubtitleLayerCue;
	sourceTimeSeconds: number;
}): SubtitleToken[] | undefined {
	const tokens = cue.tokens;
	if (!tokens || tokens.length === 0) {
		return undefined;
	}
	return tokens.filter(
		(token) =>
			sourceTimeSeconds >=
			resolveAbsoluteTokenStartTime({ cue, token }) - EPSILON_SECONDS,
	);
}

type NormalizedRevealMode = Exclude<SubtitleRevealMode, "full">;

function normalizeRevealMode({
	revealMode,
}: {
	revealMode: SubtitleRevealMode;
}): NormalizedRevealMode {
	return revealMode === "full" ? "line" : revealMode;
}

function resolveTextForMode({
	cue,
	sourceTimeSeconds,
	revealMode,
	element,
}: {
	cue: SubtitleLayerCue;
	sourceTimeSeconds: number;
	revealMode: NormalizedRevealMode;
	element: SubtitleElement;
}): Pick<ResolvedSubtitleText, "text" | "highlightText" | "highlightColor"> {
	const translation = resolveCueTranslation({ cue, element });
	if (resolveBilingualEnabled({ element }) && translation) {
		return applyBilingualLineLayout({ cue, translation, element });
	}

	const maxCharsPerLine = resolveMaxCharsPerLine({ element, cue });
	const lineBreakMode = resolveLineBreakMode({ element });

	if (revealMode === "token") {
		return applySubtitleLineLayout({
			cue,
			text: resolveTokenRevealText({
				cue,
				sourceTimeSeconds,
				fallbackToCue: true,
			}),
			sourceTimeSeconds,
			revealMode,
			maxCharsPerLine,
			lineBreakMode,
		});
	}

	if (revealMode === "karaoke") {
		return applySubtitleLineLayout({
			cue,
			text: cue.text,
			highlightText: resolveTokenRevealText({ cue, sourceTimeSeconds }),
			highlightColor: resolveHighlightColor({ element }),
			sourceTimeSeconds,
			revealMode,
			maxCharsPerLine,
			lineBreakMode,
		});
	}

	return applySubtitleLineLayout({
		cue,
		text: cue.text,
		sourceTimeSeconds,
		revealMode,
		maxCharsPerLine,
		lineBreakMode,
	});
}

function resolveMaxCharsPerLine({
	element,
	cue,
}: {
	element: SubtitleElement;
	cue: SubtitleLayerCue;
}): number {
	return resolveMaxCharsForText({ element, text: cue.text });
}

function resolveLineBreakMode({
	element,
}: {
	element: SubtitleElement;
}): SubtitleLineBreakMode {
	return element.params["subtitle.lineBreakMode"] === "page" ? "page" : "wrap";
}

function resolveHighlightColor({
	element,
}: {
	element: SubtitleElement;
}): string {
	const value = element.params["subtitle.highlightColor"];
	return typeof value === "string" && value.trim().length > 0
		? value
		: DEFAULT_HIGHLIGHT_COLOR;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveBilingualEnabled({
	element,
}: {
	element: SubtitleElement;
}): boolean {
	const value = element.params["subtitle.bilingual.enabled"];
	return value === true || value === "true";
}

function resolveBilingualTargetLanguage({
	element,
}: {
	element: SubtitleElement;
}): string | null {
	const value = element.params["subtitle.bilingual.targetLanguage"];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function normalizeCueTranslation({
	value,
}: {
	value: unknown;
}): SubtitleCueTranslation | null {
	if (typeof value === "string" && value.trim().length > 0) {
		return { text: value.trim() };
	}
	if (!isRecord(value)) return null;
	const text = value.text;
	if (typeof text !== "string" || text.trim().length === 0) {
		return null;
	}
	return {
		text: text.trim(),
		...(typeof value.language === "string" ? { language: value.language } : {}),
		...(typeof value.provider === "string" ? { provider: value.provider } : {}),
		...(typeof value.updatedAt === "string"
			? { updatedAt: value.updatedAt }
			: {}),
	};
}

function resolveCueTranslation({
	cue,
	element,
}: {
	cue: SubtitleLayerCue;
	element: SubtitleElement;
}): SubtitleCueTranslation | null {
	const translations = cue.translations;
	if (!translations) return null;

	const targetLanguage = resolveBilingualTargetLanguage({ element });
	if (targetLanguage) {
		const exactTranslation = normalizeCueTranslation({
			value: translations[targetLanguage],
		});
		if (exactTranslation) return exactTranslation;
	}

	const fallbackValue = Object.values(translations).find(
		(value) => normalizeCueTranslation({ value }) !== null,
	);
	return fallbackValue
		? normalizeCueTranslation({ value: fallbackValue })
		: null;
}

function resolveMaxCharsForText({
	element,
	text,
}: {
	element: SubtitleElement;
	text: string;
}): number {
	const value = element.params["subtitle.maxCharsPerLine"];
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return Math.max(1, Math.round(value));
	}
	return hasCjk({ value: text })
		? DEFAULT_MAX_CHARS_PER_LINE_CJK
		: DEFAULT_MAX_CHARS_PER_LINE_WORDS;
}

function applyBilingualLineLayout({
	cue,
	translation,
	element,
}: {
	cue: SubtitleLayerCue;
	translation: SubtitleCueTranslation;
	element: SubtitleElement;
}): Pick<ResolvedSubtitleText, "text" | "highlightText" | "highlightColor"> {
	const sourceLines = wrapTextByChars({
		text: cue.text,
		maxCharsPerLine: resolveMaxCharsForText({ element, text: cue.text }),
	});
	const translationLines = wrapTextByChars({
		text: translation.text,
		maxCharsPerLine: resolveMaxCharsForText({
			element,
			text: translation.text,
		}),
	});
	const layout = element.params["subtitle.bilingual.layout"];
	const lines =
		layout === "translation-first"
			? [...translationLines, ...sourceLines]
			: [...sourceLines, ...translationLines];
	return { text: lines.join("\n") };
}

interface SubtitleLineSegment {
	text: string;
	startIndex: number;
	endIndex: number;
}

type WordSegmenterResult = {
	segment: string;
	isWordLike?: boolean;
};

type WordSegmenter = {
	segment(input: string): Iterable<WordSegmenterResult>;
};

type WrappedTextUnitKind = "space" | "word" | "punctuation";

interface WrappedTextUnit {
	text: string;
	kind: WrappedTextUnitKind;
}

let cachedWordSegmenter: WordSegmenter | null | undefined;

function applySubtitleLineLayout({
	cue,
	text,
	highlightText,
	highlightColor,
	sourceTimeSeconds,
	revealMode,
	maxCharsPerLine,
	lineBreakMode,
}: {
	cue: SubtitleLayerCue;
	text: string;
	highlightText?: string;
	highlightColor?: string;
	sourceTimeSeconds: number;
	revealMode: NormalizedRevealMode;
	maxCharsPerLine: number;
	lineBreakMode: SubtitleLineBreakMode;
}): Pick<ResolvedSubtitleText, "text" | "highlightText" | "highlightColor"> {
	if (lineBreakMode === "wrap") {
		if (revealMode === "karaoke") {
			const cueSegments = buildWrappedLineSegments({
				text: cue.text,
				maxCharsPerLine,
			});
			return {
				text: cueSegments.map((segment) => segment.text).join("\n"),
				highlightText: buildSegmentedHighlightText({
					segments: cueSegments,
					originalText: cue.text,
					highlightText: highlightText ?? "",
				}),
				highlightColor,
			};
		}
		return {
			text: wrapTextByChars({ text, maxCharsPerLine }).join("\n"),
		};
	}

	const cueSegments = buildWrappedLineSegments({
		text: cue.text,
		maxCharsPerLine,
	});
	const activeSegment =
		cueSegments[
			resolveActiveSegmentIndex({
				cue,
				segments: cueSegments,
				sourceTimeSeconds,
			})
		];
	if (!activeSegment) {
		return { text: "" };
	}

	if (revealMode === "token") {
		return {
			text: sliceSegmentToPrefix({
				segment: activeSegment,
				originalText: cue.text,
				prefixText: text,
			}),
		};
	}

	if (revealMode === "karaoke") {
		return {
			text: activeSegment.text,
			highlightText: sliceSegmentToPrefix({
				segment: activeSegment,
				originalText: cue.text,
				prefixText: highlightText ?? "",
			}),
			highlightColor,
		};
	}

	return { text: activeSegment.text };
}

function buildWrappedLineSegments({
	text,
	maxCharsPerLine,
}: {
	text: string;
	maxCharsPerLine: number;
}): SubtitleLineSegment[] {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	const lines = wrapTextByChars({ text: normalized, maxCharsPerLine });
	let cursor = 0;
	return lines.map((line) => {
		const foundIndex = normalized.indexOf(line, cursor);
		const startIndex = foundIndex === -1 ? cursor : foundIndex;
		const endIndex = startIndex + line.length;
		cursor = endIndex;
		return { text: line, startIndex, endIndex };
	});
}

function wrapTextByChars({
	text,
	maxCharsPerLine,
}: {
	text: string;
	maxCharsPerLine: number;
}): string[] {
	const normalized = text.trim().replace(/\r\n/g, "\n");
	if (!normalized) return [];
	return normalized
		.split("\n")
		.flatMap((line) => wrapSingleLine({ text: line.trim(), maxCharsPerLine }));
}

function wrapSingleLine({
	text,
	maxCharsPerLine,
}: {
	text: string;
	maxCharsPerLine: number;
}): string[] {
	if (!text || text.length <= maxCharsPerLine) return text ? [text] : [];

	const units = tokenizeLineForWrapping({ text });
	const lines: string[] = [];
	let currentLine = "";
	let pendingSpace = "";

	for (const unit of units) {
		if (unit.kind === "space") {
			if (currentLine.length > 0) {
				pendingSpace = " ";
			}
			continue;
		}

		const nextLine = currentLine
			? `${currentLine}${pendingSpace}${unit.text}`
			: unit.text;
		const shouldAttachToCurrent =
			currentLine.length > 0 && unit.kind === "punctuation";

		if (
			currentLine.length === 0 ||
			countWrapChars({ value: nextLine }) <= maxCharsPerLine ||
			shouldAttachToCurrent
		) {
			currentLine = nextLine;
			pendingSpace = "";
			continue;
		}

		lines.push(currentLine.trimEnd());
		currentLine = unit.text.trimStart();
		pendingSpace = "";
	}

	if (currentLine.trim().length > 0) {
		lines.push(currentLine.trimEnd());
	}

	return lines;
}

function getWordSegmenter(): WordSegmenter | null {
	if (cachedWordSegmenter !== undefined) {
		return cachedWordSegmenter;
	}
	const Segmenter = Intl.Segmenter;
	if (!Segmenter) {
		cachedWordSegmenter = null;
		return cachedWordSegmenter;
	}
	try {
		cachedWordSegmenter = new Segmenter(["zh", "en"], {
			granularity: "word",
		});
	} catch {
		cachedWordSegmenter = null;
	}
	return cachedWordSegmenter;
}

function tokenizeLineForWrapping({ text }: { text: string }): WrappedTextUnit[] {
	const segmenter = getWordSegmenter();
	if (!segmenter) {
		return tokenizeLineFallback({ text });
	}

	const units = Array.from(segmenter.segment(text)).flatMap((segment) =>
		wrappedTextUnitFromSegment({ segment }),
	);
	return mergeAdjacentSingleCjkUnits({ units });
}

function wrappedTextUnitFromSegment({
	segment,
}: {
	segment: WordSegmenterResult;
}): WrappedTextUnit[] {
	if (segment.segment.length === 0) return [];
	if (/^\s+$/u.test(segment.segment)) {
		return [{ text: segment.segment, kind: "space" }];
	}
	return [
		{
			text: segment.segment,
			kind: segment.isWordLike ? "word" : "punctuation",
		},
	];
}

function tokenizeLineFallback({ text }: { text: string }): WrappedTextUnit[] {
	const matches =
		text.match(
			/\s+|[A-Za-z0-9]+(?:[._'’-][A-Za-z0-9]+)*|[\u3400-\u9fff]|./gu,
		) ?? [];
	return matches.map((value) => {
		if (/^\s+$/u.test(value)) {
			return { text: value, kind: "space" };
		}
		if (/^[A-Za-z0-9]+(?:[._'’-][A-Za-z0-9]+)*$/u.test(value)) {
			return { text: value, kind: "word" };
		}
		if (/^[\u3400-\u9fff]$/u.test(value)) {
			return { text: value, kind: "word" };
		}
		return { text: value, kind: "punctuation" };
	});
}

function mergeAdjacentSingleCjkUnits({
	units,
}: {
	units: WrappedTextUnit[];
}): WrappedTextUnit[] {
	const merged: WrappedTextUnit[] = [];
	for (let index = 0; index < units.length; index++) {
		const unit = units[index];
		const nextUnit = units[index + 1];
		if (
			unit &&
			nextUnit &&
			unit.kind === "word" &&
			nextUnit.kind === "word" &&
			isSingleCjkWord({ value: unit.text }) &&
			isSingleCjkWord({ value: nextUnit.text })
		) {
			merged.push({ text: `${unit.text}${nextUnit.text}`, kind: "word" });
			index += 1;
			continue;
		}
		if (unit) merged.push(unit);
	}
	return merged;
}

function isSingleCjkWord({ value }: { value: string }): boolean {
	return /^[\u3400-\u9fff]$/u.test(value);
}

function countWrapChars({ value }: { value: string }): number {
	return Array.from(value).length;
}

function resolveActiveSegmentIndex({
	cue,
	segments,
	sourceTimeSeconds,
}: {
	cue: SubtitleLayerCue;
	segments: SubtitleLineSegment[];
	sourceTimeSeconds: number;
}): number {
	if (segments.length === 0) return 0;
	const visibleTokens = getVisibleTokens({ cue, sourceTimeSeconds });
	if (visibleTokens && visibleTokens.length > 0) {
		const prefix = joinTokens({ tokens: visibleTokens, originalText: cue.text });
		const prefixEndIndex = resolvePrefixEndIndex({
			originalText: cue.text,
			prefixText: prefix,
		});
		const tokenLineIndex = segments.findIndex(
			(segment) => prefixEndIndex <= segment.endIndex,
		);
		return Math.max(
			0,
			tokenLineIndex === -1 ? segments.length - 1 : tokenLineIndex,
		);
	}

	const progress =
		cue.duration > 0
			? (sourceTimeSeconds - cue.startTime) / cue.duration
			: 0;
	return Math.max(
		0,
		Math.min(segments.length - 1, Math.floor(progress * segments.length)),
	);
}

function buildSegmentedHighlightText({
	segments,
	originalText,
	highlightText,
}: {
	segments: SubtitleLineSegment[];
	originalText: string;
	highlightText: string;
}): string {
	return segments
		.map((segment) =>
			sliceSegmentToPrefix({ segment, originalText, prefixText: highlightText }),
		)
		.join("\n");
}

function sliceSegmentToPrefix({
	segment,
	originalText,
	prefixText,
}: {
	segment: SubtitleLineSegment;
	originalText: string;
	prefixText: string;
}): string {
	const prefixEndIndex = resolvePrefixEndIndex({ originalText, prefixText });
	if (prefixEndIndex <= segment.startIndex) return "";
	if (prefixEndIndex >= segment.endIndex) return segment.text;
	return originalText.slice(segment.startIndex, prefixEndIndex).trimEnd();
}

function resolvePrefixEndIndex({
	originalText,
	prefixText,
}: {
	originalText: string;
	prefixText: string;
}): number {
	if (!prefixText) return 0;
	const index = originalText.indexOf(prefixText);
	return index === -1 ? prefixText.length : index + prefixText.length;
}

function buildOriginalTextPrefix({
	tokens,
	originalText,
}: {
	tokens: SubtitleToken[];
	originalText: string;
}): string | null {
	let cursor = 0;
	let endIndex = 0;
	for (const token of tokens) {
		const index = originalText.indexOf(token.text, cursor);
		if (index === -1) {
			return null;
		}
		endIndex = index + token.text.length;
		cursor = endIndex;
	}
	return originalText.slice(0, endIndex).trimEnd();
}

function joinTokens({
	tokens,
	originalText,
}: {
	tokens: SubtitleToken[];
	originalText: string;
}): string {
	const originalPrefix = buildOriginalTextPrefix({ tokens, originalText });
	if (originalPrefix) {
		return originalPrefix;
	}

	const tokenText = tokens.map((token) => token.text);
	if (tokenText.some((text) => /\s/.test(text)) || !/\s/.test(originalText)) {
		return tokenText.join("");
	}
	return tokenText.join(" ");
}

function hasCjk({ value }: { value: string }): boolean {
	return /[\u3400-\u9fff]/.test(value);
}
