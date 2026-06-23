import type { TProjectSubtitleTrack } from "@/project/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm/media-time";

const LEGACY_ZERO_START_CUE_THRESHOLD_SECONDS = 5;
const SOURCE_RELATIVE_CUE_EPSILON_SECONDS = 0.001;

function getAllTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [...tracks.overlay, tracks.main, ...tracks.audio];
}

function findTrackById({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): TimelineTrack | null {
	return getAllTracks({ tracks }).find((track) => track.id === trackId) ?? null;
}

function findElementByRef({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
}): TimelineElement | null {
	const track = findTrackById({ tracks, trackId });
	return track?.elements.find((element) => element.id === elementId) ?? null;
}

function earliestElementStartSeconds({
	track,
}: {
	track: TimelineTrack;
}): number | null {
	if (track.elements.length === 0) return null;
	return Math.min(
		...track.elements.map((element) =>
			mediaTimeToSeconds({ time: element.startTime }),
		),
	);
}

function earliestCueStartSeconds({
	track,
}: {
	track: TProjectSubtitleTrack;
}): number | null {
	const starts = track.cues.flatMap((cue) => [
		cue.startTime,
		...(cue.tokens?.map((token) => token.startTime) ?? []),
	]);
	if (starts.length === 0) return null;
	return Math.min(...starts);
}

function getSubtitleTrackSourceTimelineStartSeconds({
	track,
}: {
	track: TProjectSubtitleTrack;
}): number | null {
	if (typeof track.sourceTimelineStartTimeSeconds === "number") {
		return track.sourceTimelineStartTimeSeconds;
	}
	const earliestCueStart = earliestCueStartSeconds({ track });
	if (earliestCueStart === null) return null;
	if (earliestCueStart < LEGACY_ZERO_START_CUE_THRESHOLD_SECONDS) return 0;
	return Math.max(0, Math.floor(earliestCueStart));
}

function isTimelineSourceTrack({ track }: { track: TimelineTrack }): boolean {
	return track.type === "video" || track.type === "audio";
}

function inferSingleUnboundSourceTimelineStartSeconds({
	tracks,
}: {
	tracks: SceneTracks;
}): number | null {
	const sourceTracks = getAllTracks({ tracks }).filter(
		(track) => isTimelineSourceTrack({ track }) && track.elements.length > 0,
	);
	if (sourceTracks.length !== 1) return null;
	return earliestElementStartSeconds({ track: sourceTracks[0] });
}

function getUnboundSubtitleTimelineOffsetSeconds({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks: SceneTracks;
}): number {
	const inferredSourceStart = inferSingleUnboundSourceTimelineStartSeconds({
		tracks,
	});
	if (inferredSourceStart === null || inferredSourceStart <= 0) return 0;
	const earliestCueStart = earliestCueStartSeconds({ track });
	if (earliestCueStart === null) return 0;
	return earliestCueStart + SOURCE_RELATIVE_CUE_EPSILON_SECONDS <
		inferredSourceStart
		? inferredSourceStart
		: 0;
}

function getStoredCueTimelineBaseOffsetSeconds({
	track,
}: {
	track: TProjectSubtitleTrack;
}): number {
	const sourceTimelineStartTimeSeconds =
		typeof track.sourceTimelineStartTimeSeconds === "number"
			? track.sourceTimelineStartTimeSeconds
			: null;
	if (
		sourceTimelineStartTimeSeconds === null ||
		sourceTimelineStartTimeSeconds <= 0
	) {
		return 0;
	}
	const earliestCueStart = earliestCueStartSeconds({ track });
	if (earliestCueStart === null) return 0;

	return earliestCueStart + SOURCE_RELATIVE_CUE_EPSILON_SECONDS <
		sourceTimelineStartTimeSeconds
		? sourceTimelineStartTimeSeconds
		: 0;
}

export function resolveSubtitleSourceTimelineStartSeconds({
	sourceTrackId,
	sourceElementId,
	tracks,
}: {
	sourceTrackId?: string | null;
	sourceElementId?: string | null;
	tracks: SceneTracks;
}): number | null {
	if (!sourceTrackId) return null;
	if (sourceElementId) {
		const sourceElement = findElementByRef({
			tracks,
			trackId: sourceTrackId,
			elementId: sourceElementId,
		});
		if (sourceElement) {
			return mediaTimeToSeconds({ time: sourceElement.startTime });
		}
	}
	const sourceTrack = findTrackById({ tracks, trackId: sourceTrackId });
	return sourceTrack
		? earliestElementStartSeconds({ track: sourceTrack })
		: null;
}

export function getSubtitleTrackTimelineOffsetSeconds({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
}): number {
	if (!tracks) return 0;
	if (!track.sourceTrackId) {
		return getUnboundSubtitleTimelineOffsetSeconds({ track, tracks });
	}
	const sourceTimelineStartTimeSeconds =
		getSubtitleTrackSourceTimelineStartSeconds({ track });
	if (sourceTimelineStartTimeSeconds === null) return 0;
	const currentStart = resolveSubtitleSourceTimelineStartSeconds({
		sourceTrackId: track.sourceTrackId,
		sourceElementId: track.sourceElementId,
		tracks,
	});
	if (currentStart === null) return 0;
	return (
		getStoredCueTimelineBaseOffsetSeconds({ track }) +
		currentStart -
		sourceTimelineStartTimeSeconds
	);
}

function shiftTokenTime({
	token,
	offsetSeconds,
}: {
	token: SubtitleToken;
	offsetSeconds: number;
}): SubtitleToken {
	return {
		...token,
		startTime: token.startTime + offsetSeconds,
	};
}

export function shiftSubtitleCueTime({
	cue,
	offsetSeconds,
}: {
	cue: SubtitleLayerCue;
	offsetSeconds: number;
}): SubtitleLayerCue {
	if (offsetSeconds === 0) return cue;
	return {
		...cue,
		startTime: cue.startTime + offsetSeconds,
		tokens: cue.tokens?.map((token) =>
			shiftTokenTime({ token, offsetSeconds }),
		),
	};
}

export function getTimelineSubtitleTrack({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
}): TProjectSubtitleTrack {
	const offsetSeconds = getSubtitleTrackTimelineOffsetSeconds({
		track,
		tracks,
	});
	if (offsetSeconds === 0) return track;
	return {
		...track,
		cues: track.cues.map((cue) => shiftSubtitleCueTime({ cue, offsetSeconds })),
	};
}

export function storedSubtitleSecondsToTimelineSeconds({
	track,
	tracks,
	seconds,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
	seconds: number;
}): number {
	return seconds + getSubtitleTrackTimelineOffsetSeconds({ track, tracks });
}

export function timelineSecondsToStoredSubtitleSeconds({
	track,
	tracks,
	seconds,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
	seconds: number;
}): number {
	return seconds - getSubtitleTrackTimelineOffsetSeconds({ track, tracks });
}
