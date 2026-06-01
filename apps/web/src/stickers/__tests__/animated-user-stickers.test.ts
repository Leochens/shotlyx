import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { MediaTime } from "@/wasm/media-time";
import {
	buildAnimatedStickerMediaElement,
	filterAnimatedStickerMediaAssets,
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
	type: MediaAsset["type"];
	fileType?: string;
	duration?: number;
}): MediaAsset {
	return {
		id,
		name,
		type,
		file: file({ name, type: fileType ?? `${type}/mock` }),
		url: `blob:${id}`,
		duration,
		width: 256,
		height: 256,
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
		const assets = [
			asset({ id: "1", name: "Sparkle Loop.gif", type: "image" }),
			asset({ id: "2", name: "Smoke Alpha.webm", type: "video" }),
			asset({ id: "3", name: "Voice.mp3", type: "audio" }),
		];

		expect(filterAnimatedStickerMediaAssets({ assets, query: "" })).toEqual([
			assets[0],
			assets[1],
		]);
		expect(
			filterAnimatedStickerMediaAssets({ assets, query: "smoke" }),
		).toEqual([assets[1]]);
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
