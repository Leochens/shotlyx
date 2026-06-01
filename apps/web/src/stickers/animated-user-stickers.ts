import type { EditorCore } from "@/core";
import { getMediaTypeFromFile } from "@/media/media-utils";
import type { MediaAsset } from "@/media/types";
import type { ParamValues } from "@/params";
import type { AnimatedStickerAsset } from "@/services/storage/types";
import type {
	CreateImageElement,
	CreateVideoElement,
	TrackType,
} from "@/timeline/types";
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

const ANIMATED_STICKER_LIBRARY_PROVIDER = "shotlyx:animated-sticker-library";

export type AnimatedStickerProjectMediaAsset = MediaAsset & {
	type: "image" | "video";
};

export type AnimatedStickerLibraryItem = AnimatedStickerAsset;

export function isAnimatedStickerUploadFile({ file }: { file: File }): boolean {
	const mediaType = getMediaTypeFromFile({ file });
	return mediaType === "image" || mediaType === "video";
}

export function isAnimatedStickerProjectMediaAsset(
	asset: MediaAsset,
): asset is AnimatedStickerProjectMediaAsset {
	return asset.type === "image" || asset.type === "video";
}

export function isAnimatedGifAsset({
	file,
	type,
}: {
	file: Pick<File, "name" | "type">;
	type: "image" | "video";
}): boolean {
	return (
		type === "image" &&
		(file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif"))
	);
}

export function filterAnimatedStickerLibraryItems({
	items,
	query,
}: {
	items: AnimatedStickerLibraryItem[];
	query: string;
}): AnimatedStickerLibraryItem[] {
	const normalizedQuery = query.trim().toLowerCase();
	return items.filter((item) => {
		if (!normalizedQuery) {
			return true;
		}
		const searchable = [item.name, item.file.name, item.file.type, item.type]
			.join(" ")
			.toLowerCase();
		return searchable.includes(normalizedQuery);
	});
}

export function buildAnimatedStickerProjectMediaAsset({
	item,
}: {
	item: AnimatedStickerLibraryItem;
}): Omit<AnimatedStickerProjectMediaAsset, "id"> {
	const sourceUrl = `shotlyx://animated-stickers/${item.id}`;
	const now = new Date().toISOString();
	return {
		name: item.name,
		type: item.type,
		file: item.file,
		url: item.url,
		thumbnailUrl: item.thumbnailUrl,
		duration: item.duration,
		width: item.width,
		height: item.height,
		fps: item.fps,
		hasAudio: item.hasAudio,
		ephemeral: true,
		externalSource: {
			provider: ANIMATED_STICKER_LIBRARY_PROVIDER,
			providerAssetId: item.id,
			sourceUrl,
			importedAt: now,
			license: {
				name: "User uploaded",
				attributionRequired: false,
				sourceProvider: "User upload",
				sourceUrl,
				verifiedAt: now,
			},
		},
	};
}

export function findProjectMediaAssetForAnimatedSticker({
	assets,
	item,
}: {
	assets: MediaAsset[];
	item: AnimatedStickerLibraryItem;
}): AnimatedStickerProjectMediaAsset | null {
	const found = assets.find(
		(asset) =>
			asset.ephemeral === true &&
			asset.externalSource?.provider === ANIMATED_STICKER_LIBRARY_PROVIDER &&
			asset.externalSource.providerAssetId === item.id &&
			isAnimatedStickerProjectMediaAsset(asset),
	);
	return found ?? null;
}

export function buildAnimatedStickerMediaElement({
	asset,
	startTime,
}: {
	asset: AnimatedStickerProjectMediaAsset;
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

export async function insertAnimatedStickerLibraryItem({
	editor,
	item,
	startTime,
	placement = { mode: "auto", trackType: "video" },
}: {
	editor: EditorCore;
	item: AnimatedStickerLibraryItem;
	startTime: MediaTime;
	placement?:
		| { mode: "explicit"; trackId: string }
		| { mode: "auto"; trackType?: TrackType; insertIndex?: number };
}): Promise<{ elementId?: string; trackId?: string | null; mediaId: string }> {
	const activeProject = editor.project.getActiveOrNull();
	if (!activeProject) {
		throw new Error("No active project");
	}

	let mediaAsset = findProjectMediaAssetForAnimatedSticker({
		assets: editor.media.getAssets(),
		item,
	});
	if (!mediaAsset) {
		const created = await editor.media.addMediaAsset({
			projectId: activeProject.metadata.id,
			asset: buildAnimatedStickerProjectMediaAsset({ item }),
		});
		if (!created || !isAnimatedStickerProjectMediaAsset(created)) {
			throw new Error("Failed to prepare motion sticker media");
		}
		mediaAsset = created;
	}

	const insertion = editor.timeline.insertElement({
		placement,
		element: buildAnimatedStickerMediaElement({
			asset: mediaAsset,
			startTime,
		}),
	});

	return {
		elementId: insertion.elementId,
		trackId: insertion.trackId,
		mediaId: mediaAsset.id,
	};
}
