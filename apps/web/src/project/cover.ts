/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Project cover export planning uses local integer tick math to avoid loading the wasm runtime in Agent tool registration. */
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type { TCanvasSize, TProjectCover } from "@/project/types";
import type {
	ImageElement,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoTrack,
} from "@/timeline";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { MediaTime } from "@/wasm";

const DEFAULT_PROJECT_COVER_DURATION_SECONDS_VALUE = 3;
const MIN_PROJECT_COVER_DURATION_SECONDS_VALUE = 0.1;
const MAX_PROJECT_COVER_DURATION_SECONDS_VALUE = 60;
const ZERO_PROJECT_COVER_MEDIA_TIME = 0 as MediaTime;

export const DEFAULT_PROJECT_COVER_DURATION_SECONDS =
	DEFAULT_PROJECT_COVER_DURATION_SECONDS_VALUE;
export const MIN_PROJECT_COVER_DURATION_SECONDS =
	MIN_PROJECT_COVER_DURATION_SECONDS_VALUE;
export const MAX_PROJECT_COVER_DURATION_SECONDS =
	MAX_PROJECT_COVER_DURATION_SECONDS_VALUE;

export type ProjectCoverLayoutMode = TProjectCover["layout"]["mode"];

export type ProjectCoverExportPlan = {
	coverApplied: boolean;
	coverDuration: MediaTime;
	duration: MediaTime;
	tracks: SceneTracks;
};

export function clampProjectCoverDurationSeconds(value: number): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_PROJECT_COVER_DURATION_SECONDS_VALUE;
	}
	return Math.min(
		MAX_PROJECT_COVER_DURATION_SECONDS_VALUE,
		Math.max(MIN_PROJECT_COVER_DURATION_SECONDS_VALUE, value),
	);
}

export function getProjectCoverAsset({
	cover,
	mediaAssets,
}: {
	cover?: TProjectCover | null;
	mediaAssets: MediaAsset[];
}): MediaAsset | null {
	if (!cover?.enabled) return null;
	return (
		mediaAssets.find(
			(asset) => asset.id === cover.mediaId && asset.type === "image",
		) ?? null
	);
}

export function getProjectCoverThumbnail({
	cover,
	mediaAssets,
}: {
	cover?: TProjectCover | null;
	mediaAssets: MediaAsset[];
}): string | null {
	const asset = getProjectCoverAsset({ cover, mediaAssets });
	return asset?.thumbnailUrl ?? asset?.url ?? null;
}

export function getDefaultProjectCoverCustomSize({
	asset,
	canvasSize,
}: {
	asset?: Pick<MediaAsset, "width" | "height"> | null;
	canvasSize: TCanvasSize;
}): { width: number; height: number } {
	const sourceWidth = asset?.width && asset.width > 0 ? asset.width : canvasSize.width;
	const sourceHeight =
		asset?.height && asset.height > 0 ? asset.height : canvasSize.height;
	const scale = Math.min(1, canvasSize.width / sourceWidth, canvasSize.height / sourceHeight);
	return {
		width: Math.max(1, Math.round(sourceWidth * scale)),
		height: Math.max(1, Math.round(sourceHeight * scale)),
	};
}

export function createDefaultProjectCover({
	asset,
}: {
	asset: Pick<MediaAsset, "id">;
	canvasSize: TCanvasSize;
}): TProjectCover {
	return {
		enabled: true,
		mediaId: asset.id,
		durationSeconds: DEFAULT_PROJECT_COVER_DURATION_SECONDS,
		layout: { mode: "fill" },
	};
}

export function normalizeProjectCover({
	asset,
	canvasSize,
	cover,
}: {
	asset?: Pick<MediaAsset, "id" | "width" | "height" | "type"> | null;
	canvasSize: TCanvasSize;
	cover?: TProjectCover | null;
}): TProjectCover | null {
	if (!cover?.enabled) return null;
	if (!asset || asset.type !== "image") return null;

	const durationSeconds = clampProjectCoverDurationSeconds(
		cover.durationSeconds,
	);
	if (cover.layout.mode === "custom") {
		const fallbackSize = getDefaultProjectCoverCustomSize({ asset, canvasSize });
		return {
			enabled: true,
			mediaId: asset.id,
			durationSeconds,
			layout: {
				mode: "custom",
				width: normalizeCoverDimension({
					value: cover.layout.width,
					fallback: fallbackSize.width,
				}),
				height: normalizeCoverDimension({
					value: cover.layout.height,
					fallback: fallbackSize.height,
				}),
			},
		};
	}

	return {
		enabled: true,
		mediaId: asset.id,
		durationSeconds,
		layout: { mode: "fill" },
	};
}

