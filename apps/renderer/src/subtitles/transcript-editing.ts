import type { TProjectSubtitleTrack } from "@/project/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";

export interface TranscriptTokenAddress {
	cueIndex: number;
	tokenIndex: number;
}

export interface TranscriptTokenSelection {
	anchor: TranscriptTokenAddress;
	focus: TranscriptTokenAddress;
}

export interface TranscriptTokenRange {
	start: TranscriptTokenAddress;
	end: TranscriptTokenAddress;
	startTime: number;
	endTime: number;
	text: string;
}

export function getTranscriptCueTokens({
	cue,
}: {
	cue: SubtitleLayerCue;
}): SubtitleToken[] {
	if (cue.tokens && cue.tokens.length > 0) {
		return cue.tokens;
	}
	return [{ text: cue.text, startTime: cue.startTime, duration: cue.duration }];
}

export function tokenEndTime({ token }: { token: SubtitleToken }): number {
	return token.startTime + Math.max(0, token.duration);
}

export function compareTokenAddress({
	left,
	right,
}: {
	left: TranscriptTokenAddress;
	right: TranscriptTokenAddress;
}): number {
	if (left.cueIndex !== right.cueIndex) return left.cueIndex - right.cueIndex;
	return left.tokenIndex - right.tokenIndex;
}

export function normalizeTokenSelection({
	selection,
}: {
	selection: TranscriptTokenSelection;
}): { start: TranscriptTokenAddress; end: TranscriptTokenAddress } {
	if (compareTokenAddress({ left: selection.anchor, right: selection.focus }) <= 0) {
		return { start: selection.anchor, end: selection.focus };
	}
	return { start: selection.focus, end: selection.anchor };
}

export function isSingleCueSelection({
	selection,
}: {
	selection: TranscriptTokenSelection;
}): boolean {
	return selection.anchor.cueIndex === selection.focus.cueIndex;
}

export function isTokenAddressInSelection({
	address,
	selection,
}: {
	address: TranscriptTokenAddress;
	selection: TranscriptTokenSelection | null;
}): boolean {
	if (!selection) return false;
	const { start, end } = normalizeTokenSelection({ selection });
	return (
		compareTokenAddress({ left: address, right: start }) >= 0 &&
		compareTokenAddress({ left: address, right: end }) <= 0
	);
}

export function resolveTranscriptTokenRange({
	track,
	selection,
}: {
	track: TProjectSubtitleTrack;
	selection: TranscriptTokenSelection | null;
}): TranscriptTokenRange | null {
	if (!selection) return null;
	if (!isSingleCueSelection({ selection })) return null;
	const { start, end } = normalizeTokenSelection({ selection });
	const selectedTokens: SubtitleToken[] = [];

	for (let cueIndex = start.cueIndex; cueIndex <= end.cueIndex; cueIndex++) {
		const cue = track.cues[cueIndex];
		if (!cue) continue;
		const tokens = getTranscriptCueTokens({ cue });
		const firstTokenIndex = cueIndex === start.cueIndex ? start.tokenIndex : 0;
		const lastTokenIndex =
			cueIndex === end.cueIndex ? end.tokenIndex : tokens.length - 1;

		for (
			let tokenIndex = firstTokenIndex;
			tokenIndex <= lastTokenIndex;
			tokenIndex++
		) {
			const token = tokens[tokenIndex];
			if (token) selectedTokens.push(token);
		}
	}

	if (selectedTokens.length === 0) return null;
	const startTime = Math.min(...selectedTokens.map((token) => token.startTime));
	const endTime = Math.max(
		...selectedTokens.map((token) => tokenEndTime({ token })),
	);

	return {
		start,
		end,
		startTime,
		endTime,
		text: selectedTokens.map((token) => token.text).join(""),
	};
}

export function editTranscriptSelection({
	track,
	selection,
	text,
}: {
	track: TProjectSubtitleTrack;
	selection: TranscriptTokenSelection;
	text: string;
}): TProjectSubtitleTrack {
	const range = resolveTranscriptTokenRange({ track, selection });
	if (!range) return track;

	const nextCues: SubtitleLayerCue[] = [];
	let replacementInserted = false;

	for (let cueIndex = 0; cueIndex < track.cues.length; cueIndex++) {
		const cue = track.cues[cueIndex];
		const tokens = getTranscriptCueTokens({ cue });
		const isBefore = cueIndex < range.start.cueIndex;
		const isAfter = cueIndex > range.end.cueIndex;

		if (isBefore || isAfter) {
			nextCues.push(cue);
			continue;
		}

		const selectedStartIndex =
			cueIndex === range.start.cueIndex ? range.start.tokenIndex : 0;
		const selectedEndIndex =
			cueIndex === range.end.cueIndex
				? range.end.tokenIndex
				: tokens.length - 1;
		const before = tokens.slice(0, selectedStartIndex);
		const after = tokens.slice(selectedEndIndex + 1);
		let nextTokens: SubtitleToken[] = [];

		if (cueIndex === range.start.cueIndex) {
			nextTokens = [...before];
			if (text.length > 0) {
				nextTokens.push({
					...tokens[selectedStartIndex],
					text,
					startTime: range.startTime,
					duration: Math.max(0, range.endTime - range.startTime),
				});
			}
			replacementInserted = true;
			if (cueIndex === range.end.cueIndex) {
				nextTokens.push(...after);
			}
		} else if (cueIndex === range.end.cueIndex && replacementInserted) {
			nextTokens = [...after];
		}

		const nextCue = buildCueFromTokens({ cue, tokens: nextTokens });
		if (nextCue) nextCues.push(nextCue);
	}

	return {
		...track,
		cues: nextCues,
		updatedAt: new Date().toISOString(),
	};
}

