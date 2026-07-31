import type { TProjectWatermark } from "@/project/types";

export const DEFAULT_WATERMARK_POSITION = {
	positionX: 0,
	positionY: 0,
} as const;

export const DEFAULT_TEXT_WATERMARK = {
	color: "#ffffff",
	fontFamily: "Arial",
	fontSize: 6,
	opacity: 0.65,
	rotate: 0,
	scale: 1,
} as const;

export const DEFAULT_MEDIA_WATERMARK = {
	opacity: 0.75,
	rotate: 0,
	scale: 0.35,
} as const;

export function clampWatermarkOpacity(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) {
		return DEFAULT_MEDIA_WATERMARK.opacity;
	}
	return Math.min(1, Math.max(0, value));
}

export function clampWatermarkScale(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) {
		return DEFAULT_MEDIA_WATERMARK.scale;
	}
	return Math.min(5, Math.max(0.05, value));
}

export function normalizeWatermarkTransform<T extends TProjectWatermark>(
	watermark: T,
): T {
	return {
		...watermark,
		positionX: Number.isFinite(watermark.positionX) ? watermark.positionX : 0,
		positionY: Number.isFinite(watermark.positionY) ? watermark.positionY : 0,
		rotate: Number.isFinite(watermark.rotate) ? watermark.rotate : 0,
		scale: clampWatermarkScale(watermark.scale),
		opacity: clampWatermarkOpacity(watermark.opacity),
	};
}
