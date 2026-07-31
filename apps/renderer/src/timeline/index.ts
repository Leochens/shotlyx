import { addMediaTime, type MediaTime, ZERO_MEDIA_TIME } from "@/wasm";
import type { SceneTracks, TimelineElement, TimelineTrack } from "./types";

export * from "./types";
export * from "./drag";
export * from "./track-capabilities";
export * from "./track-element-update";
export * from "./element-utils";
export * from "./compound-elements";
export * from "./audio-separation";
export * from "./zoom-utils";
export * from "./ruler-utils";
export * from "./pixel-utils";

export function calculateTotalDuration({
	tracks,
}: {
	tracks: SceneTracks;
}): MediaTime {
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	if (orderedTracks.length === 0) return ZERO_MEDIA_TIME;

	let maxEnd: MediaTime = ZERO_MEDIA_TIME;
	for (const track of orderedTracks) {
		if (isTimelineTrackHidden({ track })) continue;
		for (const element of track.elements) {
			if (!shouldElementContributeToDuration({ element })) continue;
			const elementEnd = addMediaTime({
				a: element.startTime,
				b: element.duration,
			});
			if (elementEnd > maxEnd) maxEnd = elementEnd;
		}
	}
	return maxEnd;
}

function isTimelineTrackHidden({ track }: { track: TimelineTrack }): boolean {
	return "hidden" in track && track.hidden === true;
}

function shouldElementContributeToDuration({
	element,
}: {
	element: TimelineElement;
}): boolean {
	if (element.duration <= 0) return false;
	return !("hidden" in element && element.hidden === true);
}