export function cutTranscriptTrackByTimeRange({
	track,
	startTime,
	endTime,
}: {
	track: TProjectSubtitleTrack;
	startTime: number;
	endTime: number;
}): TProjectSubtitleTrack {
	if (endTime <= startTime) return track;
	const cutDuration = endTime - startTime;
	const nextCues = track.cues.flatMap((cue) => {
		const tokens = getTranscriptCueTokens({ cue });
		const nextTokens = tokens.flatMap((token) => {
			const tokenEnd = tokenEndTime({ token });
			if (tokenEnd <= startTime) return [token];
			if (token.startTime >= endTime) {
				return [{ ...token, startTime: token.startTime - cutDuration }];
			}
			return [];
		});
		const nextCue = buildCueFromTokens({ cue, tokens: nextTokens });
		return nextCue ? [nextCue] : [];
	});

	return {
		...track,
		cues: nextCues,
		updatedAt: new Date().toISOString(),
	};
}

export function removeTranscriptTrackByTimeRange({
	track,
	startTime,
	endTime,
}: {
	track: TProjectSubtitleTrack;
	startTime: number;
	endTime: number;
}): TProjectSubtitleTrack {
	if (endTime <= startTime) return track;
	const nextCues = track.cues.flatMap((cue) => {
		const tokens = getTranscriptCueTokens({ cue });
		const nextTokens = tokens.filter((token) => {
			const tokenEnd = tokenEndTime({ token });
			return tokenEnd <= startTime || token.startTime >= endTime;
		});
		const nextCue = buildCueFromTokens({ cue, tokens: nextTokens });
		return nextCue ? [nextCue] : [];
	});

	return {
		...track,
		cues: nextCues,
		updatedAt: new Date().toISOString(),
	};
}

export function cutTranscriptTrackByTimeRanges({
	track,
	ranges,
}: {
	track: TProjectSubtitleTrack;
	ranges: Array<{ startTime: number; endTime: number }>;
}): TProjectSubtitleTrack {
	const normalizedRanges = normalizeTimeRanges({ ranges });
	let removedSeconds = 0;
	return normalizedRanges.reduce((currentTrack, range) => {
		const adjustedStartTime = range.startTime - removedSeconds;
		const adjustedEndTime = range.endTime - removedSeconds;
		removedSeconds += range.endTime - range.startTime;
		return cutTranscriptTrackByTimeRange({
			track: currentTrack,
			startTime: adjustedStartTime,
			endTime: adjustedEndTime,
		});
	}, track);
}

export function removeTranscriptTrackByTimeRanges({
	track,
	ranges,
}: {
	track: TProjectSubtitleTrack;
	ranges: Array<{ startTime: number; endTime: number }>;
}): TProjectSubtitleTrack {
	return normalizeTimeRanges({ ranges }).reduce(
		(currentTrack, range) =>
			removeTranscriptTrackByTimeRange({
				track: currentTrack,
				startTime: range.startTime,
				endTime: range.endTime,
			}),
		track,
	);
}

export function findActiveTranscriptToken({
	track,
	timeSeconds,
}: {
	track: TProjectSubtitleTrack | null;
	timeSeconds: number;
}): TranscriptTokenAddress | null {
	if (!track) return null;
	for (const [cueIndex, cue] of track.cues.entries()) {
		const cueEnd = cue.startTime + cue.duration;
		if (timeSeconds < cue.startTime || timeSeconds >= cueEnd) continue;
		const tokens = getTranscriptCueTokens({ cue });
		for (const [tokenIndex, token] of tokens.entries()) {
			const endTime = tokenEndTime({ token });
			if (timeSeconds >= token.startTime && timeSeconds < endTime) {
				return { cueIndex, tokenIndex };
			}
		}
	}
	return null;
}

function normalizeTimeRanges({
	ranges,
}: {
	ranges: Array<{ startTime: number; endTime: number }>;
}): Array<{ startTime: number; endTime: number }> {
	const sortedRanges = ranges
		.filter(
			(range) =>
				Number.isFinite(range.startTime) &&
				Number.isFinite(range.endTime) &&
				range.endTime > range.startTime,
		)
		.sort((left, right) => left.startTime - right.startTime);
	const result: Array<{ startTime: number; endTime: number }> = [];
	for (const range of sortedRanges) {
		const lastRange = result.at(-1);
		if (!lastRange || range.startTime > lastRange.endTime) {
			result.push({ ...range });
			continue;
		}
		lastRange.endTime = Math.max(lastRange.endTime, range.endTime);
	}
	return result;
}

function buildCueFromTokens({
	cue,
	tokens,
}: {
	cue: SubtitleLayerCue;
	tokens: SubtitleToken[];
}): SubtitleLayerCue | null {
	if (tokens.length === 0) return null;
	const text = tokens.map((token) => token.text).join("");
	if (text.length === 0) return null;
	const startTime = Math.min(...tokens.map((token) => token.startTime));
	const endTime = Math.max(...tokens.map((token) => tokenEndTime({ token })));

	return {
		...cue,
		text,
		startTime,
		duration: Math.max(0, endTime - startTime),
		tokens,
	};
}
