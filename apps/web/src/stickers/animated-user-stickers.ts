import { getMediaTypeFromFile } from "@/media/media-utils";
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type { CreateImageElement, CreateVideoElement } from "@/timeline/types";
import type { MediaTime } from "@/wasm/media-time";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const DEFAULT_UPLOADED_STICKER_DURATION = 5 * MEDIA_TIME_TICKS_PER_SECOND;
const DEFAULT_VISUAL_PARAMS = {
	"transform.positionX": 0,
	"transform.positionY": 0,
	"transform.scaleX": 1,
	"transform.scaleY": 1,
	"transform.rotate": 0,
	opacity: 1,
	blendMode: "normal",
} satisfies ParamValues;
const DEFAULT_VIDEO_PARAMS = {
	...DEFAULT_VISUAL_PARAMS,
	volume: 0,
	muted: false,
} satisfies ParamValues;

function mediaTimeFromIntegerTicksForUploadedSticker({
	ticks,
}: {
	ticks: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Constructed from integer MediaTime tick counts.
	return ticks as unknown as MediaTime;
}

function mediaTimeFromSecondsForUploadedSticker({
	seconds,
}: {
	seconds: number;
}): MediaTime {
	return mediaTimeFromIntegerTicksForUploadedSticker({
		ticks: Math.max(1, Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND)),
	});
}

export const ANIMATED_STICKER_UPLOAD_ACCEPT =
	"image/*,video/*,.gif,.webp,.png,.jpg,.jpeg,.webm,.mp4,.mov";

export type AnimatedStickerMediaAsset = MediaAsset & {
	type: "image" | "video";
};

export function isAnimatedStickerUploadFile({ file }: { file: File }): boolean {
	const mediaType = getMediaTypeFromFile({ file });
	return mediaType === "image" || mediaType === "video";
}

export function isAnimatedStickerMediaAsset(
	asset: MediaAsset,
): asset is AnimatedStickerMediaAsset {
	return asset.type === "image" || asset.type === "video";
}

export function filterAnimatedStickerMediaAssets({
	assets,
	query,
}: {
	assets: MediaAsset[];
	query: string;
}): AnimatedStickerMediaAsset[] {
	const normalizedQuery = query.trim().toLowerCase();
	return assets.filter((asset): asset is AnimatedStickerMediaAsset => {
		if (!isAnimatedStickerMediaAsset(asset)) {
			return false;
		}
		if (!normalizedQuery) {
			return true;
		}
		const searchable = [asset.name, asset.file.type, asset.type]
			.join(" ")
			.toLowerCase();
		return searchable.includes(normalizedQuery);
	});
}

export function buildAnimatedStickerMediaElement({
	asset,
	startTime,
}: {
	asset: AnimatedStickerMediaAsset;
	startTime: MediaTime;
}): CreateImageElement | CreateVideoElement {
	const duration =
		asset.type === "video" && typeof asset.duration === "number"
			? mediaTimeFromSecondsForUploadedSticker({ seconds: asset.duration })
			: mediaTimeFromIntegerTicksForUploadedSticker({
					ticks: DEFAULT_UPLOADED_STICKER_DURATION,
				});

	if (asset.type === "video") {
		return {
			type: "video",
			mediaId: asset.id,
			name: asset.name,
			duration,
			startTime,
			trimStart: mediaTimeFromIntegerTicksForUploadedSticker({ ticks: 0 }),
			trimEnd: mediaTimeFromIntegerTicksForUploadedSticker({ ticks: 0 }),
			sourceDuration: duration,
			isSourceAudioEnabled: false,
			hidden: false,
			params: DEFAULT_VIDEO_PARAMS,
		};
	}

	return {
		type: "image",
		mediaId: asset.id,
		name: asset.name,
		duration,
		startTime,
		trimStart: mediaTimeFromIntegerTicksForUploadedSticker({ ticks: 0 }),
		trimEnd: mediaTimeFromIntegerTicksForUploadedSticker({ ticks: 0 }),
		hidden: false,
		params: DEFAULT_VISUAL_PARAMS,
	};
}
