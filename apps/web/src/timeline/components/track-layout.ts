import type { TrackType } from "@/timeline";
import {
	KEYFRAME_LANE_HEIGHT_PX,
	TIMELINE_TRACK_GAP_PX,
	TIMELINE_TRACK_HEIGHTS_PX,
	type TimelineDensity,
} from "./layout";

const DEFAULT_TIMELINE_DENSITY: TimelineDensity = "normal";

export function getTimelineDensity({
	viewportHeight,
}: {
	viewportHeight: number;
}): TimelineDensity {
	if (viewportHeight < 180) return "compact";
	if (viewportHeight >= 420) return "expanded";
	return "normal";
}

export function getTrackHeight({
	type,
	density = DEFAULT_TIMELINE_DENSITY,
}: {
	type: TrackType;
	density?: TimelineDensity;
}): number {
	return TIMELINE_TRACK_HEIGHTS_PX[density][type];
}

export function getTrackGap({
	density = DEFAULT_TIMELINE_DENSITY,
}: {
	density?: TimelineDensity;
} = {}): number {
	return TIMELINE_TRACK_GAP_PX[density];
}

export function getExpandedTrackHeight({
	type,
	expandedLaneCount,
	density = DEFAULT_TIMELINE_DENSITY,
}: {
	type: TrackType;
	expandedLaneCount: number;
	density?: TimelineDensity;
}): number {
	return (
		getTrackHeight({ type, density }) +
		expandedLaneCount * KEYFRAME_LANE_HEIGHT_PX
	);
}

export function getCumulativeHeightBefore({
	tracks,
	trackIndex,
	getExtraHeight,
	density = DEFAULT_TIMELINE_DENSITY,
}: {
	tracks: Array<{ type: TrackType }>;
	trackIndex: number;
	getExtraHeight?: (trackIndex: number) => number;
	density?: TimelineDensity;
}): number {
	const gap = getTrackGap({ density });
	return tracks
		.slice(0, trackIndex)
		.reduce(
			(sum, track, i) =>
				sum +
				getTrackHeight({ type: track.type, density }) +
				(getExtraHeight?.(i) ?? 0) +
				gap,
			0,
		);
}

export function getTotalTracksHeight({
	tracks,
	getExtraHeight,
	density = DEFAULT_TIMELINE_DENSITY,
}: {
	tracks: Array<{ type: TrackType }>;
	getExtraHeight?: (trackIndex: number) => number;
	density?: TimelineDensity;
}): number {
	const tracksHeight = tracks.reduce(
		(sum, track, i) =>
			sum +
			getTrackHeight({ type: track.type, density }) +
			(getExtraHeight?.(i) ?? 0),
		0,
	);
	const gapsHeight = Math.max(0, tracks.length - 1) * getTrackGap({ density });
	return tracksHeight + gapsHeight;
}
