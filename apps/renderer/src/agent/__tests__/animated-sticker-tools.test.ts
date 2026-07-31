/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { ANIMATED_STICKER_PRESETS } from "@/graphics/definitions/animated-stickers";
import type { AnimatedStickerAsset } from "@/services/storage/types";
import { buildAnimatedStickerTools } from "@/agent/mcp/animated-sticker-tools";
import type { MediaTime } from "@/wasm/media-time";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(
		seconds * MEDIA_TIME_TICKS_PER_SECOND,
	) as unknown as MediaTime;
}

function file({ name, type }: { name: string; type: string }): File {
	return new File([new Uint8Array([1])], name, { type });
}

function uploadedSticker(): AnimatedStickerAsset {
	return {
		id: "upload-1",
		name: "Reaction.gif",
		type: "image",
		file: file({ name: "Reaction.gif", type: "image/gif" }),
		url: "blob:upload-1",
		width: 240,
		height: 240,
		createdAt: "2026-06-01T00:00:00.000Z",
		updatedAt: "2026-06-01T00:00:00.000Z",
	};
}

function createMockEditor({
	insertElement = mock(() => ({
		elementId: "animated-sticker-1",
		trackId: "track-1",
	})),
	addMediaAsset = mock(async ({ asset }) => ({
		...asset,
		id: "media-1",
	})),
	getAssets = mock(() => []),
}: {
	insertElement?: ReturnType<typeof mock>;
	addMediaAsset?: ReturnType<typeof mock>;
	getAssets?: ReturnType<typeof mock>;
} = {}): EditorCore {
	return {
		project: {
			getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
		},
		media: {
			getAssets,
			addMediaAsset,
		},
		timeline: {
			insertElement,
			getTrackById: () => null,
		},
		selection: {
			getSelectedElements: () => [],
		},
	} as unknown as EditorCore;
}

describe("animated sticker MCP tools", () => {
	test("lists built-in and uploaded motion stickers", async () => {
		const tools = buildAnimatedStickerTools({
			editor: createMockEditor(),
			deps: {
				mediaTimeFromSeconds: mockMediaTimeFromSeconds,
				loadUploadedStickers: async () => [uploadedSticker()],
			},
		});
		const tool = tools.find(
			(item) => item.name === "animated_sticker_list_presets",
		);

		const result = await tool?.handler({});

		expect(result).toMatchObject({
			builtIn: expect.arrayContaining([
				expect.objectContaining({
					id: ANIMATED_STICKER_PRESETS[0]?.id,
					source: "built-in",
				}),
			]),
			uploaded: [
				expect.objectContaining({
					id: "upload-1",
					name: "Reaction.gif",
					source: "uploaded",
				}),
			],
		});
	});

	test("inserts a built-in animated sticker as a graphic", async () => {
		const insertElement = mock(() => ({
			elementId: "graphic-1",
			trackId: "graphic-track-1",
		}));
		const tools = buildAnimatedStickerTools({
			editor: createMockEditor({ insertElement }),
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "animated_sticker_insert");
		const preset = ANIMATED_STICKER_PRESETS[0]!;

		const result = await tool?.handler({
			source: "built-in",
			stickerId: preset.id,
			startTimeSeconds: 1,
			durationSeconds: 2,
			positionX: 0.2,
			positionY: -0.1,
			scale: 0.8,
		});

		expect(result).toMatchObject({
			inserted: true,
			source: "built-in",
			stickerId: preset.id,
			elementId: "graphic-1",
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "graphic",
				definitionId: preset.definitionId,
				params: {
					"transform.positionX": 0.2,
					"transform.positionY": -0.1,
					"transform.scaleX": 0.8,
					"transform.scaleY": 0.8,
				},
				animations: {
					"params.progress": expect.any(Object),
				},
			},
			placement: { mode: "auto", trackType: "graphic" },
		});
	});

	test("inserts an uploaded GIF as hidden project media", async () => {
		const insertElement = mock(() => ({
			elementId: "gif-1",
			trackId: "video-track-1",
		}));
		const addMediaAsset = mock(async ({ asset }) => ({
			...asset,
			id: "media-1",
		}));
		const tools = buildAnimatedStickerTools({
			editor: createMockEditor({ insertElement, addMediaAsset }),
			deps: {
				mediaTimeFromSeconds: mockMediaTimeFromSeconds,
				loadUploadedStickers: async () => [uploadedSticker()],
			},
		});
		const tool = tools.find((item) => item.name === "animated_sticker_insert");

		const result = await tool?.handler({
			source: "uploaded",
			stickerId: "upload-1",
			startTimeSeconds: 1,
		});

		expect(result).toMatchObject({
			inserted: true,
			source: "uploaded",
			stickerId: "upload-1",
			mediaId: "media-1",
		});
		expect(addMediaAsset.mock.calls[0]?.[0]).toMatchObject({
			projectId: "project-1",
			asset: {
				ephemeral: true,
				externalSource: {
					provider: "shotlyx:animated-sticker-library",
					providerAssetId: "upload-1",
				},
			},
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "image",
				mediaId: "media-1",
			},
			placement: { mode: "auto", trackType: "video" },
		});
	});
});
