import { describe, expect, test } from "bun:test";
import type { AnimatedStickerAsset } from "@/services/storage/types";
import type { MediaTime } from "@/wasm/media-time";
import {
	buildAnimatedStickerMediaElement,
	buildAnimatedStickerProjectMediaAsset,
	filterAnimatedStickerLibraryItems,
	isAnimatedGifAsset,
	isAnimatedStickerUploadFile,
} from "../animated-user-stickers";

function file({ name, type }: { name: string; type: string }): File {
	return new File([new Uint8Array([1])], name, { type });
}

function asset({
	id,
	name,
	type,
	fileType,
	duration,
}: {
	id: string;
	name: string;
	type: "image" | "video";
	fileType?: string;
	duration?: number;
}): AnimatedStickerAsset & { id: string } {
	return {
		id,
		name,
		type,
		file: file({ name, type: fileType ?? `${type}/mock` }),
		url: `blob:${id}`,
		duration,
		width: 256,
		height: 256,
		createdAt: "2026-06-01T00:00:00.000Z",
		updatedAt: "2026-06-01T00:00:00.000Z",
	};
}

function libraryItem({
	id,
	name,
	type,
	fileType,
	duration,
}: {
	id: string;
	name: string;
	type: "image" | "video";
	fileType?: string;
	duration?: number;
}): AnimatedStickerAsset {
	return {
		id,
		name,
		type,
		file: file({ name, type: fileType ?? `${type}/mock` }),
		url: `blob:${id}`,
		duration,
		width: 256,
		height: 256,
		createdAt: "2026-06-01T00:00:00.000Z",
		updatedAt: "2026-06-01T00:00:00.000Z",
	};
}

describe("animated user stickers", () => {
	test("accepts user-uploaded video, GIF, and still image files", () => {
		expect(
			isAnimatedStickerUploadFile({
				file: file({ name: "sticker.webm", type: "video/webm" }),
			}),
		).toBe(true);
		expect(
			isAnimatedStickerUploadFile({
				file: file({ name: "reaction.gif", type: "image/gif" }),
			}),
		).toBe(true);
		expect(
			isAnimatedStickerUploadFile({
				file: file({ name: "cutout.png", type: "image/png" }),
			}),
		).toBe(true);
		expect(
			isAnimatedStickerUploadFile({
				file: file({ name: "sound.mp3", type: "audio/mpeg" }),
			}),
		).toBe(false);
	});

	test("filters uploaded sticker assets by supported media type and query", () => {
		const items = [
			libraryItem({ id: "1", name: "Sparkle Loop.gif", type: "image" }),
			libraryItem({ id: "2", name: "Smoke Alpha.webm", type: "video" }),
		];

		expect(filterAnimatedStickerLibraryItems({ items, query: "" })).toEqual(
			items,
		);
		expect(
			filterAnimatedStickerLibraryItems({ items, query: "smoke" }),
		).toEqual([items[1]]);
	});

	test("marks GIF library items as animated images", () => {
		expect(
			isAnimatedGifAsset({
				type: "image",
				file: file({ name: "reaction.gif", type: "image/gif" }),
			}),
		).toBe(true);
		expect(
			isAnimatedGifAsset({
				type: "image",
				file: file({ name: "reaction.gif", type: "" }),
			}),
		).toBe(true);
		expect(
			isAnimatedGifAsset({
				type: "video",
				file: file({ name: "reaction.gif", type: "video/mp4" }),
			}),
		).toBe(false);
	});

	test("converts library items to hidden project media assets", () => {
		const item = libraryItem({
			id: "library-1",
			name: "Reaction.gif",
			type: "image",
			fileType: "image/gif",
		});

		const projectAsset = buildAnimatedStickerProjectMediaAsset({ item });

		expect(projectAsset).toMatchObject({
			name: "Reaction.gif",
			type: "image",
			ephemeral: true,
			externalSource: {
				provider: "shotlyx:animated-sticker-library",
				providerAssetId: "library-1",
			},
		});
	});

	test("builds media-backed sticker elements with silent video overlays", () => {
		const video = asset({
			id: "video-1",
			name: "Loop.webm",
			type: "video",
			duration: 1.5,
		});
		const image = asset({ id: "image-1", name: "Still.png", type: "image" });
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test constructs a branded MediaTime from the zero tick origin.
		const startTime = 0 as unknown as MediaTime;

		const videoElement = buildAnimatedStickerMediaElement({
			asset: video,
			startTime,
		});
		const imageElement = buildAnimatedStickerMediaElement({
			asset: image,
			startTime,
		});

		expect(videoElement).toMatchObject({
			type: "video",
			mediaId: "video-1",
			isSourceAudioEnabled: false,
		});
		expect(imageElement).toMatchObject({
			type: "image",
			mediaId: "image-1",
		});
	});
});
