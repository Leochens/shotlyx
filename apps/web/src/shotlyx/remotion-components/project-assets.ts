import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import type { CreateGraphicElement } from "@/timeline/types";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { ShotlyxMGAsset } from "./types";

export const SHOTLYX_MG_PROJECT_PROVIDER_ID = "shotlyx-remotion-component";
export const SHOTLYX_MG_GRAPHIC_DEFINITION_ID =
	"shotlyx-remotion-component";
export const SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY =
	"shotlyxMGBackgroundColor";
export const SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY =
	"shotlyxMGBackgroundOpacity";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ZERO_SHOTLYX_MEDIA_TIME = 0 as MediaTime;

export function shotlyxMediaTimeFromSeconds({
	seconds,
}: {
	seconds: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}

export function shotlyxMediaTimeToSeconds({ time }: { time: MediaTime }): number {
	return Number(time) / MEDIA_TIME_TICKS_PER_SECOND;
}

export function buildShotlyxMGProgressAnimation({
	duration,
}: {
	duration: MediaTime;
}): ElementAnimations {
	return {
		"params.progress": {
			keys: [
				{
					id: "shotlyx-remotion-progress-start",
					time: ZERO_SHOTLYX_MEDIA_TIME,
					value: 0,
					segmentToNext: "linear",
					tangentMode: "flat",
				},
				{
					id: "shotlyx-remotion-progress-end",
					time: duration,
					value: 1,
					segmentToNext: "linear",
					tangentMode: "flat",
				},
			],
			extrapolation: {
				before: "hold",
				after: "hold",
			},
		},
	};
}

export function buildShotlyxMGGraphicParams({
	asset,
}: {
	asset: Pick<ShotlyxMGAsset, "id" | "document">;
}): ParamValues {
	const transparentBackground = asset.document.transparentBackground !== false;
	return {
		shotlyxMGAssetId: asset.id,
		progress: 1,
		[SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY]: "#050505",
		[SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY]: transparentBackground ? 0 : 1,
	};
}

export function buildDefaultShotlyxMGElementParams({
	asset,
}: {
	asset: ShotlyxMGAsset;
}): ParamValues {
	const aspectScale =
		asset.document.height > 0
			? asset.document.width / asset.document.height
			: 1;
	return {
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": aspectScale,
		"transform.scaleY": 1,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};
}

export function buildShotlyxMGElementFromAsset({
	asset,
	startTime,
}: {
	asset: ShotlyxMGAsset;
	startTime: MediaTime;
}): CreateGraphicElement {
	const duration = shotlyxMediaTimeFromSeconds({
		seconds: asset.document.durationSeconds,
	});

	return {
		type: "graphic",
		name: asset.name,
		definitionId: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
		motionGraphicAssetId: asset.id,
		motionGraphicBaseParams: buildShotlyxMGGraphicParams({ asset }),
		startTime,
		duration,
		trimStart: ZERO_SHOTLYX_MEDIA_TIME,
		trimEnd: ZERO_SHOTLYX_MEDIA_TIME,
		params: buildDefaultShotlyxMGElementParams({ asset }),
		animations: buildShotlyxMGProgressAnimation({ duration }),
	};
}

export function buildShotlyxMGStickerId({
	assetId,
}: {
	assetId: string;
}): string {
	return `${SHOTLYX_MG_PROJECT_PROVIDER_ID}:${assetId}`;
}

export function parseShotlyxMGStickerId({
	stickerId,
}: {
	stickerId: string;
}): string | null {
	const prefix = `${SHOTLYX_MG_PROJECT_PROVIDER_ID}:`;
	return stickerId.startsWith(prefix) ? stickerId.slice(prefix.length) : null;
}
