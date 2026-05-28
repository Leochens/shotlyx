import { normalizePixelateBlockSize } from "@/effects/definitions/pixelate";
import type { ScalarAnimationChannel } from "@/animation/types";
import type {
	CreateEffectElement,
	CreateGraphicElement,
} from "@/timeline/types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

export type CalloutGraphicKind = "arrow" | "box" | "circle";

const CALLOUT_DEFINITION_BY_KIND = {
	arrow: "callout-arrow",
	box: "callout-box",
	circle: "callout-circle",
} as const satisfies Record<CalloutGraphicKind, string>;

const CALLOUT_NAME_BY_KIND = {
	arrow: "Arrow callout",
	box: "Box callout",
	circle: "Circle callout",
} as const satisfies Record<CalloutGraphicKind, string>;

type GraphicMediaTime = CreateGraphicElement["startTime"];
type EffectMediaTime = CreateEffectElement["startTime"];

function mediaTimeFromSecondsForCallout({
	seconds,
}: {
	seconds: number;
}): GraphicMediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as GraphicMediaTime;
}

function mediaTimeFromSecondsForEffect({
	seconds,
}: {
	seconds: number;
}): EffectMediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as EffectMediaTime;
}

function clampDuration({ seconds }: { seconds: number | undefined }): number {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
		return 1.2;
	}
	return Math.max(0.1, Math.min(30, seconds));
}

function buildScalarAnimation({
	values,
}: {
	values: Array<{ id: string; timeSeconds: number; value: number }>;
}): ScalarAnimationChannel {
	return {
		keys: values.map((key, index) => ({
			id: key.id,
			time: mediaTimeFromSecondsForCallout({ seconds: key.timeSeconds }),
			value: key.value,
			segmentToNext: index === values.length - 1 ? "linear" : "bezier",
			tangentMode: "flat",
		})),
		extrapolation: {
			before: "hold",
			after: "hold",
		},
	};
}

function buildCalloutAnimations({
	duration,
	scaleX,
	scaleY,
}: {
	duration: GraphicMediaTime;
	scaleX: number;
	scaleY: number;
}): CreateGraphicElement["animations"] {
	const durationSeconds = Number(duration) / MEDIA_TIME_TICKS_PER_SECOND;
	const introEnd = Math.min(0.18, durationSeconds * 0.3);
	const settle = Math.min(0.3, durationSeconds * 0.45);
	const fadeOutStart = Math.max(introEnd, durationSeconds - 0.18);

	return {
		opacity: buildScalarAnimation({
			values: [
				{ id: "callout-opacity-in", timeSeconds: 0, value: 0 },
				{ id: "callout-opacity-hold", timeSeconds: introEnd, value: 1 },
				{
					id: "callout-opacity-out-start",
					timeSeconds: fadeOutStart,
					value: 1,
				},
				{ id: "callout-opacity-out", timeSeconds: durationSeconds, value: 0 },
			],
		}),
		"transform.scaleX": buildScalarAnimation({
			values: [
				{ id: "callout-scale-x-in", timeSeconds: 0, value: scaleX * 0.92 },
				{
					id: "callout-scale-x-bump",
					timeSeconds: introEnd,
					value: scaleX * 1.04,
				},
				{ id: "callout-scale-x-settle", timeSeconds: settle, value: scaleX },
			],
		}),
		"transform.scaleY": buildScalarAnimation({
			values: [
				{ id: "callout-scale-y-in", timeSeconds: 0, value: scaleY * 0.92 },
				{
					id: "callout-scale-y-bump",
					timeSeconds: introEnd,
					value: scaleY * 1.04,
				},
				{ id: "callout-scale-y-settle", timeSeconds: settle, value: scaleY },
			],
		}),
	};
}

export function buildCalloutGraphicElement({
	kind,
	startTimeSeconds,
	durationSeconds,
	color = "#facc15",
	fill,
	positionX = 0,
	positionY = 0,
	scaleX = kind === "arrow" ? 0.9 : 1,
	scaleY = kind === "arrow" ? 0.55 : 1,
	rotate = 0,
	strokeWidth = 18,
}: {
	kind: CalloutGraphicKind;
	startTimeSeconds: number;
	durationSeconds?: number;
	color?: string;
	fill?: string;
	positionX?: number;
	positionY?: number;
	scaleX?: number;
	scaleY?: number;
	rotate?: number;
	strokeWidth?: number;
}): CreateGraphicElement {
	const duration = mediaTimeFromSecondsForCallout({
		seconds: clampDuration({ seconds: durationSeconds }),
	});
	const resolvedFill =
		fill ?? (kind === "arrow" ? color : "rgba(250, 204, 21, 0.08)");

	return {
		type: "graphic",
		name: CALLOUT_NAME_BY_KIND[kind],
		definitionId: CALLOUT_DEFINITION_BY_KIND[kind],
		startTime: mediaTimeFromSecondsForCallout({ seconds: startTimeSeconds }),
		duration,
		trimStart: mediaTimeFromSecondsForCallout({ seconds: 0 }),
		trimEnd: mediaTimeFromSecondsForCallout({ seconds: 0 }),
		params: {
			fill: resolvedFill,
			stroke: color,
			strokeWidth,
			"transform.positionX": positionX,
			"transform.positionY": positionY,
			"transform.scaleX": scaleX,
			"transform.scaleY": scaleY,
			"transform.rotate": rotate,
			opacity: 1,
			blendMode: "normal",
		},
		animations: buildCalloutAnimations({ duration, scaleX, scaleY }),
	};
}

export function buildMosaicEffectElement({
	startTimeSeconds,
	durationSeconds,
	blockSize = 24,
}: {
	startTimeSeconds: number;
	durationSeconds?: number;
	blockSize?: number;
}): CreateEffectElement {
	return {
		type: "effect",
		name: "Mosaic effect",
		effectType: "pixelate",
		startTime: mediaTimeFromSecondsForEffect({ seconds: startTimeSeconds }),
		duration: mediaTimeFromSecondsForEffect({
			seconds: clampDuration({ seconds: durationSeconds }),
		}),
		trimStart: mediaTimeFromSecondsForEffect({ seconds: 0 }),
		trimEnd: mediaTimeFromSecondsForEffect({ seconds: 0 }),
		params: {
			blockSize: normalizePixelateBlockSize({ blockSize }),
		},
	};
}
