import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import type { CreateGraphicElement } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import type { MediaTime } from "@/wasm";
import type {
	ProjectMotionGraphicManifest,
	ProjectMotionGraphicAsset,
	ProjectMotionGraphicKind,
} from "./types";

export const PROJECT_MOTION_GRAPHICS_PROVIDER_ID = "project-mg";

// Keep this module free of the wasm runtime so Agent tool unit tests can import it
// without loading browser-oriented editor dependencies.
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ZERO_MOTION_GRAPHIC_MEDIA_TIME = 0 as MediaTime;

type MotionGraphicAssetInput = Pick<
	ProjectMotionGraphicAsset,
	"id" | "name" | "definitionId" | "params" | "duration"
>;

function buildDefaultGraphicElementParams(): ParamValues {
	return {
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": 1,
		"transform.scaleY": 1,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};
}

function mergeDefinedParamValues({
	base,
	overrides,
}: {
	base: ParamValues;
	overrides?: Partial<ParamValues>;
}): ParamValues {
	const result: ParamValues = { ...base };
	for (const [key, value] of Object.entries(overrides ?? {})) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}

export function buildMotionGraphicProgressAnimation({
	duration,
}: {
	duration: MediaTime;
}): ElementAnimations {
	return {
		"params.progress": {
			keys: [
				{
					id: "mg-progress-start",
					time: ZERO_MOTION_GRAPHIC_MEDIA_TIME,
					value: 0,
					segmentToNext: "linear",
					tangentMode: "flat",
				},
				{
					id: "mg-progress-end",
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

export function buildProjectMotionGraphicAsset({
	name,
	definitionId,
	params,
	duration,
	kind,
	sourcePrompt,
	thumbnailUrl,
	manifest,
}: {
	name: string;
	definitionId: string;
	params: ParamValues;
	duration: MediaTime;
	kind?: ProjectMotionGraphicKind;
	sourcePrompt?: string;
	thumbnailUrl?: string;
	manifest?: ProjectMotionGraphicManifest;
}): ProjectMotionGraphicAsset {
	const now = new Date().toISOString();
	return {
		id: generateUUID(),
		name,
		engine: "opencut-graphic-v1",
		definitionId,
		params,
		duration,
		kind,
		sourcePrompt,
		manifest,
		thumbnailUrl,
		createdAt: now,
		updatedAt: now,
	};
}

export function buildMotionGraphicElementFromAsset({
	asset,
	startTime,
	params,
}: {
	asset: MotionGraphicAssetInput;
	startTime: MediaTime;
	params?: Partial<ParamValues>;
}): CreateGraphicElement {
	return {
		type: "graphic",
		name: asset.name,
		definitionId: asset.definitionId,
		motionGraphicAssetId: asset.id,
		motionGraphicBaseParams: asset.params,
		startTime,
		duration: asset.duration,
		trimStart: ZERO_MOTION_GRAPHIC_MEDIA_TIME,
		trimEnd: ZERO_MOTION_GRAPHIC_MEDIA_TIME,
		params: mergeDefinedParamValues({
			base: buildDefaultGraphicElementParams(),
			overrides: params,
		}),
		animations: buildMotionGraphicProgressAnimation({
			duration: asset.duration,
		}),
	};
}

export function buildProjectMotionGraphicStickerId({
	assetId,
}: {
	assetId: string;
}): string {
	return `${PROJECT_MOTION_GRAPHICS_PROVIDER_ID}:${assetId}`;
}

export function parseProjectMotionGraphicStickerId({
	stickerId,
}: {
	stickerId: string;
}): string | null {
	const prefix = `${PROJECT_MOTION_GRAPHICS_PROVIDER_ID}:`;
	return stickerId.startsWith(prefix) ? stickerId.slice(prefix.length) : null;
}
