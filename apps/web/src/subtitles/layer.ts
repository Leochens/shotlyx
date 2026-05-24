import type { TextElement, SubtitleElement } from "@/timeline";
import type {
	SubtitleCue,
	SubtitleLayerCue,
	SubtitleRevealMode,
	SubtitleToken,
} from "./types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const EPSILON_SECONDS = 1 / 1000;

export interface ResolvedSubtitleText {
	text: string;
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
	revealMode = element.revealMode ?? "full",
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

	const text =
		revealMode === "token"
			? resolveTokenRevealText({
					cue: match.cue,
					sourceTimeSeconds,
				})
			: match.cue.text;
	return {
		text,
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
}: {
	cue: SubtitleLayerCue;
	sourceTimeSeconds: number;
}): string {
	const tokens = cue.tokens;
	if (!tokens || tokens.length === 0) {
		return cue.text;
	}
	const visibleTokens = tokens.filter(
		(token) =>
			sourceTimeSeconds >=
			resolveAbsoluteTokenStartTime({ cue, token }) - EPSILON_SECONDS,
	);
	if (visibleTokens.length === 0) {
		return "";
	}
	return joinTokens({
		tokens: visibleTokens,
		originalText: cue.text,
	});
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
