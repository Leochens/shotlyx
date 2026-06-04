/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- MediaTime is a branded integer tick count; this helper only adds existing MediaTime values and zero. */
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type {
	CreateTimelineElement,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export const DEFAULT_COVER_DURATION_FRAMES = 6;
const ZERO_COVER_MEDIA_TIME = 0 as MediaTime;

type TimelineCoverAsset = Pick<MediaAsset, "id" | "name" | "type">;

export type TimelineCoverElementUpdate = {
	trackId: string;
	elementId: string;
	patch: Pick<Partial<TimelineElement>, "startTime">;
};

export type TimelineCoverInsertionPlan = {
	element: CreateTimelineElement;
	trackId: string;
	updates: TimelineCoverElementUpdate[];
};

export function getAllTracksFromSceneTracks({
	tracks,
}: {
	tracks: SceneTracks;
}): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function addCoverMediaTime({
	a,
	b,
}: {
	a: MediaTime;
	b: MediaTime;
}): MediaTime {
	return (a + b) as MediaTime;
}

export function resolveTimelineCoverDurationSeconds({
	durationFrames = DEFAULT_COVER_DURATION_FRAMES,
	durationSeconds,
	fps,
}: {
	durationFrames?: number;
	durationSeconds?: number;
	fps: number;
}): number {
	if (durationSeconds !== undefined) {
		if (durationSeconds <= 0) {
			throw new Error("durationSeconds 必须大于 0");
		}
		return durationSeconds;
	}

	if (durationFrames <= 0) {
		throw new Error("durationFrames 必须大于 0");
	}

	const effectiveFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
	return durationFrames / effectiveFps;
}

export function buildTimelineCoverInsertion({
	asset,
	duration,
	tracks,
	trackId,
}: {
	asset: TimelineCoverAsset;
	duration: MediaTime;
	tracks: SceneTracks;
	trackId?: string;
}): TimelineCoverInsertionPlan {
	if (asset.type !== "image") {
		throw new Error(`类型不匹配：封面必须使用图片素材，当前为 ${asset.type}`);
	}
	if (duration <= ZERO_COVER_MEDIA_TIME) {
		throw new Error("duration 必须大于 0");
	}

	const targetTrackId = trackId ?? tracks.main.id;
	const allTracks = getAllTracksFromSceneTracks({ tracks });
	const targetTrack = allTracks.find((track) => track.id === targetTrackId);
	if (!targetTrack) {
		throw new Error(`轨道不存在：找不到轨道 "${targetTrackId}"`);
	}
	if (targetTrack.type !== "video") {
		throw new Error(
			`类型不匹配：封面只能插入视频轨道，当前为 ${targetTrack.type}`,
		);
	}

	const updates = allTracks.flatMap((track) =>
		track.elements.map((element) => ({
			trackId: track.id,
			elementId: element.id,
			patch: {
				startTime: addCoverMediaTime({ a: element.startTime, b: duration }),
			},
		})),
	);
	const params: ParamValues = {
		"cover.exclusive": true,
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": 1,
		"transform.scaleY": 1,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};

	return {
		trackId: targetTrackId,
		updates,
		element: {
			type: "image",
			name: `Cover - ${asset.name}`,
			mediaId: asset.id,
			startTime: ZERO_COVER_MEDIA_TIME,
			duration,
			trimStart: ZERO_COVER_MEDIA_TIME,
			trimEnd: ZERO_COVER_MEDIA_TIME,
			params,
		},
	};
}
