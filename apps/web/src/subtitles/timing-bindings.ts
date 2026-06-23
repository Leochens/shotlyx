import type { TProjectSubtitleTrack } from "@/project/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm/media-time";

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
	return sourceTrack ? earliestElementStartSeconds({ track: sourceTrack }) : null;
}

export function getSubtitleTrackTimelineOffsetSeconds({
	track,
	tracks,
}: {
	track: TProjectSubtitleTrack;
	tracks?: SceneTracks | null;
}): number {
	if (!tracks || !track.sourceTrackId) return 0;
	if (typeof track.sourceTimelineStartTimeSeconds !== "number") return 0;
	const currentStart = resolveSubtitleSourceTimelineStartSeconds({
		sourceTrackId: track.sourceTrackId,
		sourceElementId: track.sourceElementId,
		tracks,
	});
	if (currentStart === null) return 0;
	return currentStart - track.sourceTimelineStartTimeSeconds;
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
	const offsetSeconds = getSubtitleTrackTimelineOffsetSeconds({ track, tracks });
	if (offsetSeconds === 0) return track;
	return {
		...track,
		cues: track.cues.map((cue) =>
			shiftSubtitleCueTime({ cue, offsetSeconds }),
		),
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
