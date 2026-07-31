import type { TProjectSubtitleTrack } from "@/project/types";
import type { SceneTracks, TimelineTrack } from "@/timeline";
import type { MediaTime } from "@/wasm/media-time";

const GLOBAL_TRANSCRIPT_TRACK_ID = "track:global";

function getAllTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

export function resolveTranscriptDeletionSourceTracks({
	transcriptTrack,
	selectedTrackId,
	timelineTracks,
	audibleTrackIds,
}: {
	transcriptTrack: TProjectSubtitleTrack;
	selectedTrackId: string;
	timelineTracks: SceneTracks;
	audibleTrackIds: string[];
}): TimelineTrack[] {
	const allTracks = getAllTracks({ tracks: timelineTracks });
	const selectedSourceTrackId = selectedTrackId.startsWith("track:")
		? selectedTrackId.slice("track:".length)
		: null;
	const preferredSourceTrackId =
		transcriptTrack.sourceTrackId ?? selectedSourceTrackId;
	const preferredSourceTrack = preferredSourceTrackId
		? allTracks.find((track) => track.id === preferredSourceTrackId)
		: null;
	if (preferredSourceTrack) return [preferredSourceTrack];

	const isGlobalTranscript =
		transcriptTrack.id === GLOBAL_TRANSCRIPT_TRACK_ID ||
		selectedTrackId === GLOBAL_TRANSCRIPT_TRACK_ID;
	if (!isGlobalTranscript) return [];

	const audibleTrackIdSet = new Set(audibleTrackIds);
	return allTracks.filter((track) => audibleTrackIdSet.has(track.id));
}

export function buildTranscriptDeletionTargets({
	sourceTracks,
	startTime,
	endTime,
}: {
	sourceTracks: TimelineTrack[];
	startTime: MediaTime;
	endTime: MediaTime;
}): Array<{
	trackId: string;
	elementId: string;
	ranges: Array<{ startTime: MediaTime; endTime: MediaTime }>;
}> {
	return sourceTracks.flatMap((track) =>
		track.elements
			.filter((element) => {
				const elementStart = element.startTime;
				const elementEnd = element.startTime + element.duration;
				return elementStart < endTime && elementEnd > startTime;
			})
			.map((element) => ({
				trackId: track.id,
				elementId: element.id,
				ranges: [{ startTime, endTime }],
			})),
	);
}