export function buildProjectCoverExportPlan({
	canvasSize,
	cover,
	mediaAssets,
	timelineDuration,
	tracks,
}: {
	canvasSize: TCanvasSize;
	cover?: TProjectCover | null;
	mediaAssets: MediaAsset[];
	timelineDuration: MediaTime;
	tracks: SceneTracks;
}): ProjectCoverExportPlan {
	const coverAsset = getProjectCoverAsset({ cover, mediaAssets });
	if (!cover || !coverAsset) {
		return {
			coverApplied: false,
			coverDuration: ZERO_PROJECT_COVER_MEDIA_TIME,
			duration: timelineDuration,
			tracks,
		};
	}

	const normalizedCover = normalizeProjectCover({
		asset: coverAsset,
		canvasSize,
		cover,
	});
	if (!normalizedCover) {
		return {
			coverApplied: false,
			coverDuration: ZERO_PROJECT_COVER_MEDIA_TIME,
			duration: timelineDuration,
			tracks,
		};
	}

	const coverDuration = projectCoverMediaTimeFromSeconds({
		seconds: normalizedCover.durationSeconds,
	});
	const shiftedTracks = shiftSceneTracks({ tracks, offset: coverDuration });
	const coverTrack: VideoTrack = {
		id: "project-cover-track",
		type: "video",
		name: "Project cover",
		muted: false,
		hidden: false,
		elements: [
			buildProjectCoverElement({
				asset: coverAsset,
				canvasSize,
				cover: normalizedCover,
				duration: coverDuration,
			}),
		],
	};

	return {
		coverApplied: true,
		coverDuration,
		duration: addProjectCoverMediaTime({
			a: timelineDuration,
			b: coverDuration,
		}),
		tracks: {
			...shiftedTracks,
			overlay: [...shiftedTracks.overlay, coverTrack],
		},
	};
}

function normalizeCoverDimension({
	fallback,
	value,
}: {
	fallback: number;
	value: number;
}): number {
	if (!Number.isFinite(value) || value <= 0) return fallback;
	return Math.max(1, Math.round(value));
}

function buildProjectCoverElement({
	asset,
	canvasSize,
	cover,
	duration,
}: {
	asset: MediaAsset;
	canvasSize: TCanvasSize;
	cover: TProjectCover;
	duration: MediaTime;
}): ImageElement {
	return {
		id: "project-cover-element",
		type: "image",
		name: `Project cover - ${asset.name}`,
		mediaId: asset.id,
		startTime: ZERO_PROJECT_COVER_MEDIA_TIME,
		duration,
		trimStart: ZERO_PROJECT_COVER_MEDIA_TIME,
		trimEnd: ZERO_PROJECT_COVER_MEDIA_TIME,
		hidden: false,
		params: buildProjectCoverParams({ asset, canvasSize, cover }),
	};
}

export function buildProjectCoverParams({
	asset,
	canvasSize,
	cover,
}: {
	asset: Pick<MediaAsset, "width" | "height">;
	canvasSize: TCanvasSize;
	cover: TProjectCover;
}): ParamValues {
	const sourceWidth = asset.width && asset.width > 0 ? asset.width : canvasSize.width;
	const sourceHeight =
		asset.height && asset.height > 0 ? asset.height : canvasSize.height;
	const containScale = Math.min(
		canvasSize.width / sourceWidth,
		canvasSize.height / sourceHeight,
	);
	const safeContainScale =
		Number.isFinite(containScale) && containScale > 0 ? containScale : 1;
	let scaleX = 1;
	let scaleY = 1;

	if (cover.layout.mode === "fill") {
		const coverScale = Math.max(
			canvasSize.width / sourceWidth,
			canvasSize.height / sourceHeight,
		);
		const safeCoverScale =
			Number.isFinite(coverScale) && coverScale > 0
				? coverScale
				: safeContainScale;
		scaleX = safeCoverScale / safeContainScale;
		scaleY = safeCoverScale / safeContainScale;
	} else {
		scaleX = cover.layout.width / (sourceWidth * safeContainScale);
		scaleY = cover.layout.height / (sourceHeight * safeContainScale);
	}

	return {
		"project.cover": true,
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": scaleX,
		"transform.scaleY": scaleY,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};
}

function shiftSceneTracks({
	offset,
	tracks,
}: {
	offset: MediaTime;
	tracks: SceneTracks;
}): SceneTracks {
	if (offset === ZERO_PROJECT_COVER_MEDIA_TIME) return tracks;
	return {
		main: shiftTrack({ track: tracks.main, offset }),
		overlay: tracks.overlay.map((track) => shiftTrack({ track, offset })),
		audio: tracks.audio.map((track) => shiftTrack({ track, offset })),
	};
}

function shiftTrack<T extends TimelineTrack>({
	offset,
	track,
}: {
	offset: MediaTime;
	track: T;
}): T {
	return {
		...track,
		elements: track.elements.map((element) => shiftElement({ element, offset })),
	} as T;
}

function shiftElement<T extends TimelineElement>({
	element,
	offset,
}: {
	element: T;
	offset: MediaTime;
}): T {
	return {
		...element,
		startTime: addProjectCoverMediaTime({ a: element.startTime, b: offset }),
	};
}

function projectCoverMediaTimeFromSeconds({
	seconds,
}: {
	seconds: number;
}): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}

function addProjectCoverMediaTime({
	a,
	b,
}: {
	a: MediaTime;
	b: MediaTime;
}): MediaTime {
	return (a + b) as MediaTime;
}
