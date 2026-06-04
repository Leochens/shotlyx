import { describe, expect, mock, test } from "bun:test";
import type { UploadedSoundAsset } from "@/sounds/types";
import type { MediaTime } from "@/wasm/media-time";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const {
	buildUploadedSoundMediaElement,
	buildUploadedSoundProjectMediaAsset,
	filterUploadedSoundAssets,
	isUploadedSoundFile,
} = await import("../uploaded-sounds");

function file({ name, type }: { name: string; type: string }): File {
	return new File([new Uint8Array([1])], name, { type });
}

function uploadedSound({
	id,
	name,
	duration = 1.25,
}: {
	id: string;
	name: string;
	duration?: number;
}): UploadedSoundAsset {
	return {
		id,
		name,
		file: file({ name, type: "audio/mpeg" }),
		url: `blob:${id}`,
		duration,
		createdAt: "2026-06-04T00:00:00.000Z",
		updatedAt: "2026-06-04T00:00:00.000Z",
	};
}

describe("uploaded sound effects", () => {
	test("accepts only user-uploaded audio files", () => {
		expect(
			isUploadedSoundFile({
				file: file({ name: "impact.mp3", type: "audio/mpeg" }),
			}),
		).toBe(true);
		expect(
			isUploadedSoundFile({
				file: file({ name: "loop.wav", type: "audio/wav" }),
			}),
		).toBe(true);
		expect(
			isUploadedSoundFile({
				file: file({ name: "sticker.gif", type: "image/gif" }),
			}),
		).toBe(false);
	});

	test("filters uploaded global sounds by name and file metadata", () => {
		const items = [
			uploadedSound({ id: "1", name: "Soft Pop.mp3" }),
			uploadedSound({ id: "2", name: "Camera Shutter.wav" }),
		];

		expect(filterUploadedSoundAssets({ items, query: "" })).toEqual(items);
		expect(filterUploadedSoundAssets({ items, query: "camera" })).toEqual([
			items[1],
		]);
	});

	test("converts global uploaded sounds into project audio assets", () => {
		const item = uploadedSound({ id: "sound-1", name: "Whoosh.mp3" });

		const projectAsset = buildUploadedSoundProjectMediaAsset({ item });

		expect(projectAsset).toMatchObject({
			name: "Whoosh.mp3",
			type: "audio",
			ephemeral: true,
			externalSource: {
				provider: "shotlyx:uploaded-sound-library",
				providerAssetId: "sound-1",
			},
		});
	});

	test("builds upload audio elements from project assets", () => {
		const projectAsset = {
			...buildUploadedSoundProjectMediaAsset({
				item: uploadedSound({ id: "sound-1", name: "Whoosh.mp3" }),
			}),
			id: "media-1",
		};

		const element = buildUploadedSoundMediaElement({
			asset: projectAsset,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test constructs a branded MediaTime from zero ticks.
			startTime: 0 as unknown as MediaTime,
		});

		expect(element).toMatchObject({
			type: "audio",
			mediaId: "media-1",
			name: "Whoosh.mp3",
			sourceType: "upload",
		});
	});
});
