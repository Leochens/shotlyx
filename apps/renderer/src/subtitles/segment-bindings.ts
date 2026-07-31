import type {
	TProjectSubtitleSegment,
	TProjectSubtitleTrack,
} from "@/project/types";
import { getClipTimeAtSourceTime, getSourceTimeAtClipTime } from "@/retime";
import type {
	AudioElement,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/timeline";
import { generateUUID } from "@/utils/id";
import { mediaTimeToSeconds } from "@/wasm/media-time";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import {
	getTranscriptCueTokens,
	tokenEndTime,
} from "@/subtitles/transcript-editing";

type SubtitleSourceElement = VideoElement | AudioElement;

export interface TimelineSubtitleSegment {
	segment: TProjectSubtitleSegment;
	sourceTrackId: string;
	sourceElement: SubtitleSourceElement;
	cues: SubtitleLayerCue[];
	startTime: number;
	endTime: number;
}

function getAllTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function isSubtitleSourceElement({
	element,
}: {
	element: TimelineElement;
}): element is SubtitleSourceElement {
	return element.type === "video" || element.type === "audio";
}

function getElementSourceKey({
	element,
}: {
	element: SubtitleSourceElement;
}): string | null {
	if ("mediaId" in element) return `media:${element.mediaId}`;
	if ("sourceUrl" in element) return `url:${element.sourceUrl}`;
	return null;
}

function getSegmentSourceKey({
	segment,
}: {
	segment: TProjectSubtitleSegment;
}): string | null {
	return segment.sourceMediaId ? `media:${segment.sourceMediaId}` : null;
}

export function findSubtitleSourceElement({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId?: string | null;
	elementId: string;
}): { trackId: string; element: SubtitleSourceElement } | null {
	const preferredTrack = trackId
		? getAllTracks({ tracks }).find((track) => track.id === trackId)
		: null;
	const preferredElement = preferredTrack?.elements.find(
		(element) => element.id === elementId,
	);
	if (
		preferredElement &&
		isSubtitleSourceElement({ element: preferredElement })
	) {
		return { trackId: preferredTrack.id, element: preferredElement };
	}

	for (const track of getAllTracks({ tracks })) {
		const element = track.elements.find(
			(candidate) => candidate.id === elementId,
		);
		if (element && isSubtitleSourceElement({ element })) {
			return { trackId: track.id, element };
		}
	}
	return null;
}

export function getElementVisibleSourceRangeSeconds({
	element,
}: {
	element: SubtitleSourceElement;
}): { startTime: number; endTime: number } {
	const startTime = mediaTimeToSeconds({ time: element.trimStart });
	const sourceSpan = getSourceTimeAtClipTime({
		clipTime: mediaTimeToSeconds({ time: element.duration }),
		retime: element.retime,
	});
	return {
		startTime,
		endTime: startTime + sourceSpan,
	};
}

function sourceSecondsToTimelineSeconds({
	element,
	sourceSeconds,
}: {
	element: SubtitleSourceElement;
	sourceSeconds: number;
}): number {
	const trimStartSeconds = mediaTimeToSeconds({ time: element.trimStart });
	const sourceOffset = sourceSeconds - trimStartSeconds;
	return (
		mediaTimeToSeconds({ time: element.startTime }) +
		getClipTimeAtSourceTime({
			sourceTime: sourceOffset,
			retime: element.retime,
		})
	);
}

export function timelineSecondsToElementSourceSeconds({
	element,
	timelineSeconds,
}: {
	element: SubtitleSourceElement;
	timelineSeconds: number;
}): number {
	const elementStartSeconds = mediaTimeToSeconds({ time: element.startTime });
	const clipOffset = timelineSeconds - elementStartSeconds;
	return (
		mediaTimeToSeconds({ time: element.trimStart }) +
		getSourceTimeAtClipTime({
			clipTime: clipOffset,
			retime: element.retime,
		})
	);
}

function getCueEndTime({ cue }: { cue: SubtitleLayerCue }): number {
	return cue.startTime + cue.duration;
}

function isTimeInsideRange({
	time,
	range,
}: {
	time: number;
	range: { startTime: number; endTime: number };
}): boolean {
	return time >= range.startTime && time < range.endTime;
}

function getTokenCenter({ token }: { token: SubtitleToken }): number {
	return token.startTime + Math.max(0, token.duration) / 2;
}

function buildCueFromTokens({
	cue,
	tokens,
	sourceSegmentId,
	sourceCueIndex,
}: {
	cue: SubtitleLayerCue;
	tokens: SubtitleToken[];
	sourceSegmentId: string;
	sourceCueIndex: number;
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
		sourceSegmentId,
		sourceCueIndex,
	};
}

function sliceSourceCueToRange({
	cue,
	range,
	sourceSegmentId,
	sourceCueIndex,
}: {
	cue: SubtitleLayerCue;
	range: { startTime: number; endTime: number };
	sourceSegmentId: string;
	sourceCueIndex: number;
}): SubtitleLayerCue | null {
	const tokens = getTranscriptCueTokens({ cue });
	if (tokens.length > 0) {
		const nextTokens = tokens
			.map((token, sourceTokenIndex) => ({ token, sourceTokenIndex }))
			.filter(({ token }) =>
				isTimeInsideRange({ time: getTokenCenter({ token }), range }),
			)
			.map(({ token, sourceTokenIndex }) => ({
				...token,
				sourceSegmentId,
				sourceCueIndex,
				sourceTokenIndex,
			}));
		return buildCueFromTokens({
			cue,
			tokens: nextTokens,
			sourceSegmentId,
			sourceCueIndex,
		});
	}

	const cueStart = cue.startTime;
	const cueEnd = getCueEndTime({ cue });
	if (cueEnd <= range.startTime || cueStart >= range.endTime) return null;
	const startTime = Math.max(cueStart, range.startTime);
	const endTime = Math.min(cueEnd, range.endTime);
	if (endTime <= startTime) return null;
	return {
		...cue,
		startTime,
		duration: endTime - startTime,
		sourceSegmentId,
		sourceCueIndex,
	};
}

function shiftSourceCueToTimeline({
	cue,
	element,
	sourceSegmentId,
	sourceCueIndex,
}: {
	cue: SubtitleLayerCue;
	element: SubtitleSourceElement;
	sourceSegmentId: string;
	sourceCueIndex: number;
}): SubtitleLayerCue {
	const startTime = sourceSecondsToTimelineSeconds({
		element,
		sourceSeconds: cue.startTime,
	});
	const endTime = sourceSecondsToTimelineSeconds({
		element,
		sourceSeconds: cue.startTime + cue.duration,
	});
	return {
		...cue,
		startTime,
		duration: Math.max(0, endTime - startTime),
		sourceSegmentId,
		sourceCueIndex,
		tokens: cue.tokens?.map((token, sourceTokenIndex) => {
			const tokenStart = sourceSecondsToTimelineSeconds({
				element,
				sourceSeconds: token.startTime,
			});
			const tokenEnd = sourceSecondsToTimelineSeconds({
				element,
				sourceSeconds: token.startTime + token.duration,
			});
			return {
				...token,
				startTime: tokenStart,
				duration: Math.max(0, tokenEnd - tokenStart),
				sourceSegmentId,
				sourceCueIndex,
				sourceTokenIndex:
					typeof token.sourceTokenIndex === "number"
						? token.sourceTokenIndex
						: sourceTokenIndex,
			};
		}),
	};
}

export function getTimelineSubtitleSegments({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
}): TimelineSubtitleSegment[] {
	if (!tracks || !track.segments || track.segments.length === 0) return [];

	const result = track.segments.flatMap((segment) => {
		const source = findSubtitleSourceElement({
			tracks,
			trackId: segment.sourceTrackId,
			elementId: segment.sourceElementId,
		});
		if (!source) return [];
		const visibleSourceRange = getElementVisibleSourceRangeSeconds({
			element: source.element,
		});
		const sourceCues = segment.cues.flatMap((cue, sourceCueIndex) => {
			const slicedCue = sliceSourceCueToRange({
				cue,
				range: visibleSourceRange,
				sourceSegmentId: segment.id,
				sourceCueIndex,
			});
			return slicedCue ? [slicedCue] : [];
		});
		const cues = sourceCues.map((cue) =>
			shiftSourceCueToTimeline({
				cue,
				element: source.element,
				sourceSegmentId: segment.id,
				sourceCueIndex: cue.sourceCueIndex ?? 0,
			}),
		);
		if (cues.length === 0) return [];
		return [
			{
				segment,
				sourceTrackId: source.trackId,
				sourceElement: source.element,
				cues,
				startTime: Math.min(...cues.map((cue) => cue.startTime)),
				endTime: Math.max(...cues.map((cue) => getCueEndTime({ cue }))),
			},
		];
	});

	return result.sort((left, right) => left.startTime - right.startTime);
}

export function getTimelineSubtitleTrackFromSegments({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
}): TProjectSubtitleTrack | null {
	const segments = getTimelineSubtitleSegments({ track, tracks });
	if (segments.length === 0) return null;
	return {
		...track,
		sourceTrackId: segments[0]?.sourceTrackId ?? track.sourceTrackId,
		cues: segments.flatMap((segment) => segment.cues),
	};
}

function convertTimelineCueToSourceCue({
	cue,
	element,
}: {
	cue: SubtitleLayerCue;
	element: SubtitleSourceElement;
}): SubtitleLayerCue {
	const sourceStart = timelineSecondsToElementSourceSeconds({
		element,
		timelineSeconds: cue.startTime,
	});
	const sourceEnd = timelineSecondsToElementSourceSeconds({
		element,
		timelineSeconds: cue.startTime + cue.duration,
	});
	return {
		...cue,
		startTime: sourceStart,
		duration: Math.max(0, sourceEnd - sourceStart),
		tokens: cue.tokens?.map((token) => {
			const tokenStart = timelineSecondsToElementSourceSeconds({
				element,
				timelineSeconds: token.startTime,
			});
			const tokenEnd = timelineSecondsToElementSourceSeconds({
				element,
				timelineSeconds: token.startTime + token.duration,
			});
			return {
				...token,
				startTime: tokenStart,
				duration: Math.max(0, tokenEnd - tokenStart),
				sourceSegmentId: undefined,
				sourceCueIndex: undefined,
				sourceTokenIndex: undefined,
			};
		}),
		sourceSegmentId: undefined,
		sourceCueIndex: undefined,
	};
}

function getCueTimelineAnchor({ cue }: { cue: SubtitleLayerCue }): number {
	const tokens = getTranscriptCueTokens({ cue });
	if (tokens.length > 0) {
		return Math.min(...tokens.map((token) => token.startTime));
	}
	return cue.startTime;
}

export function buildSubtitleSegmentsFromTimelineCues({
	cues,
	sourceTrackId,
	sourceElementId,
	tracks,
}: {
	cues: SubtitleLayerCue[];
	sourceTrackId?: string | null;
	sourceElementId?: string | null;
	tracks: SceneTracks;
}): TProjectSubtitleSegment[] {
	if (!sourceTrackId) return [];
	const sourceTrack =
		getAllTracks({ tracks }).find((track) => track.id === sourceTrackId) ??
		null;
	if (!sourceTrack) return [];
	const sourceElements = sourceTrack.elements.filter(
		(element): element is SubtitleSourceElement =>
			isSubtitleSourceElement({ element }) &&
			(!sourceElementId || element.id === sourceElementId),
	);
	if (sourceElements.length === 0) return [];

	return sourceElements.flatMap((element) => {
		const elementStart = mediaTimeToSeconds({ time: element.startTime });
		const elementEnd =
			elementStart + mediaTimeToSeconds({ time: element.duration });
		const elementCues = cues.flatMap((cue) => {
			const anchor = getCueTimelineAnchor({ cue });
			if (anchor < elementStart || anchor >= elementEnd) return [];
			return [convertTimelineCueToSourceCue({ cue, element })];
		});
		if (elementCues.length === 0) return [];
		const sourceMediaId = "mediaId" in element ? element.mediaId : undefined;
		return [
			{
				id: `segment:${sourceTrackId}:${element.id}:${generateUUID()}`,
				sourceTrackId,
				sourceElementId: element.id,
				...(sourceMediaId ? { sourceMediaId } : {}),
				cues: elementCues,
				updatedAt: new Date().toISOString(),
			},
		];
	});
}

function rebuildSegmentForElement({
	segment,
	sourceTrackId,
	element,
}: {
	segment: TProjectSubtitleSegment;
	sourceTrackId: string;
	element: SubtitleSourceElement;
}): TProjectSubtitleSegment | null {
	const visibleRange = getElementVisibleSourceRangeSeconds({ element });
	const cues = segment.cues.flatMap((cue, sourceCueIndex) => {
		const slicedCue = sliceSourceCueToRange({
			cue,
			range: visibleRange,
			sourceSegmentId: segment.id,
			sourceCueIndex,
		});
		if (!slicedCue) return [];
		return [
			{
				...slicedCue,
				sourceSegmentId: undefined,
				sourceCueIndex: undefined,
				tokens: slicedCue.tokens?.map((token) => ({
					...token,
					sourceSegmentId: undefined,
					sourceCueIndex: undefined,
					sourceTokenIndex: undefined,
				})),
			},
		];
	});
	if (cues.length === 0) return null;
	const sourceMediaId =
		"mediaId" in element ? element.mediaId : segment.sourceMediaId;
	return {
		...segment,
		id:
			element.id === segment.sourceElementId
				? segment.id
				: `segment:${sourceTrackId}:${element.id}:${generateUUID()}`,
		sourceTrackId,
		sourceElementId: element.id,
		...(sourceMediaId ? { sourceMediaId } : {}),
		cues,
		updatedAt: new Date().toISOString(),
	};
}

function findFragmentElementsForSegment({
	segment,
	beforeTracks,
	afterTracks,
}: {
	segment: TProjectSubtitleSegment;
	beforeTracks: SceneTracks;
	afterTracks: SceneTracks;
}): Array<{ trackId: string; element: SubtitleSourceElement }> {
	const previous = findSubtitleSourceElement({
		tracks: beforeTracks,
		trackId: segment.sourceTrackId,
		elementId: segment.sourceElementId,
	});
	const current = findSubtitleSourceElement({
		tracks: afterTracks,
		trackId: segment.sourceTrackId,
		elementId: segment.sourceElementId,
	});
	if (!previous && current) return [current];

	const expectedKey =
		getSegmentSourceKey({ segment }) ??
		(previous ? getElementSourceKey({ element: previous.element }) : null);
	if (!expectedKey) return [];
	const previousRange = previous
		? getElementVisibleSourceRangeSeconds({ element: previous.element })
		: null;
	const beforeElementIds = new Set(
		getAllTracks({ tracks: beforeTracks }).flatMap((track) =>
			track.elements.map((element) => element.id),
		),
	);

	return getAllTracks({ tracks: afterTracks }).flatMap((track) =>
		track.elements.flatMap((element) => {
			if (!isSubtitleSourceElement({ element })) return [];
			if (
				element.id !== segment.sourceElementId &&
				beforeElementIds.has(element.id)
			) {
				return [];
			}
			if (getElementSourceKey({ element }) !== expectedKey) return [];
			if (previousRange) {
				const nextRange = getElementVisibleSourceRangeSeconds({ element });
				if (
					nextRange.endTime <= previousRange.startTime ||
					nextRange.startTime >= previousRange.endTime
				) {
					return [];
				}
			}
			return [{ trackId: track.id, element }];
		}),
	);
}

export function syncSubtitleTrackSegmentsToTimelineFragments({
	track,
	beforeTracks,
	afterTracks,
}: {
	track: TProjectSubtitleTrack;
	beforeTracks: SceneTracks;
	afterTracks: SceneTracks;
}): TProjectSubtitleTrack {
	if (!track.segments || track.segments.length === 0) return track;
	const segments = track.segments.flatMap((segment) =>
		findFragmentElementsForSegment({
			segment,
			beforeTracks,
			afterTracks,
		}).flatMap(({ trackId, element }) => {
			const nextSegment = rebuildSegmentForElement({
				segment,
				sourceTrackId: trackId,
				element,
			});
			return nextSegment ? [nextSegment] : [];
		}),
	);
	return {
		...track,
		segments,
		cues: segments.flatMap((segment) => segment.cues),
		sourceTrackId: segments[0]?.sourceTrackId ?? track.sourceTrackId,
		sourceElementId:
			segments.length === 1 ? segments[0]?.sourceElementId : undefined,
		updatedAt: new Date().toISOString(),
	};
}

export function getSegmentTokenTimelineRange({
	track,
	tracks,
	sourceSegmentId,
	sourceCueIndex,
	sourceTokenIndex,
}: {
	track: TProjectSubtitleTrack;
	tracks: SceneTracks;
	sourceSegmentId: string;
	sourceCueIndex: number;
	sourceTokenIndex?: number;
}): {
	sourceTrackId: string;
	sourceElementId: string;
	startTime: number;
	endTime: number;
} | null {
	const segment = track.segments?.find((item) => item.id === sourceSegmentId);
	if (!segment) return null;
	const cue = segment.cues[sourceCueIndex];
	if (!cue) return null;
	const token =
		typeof sourceTokenIndex === "number"
			? getTranscriptCueTokens({ cue })[sourceTokenIndex]
			: null;
	const sourceStart = token?.startTime ?? cue.startTime;
	const sourceEnd = token ? tokenEndTime({ token }) : getCueEndTime({ cue });
	const source = findSubtitleSourceElement({
		tracks,
		trackId: segment.sourceTrackId,
		elementId: segment.sourceElementId,
	});
	if (!source) return null;
	return {
		sourceTrackId: source.trackId,
		sourceElementId: source.element.id,
		startTime: sourceSecondsToTimelineSeconds({
			element: source.element,
			sourceSeconds: sourceStart,
		}),
		endTime: sourceSecondsToTimelineSeconds({
			element: source.element,
			sourceSeconds: sourceEnd,
		}),
	};
}
