import type { TProjectSubtitleTrack, TProjectSubtitles } from "@/project/types";
import type { SceneTracks } from "@/timeline";
import {
	addMediaTime,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm/media-time";
import {
	cutTranscriptTrackByTimeRanges,
	removeTranscriptTrackByTimeRanges,
} from "@/subtitles/transcript-editing";
import { timelineSecondsToStoredSubtitleSeconds } from "@/subtitles/timing-bindings";
import { syncSubtitleTrackSegmentsToTimelineFragments } from "@/subtitles/segment-bindings";

export type SubtitleTimelineCutMode = "collapse" | "remove";

export interface SubtitleTimelineCutRange {
	sourceTrackId: string;
	startTime: MediaTime;
	endTime: MediaTime;
	mode: SubtitleTimelineCutMode;
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

function normalizeSecondRanges({
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

function toStoredSubtitleRanges({
	track,
	timelineTracks,
	ranges,
	mode,
}: {
	track: TProjectSubtitleTrack;
	timelineTracks: SceneTracks;
	ranges: SubtitleTimelineCutRange[];
	mode: SubtitleTimelineCutMode;
}): Array<{ startTime: number; endTime: number }> {
	return normalizeSecondRanges({
		ranges: ranges
			.filter((range) => range.mode === mode)
			.map((range) => {
				const startSeconds = mediaTimeToSeconds({ time: range.startTime });
				const endSeconds = mediaTimeToSeconds({ time: range.endTime });
				return {
					startTime: timelineSecondsToStoredSubtitleSeconds({
						track,
						tracks: timelineTracks,
						seconds: startSeconds,
					}),
					endTime: timelineSecondsToStoredSubtitleSeconds({
						track,
						tracks: timelineTracks,
						seconds: endSeconds,
					}),
				};
			}),
	});
}

function syncSubtitleTrackForTimelineCuts({
	track,
	timelineTracks,
	ranges,
}: {
	track: TProjectSubtitleTrack;
	timelineTracks: SceneTracks;
	ranges: SubtitleTimelineCutRange[];
}): TProjectSubtitleTrack {
	if (!track.sourceTrackId) return track;
	const matchingRanges = ranges.filter(
		(range) => range.sourceTrackId === track.sourceTrackId,
	);
	if (matchingRanges.length === 0) return track;

	const collapseRanges = toStoredSubtitleRanges({
		track,
		timelineTracks,
		ranges: matchingRanges,
		mode: "collapse",
	});
	const removeRanges = toStoredSubtitleRanges({
		track,
		timelineTracks,
		ranges: matchingRanges,
		mode: "remove",
	});

	let nextTrack = track;
	if (collapseRanges.length > 0) {
		nextTrack = cutTranscriptTrackByTimeRanges({
			track: nextTrack,
			ranges: collapseRanges,
		});
	}
	if (removeRanges.length > 0) {
		nextTrack = removeTranscriptTrackByTimeRanges({
			track: nextTrack,
			ranges: removeRanges,
		});
	}
	return nextTrack;
}

export function syncProjectSubtitlesForTimelineCuts({
	subtitles,
	timelineTracks,
	ranges,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	timelineTracks: SceneTracks;
	ranges: SubtitleTimelineCutRange[];
}): TProjectSubtitles | null | undefined {
	if (!subtitles || ranges.length === 0) return subtitles;
	const tracks = getStoredProjectTranscriptTracks({ subtitles });
	if (tracks.length === 0) return subtitles;

	let didChange = false;
	const nextTracks = tracks.map((track) => {
		const nextTrack = syncSubtitleTrackForTimelineCuts({
			track,
			timelineTracks,
			ranges,
		});
		if (nextTrack !== track) didChange = true;
		return nextTrack;
	});
	if (!didChange) return subtitles;

	const isLegacyOnly =
		(!subtitles.tracks || subtitles.tracks.length === 0) &&
		nextTracks.length === 1 &&
		nextTracks[0]?.id === "track:global";

	return {
		...subtitles,
		tracks: nextTracks,
		cues: isLegacyOnly ? (nextTracks[0]?.cues ?? []) : subtitles.cues,
		updatedAt: new Date().toISOString(),
	};
}

export function syncProjectSubtitlesToTimelineFragments({
	subtitles,
	beforeTracks,
	afterTracks,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	beforeTracks: SceneTracks;
	afterTracks: SceneTracks;
}): TProjectSubtitles | null | undefined {
	if (!subtitles) return subtitles;
	const tracks = getStoredProjectTranscriptTracks({ subtitles });
	if (tracks.length === 0) return subtitles;
	if (!tracks.some((track) => (track.segments?.length ?? 0) > 0)) {
		return subtitles;
	}

	let didChange = false;
	const nextTracks = tracks.map((track) => {
		const nextTrack = syncSubtitleTrackSegmentsToTimelineFragments({
			track,
			beforeTracks,
			afterTracks,
		});
		if (nextTrack !== track) didChange = true;
		return nextTrack;
	});
	if (!didChange) return subtitles;

	const isLegacyOnly =
		(!subtitles.tracks || subtitles.tracks.length === 0) &&
		nextTracks.length === 1 &&
		nextTracks[0]?.id === "track:global";

	return {
		...subtitles,
		tracks: nextTracks,
		cues: isLegacyOnly ? (nextTracks[0]?.cues ?? []) : subtitles.cues,
		updatedAt: new Date().toISOString(),
	};
}

export function buildSubtitleCutRangesFromElements({
	tracks,
	elements,
	mode,
}: {
	tracks: SceneTracks;
	elements: Array<{ trackId: string; elementId: string }>;
	mode: SubtitleTimelineCutMode;
}): SubtitleTimelineCutRange[] {
	const elementRefs = new Set(
		elements.map((element) => `${element.trackId}:${element.elementId}`),
	);
	const result: SubtitleTimelineCutRange[] = [];
	for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
		for (const element of track.elements) {
			if (!elementRefs.has(`${track.id}:${element.id}`)) continue;
			result.push({
				sourceTrackId: track.id,
				startTime: element.startTime,
				endTime: addMediaTime({
					a: element.startTime,
					b: element.duration,
				}),
				mode,
			});
		}
	}
	return result;
}

export function buildSubtitleCutRangesFromSplit({
	tracks,
	elements,
	splitTime,
	retainSide,
	mode,
}: {
	tracks: SceneTracks;
	elements: Array<{ trackId: string; elementId: string }>;
	splitTime: MediaTime;
	retainSide: "both" | "left" | "right";
	mode: SubtitleTimelineCutMode;
}): SubtitleTimelineCutRange[] {
	if (retainSide === "both") return [];
	const elementRefs = new Set(
		elements.map((element) => `${element.trackId}:${element.elementId}`),
	);
	const result: SubtitleTimelineCutRange[] = [];
	for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
		for (const element of track.elements) {
			if (!elementRefs.has(`${track.id}:${element.id}`)) continue;
			const elementStart = element.startTime;
			const elementEnd = addMediaTime({
				a: element.startTime,
				b: element.duration,
			});
			if (splitTime <= elementStart || splitTime >= elementEnd) continue;
			result.push({
				sourceTrackId: track.id,
				startTime: retainSide === "left" ? splitTime : elementStart,
				endTime: retainSide === "left" ? elementEnd : splitTime,
				mode,
			});
		}
	}
	return result;
}

export function buildSubtitleCutRangesFromTargets({
	targets,
	mode,
}: {
	targets: Array<{
		trackId: string;
		ranges: Array<{ startTime: MediaTime; endTime: MediaTime }>;
	}>;
	mode: SubtitleTimelineCutMode;
}): SubtitleTimelineCutRange[] {
	return targets.flatMap((target) =>
		target.ranges.map((range) => ({
			sourceTrackId: target.trackId,
			startTime: range.startTime,
			endTime: range.endTime,
			mode,
		})),
	);
}

export function getTimelineCutModeForCommand({
	rippleEnabled,
}: {
	rippleEnabled: boolean;
}): SubtitleTimelineCutMode {
	return rippleEnabled ? "collapse" : "remove";
}
