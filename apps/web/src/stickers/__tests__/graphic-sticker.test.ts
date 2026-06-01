import { describe, expect, test } from "bun:test";
import { flowerTextProvider } from "@/stickers/providers/flower-text";
import { getGraphicStickerPreset } from "../graphic-sticker";

describe("graphic-backed sticker presets", () => {
	test("maps flower text sticker items to editable graphic insertion data", async () => {
		const item = (await flowerTextProvider.browse({})).sections[0]?.items[0];
		expect(item).toBeDefined();

		const preset = getGraphicStickerPreset({ item: item! });

		expect(preset).toMatchObject({
			name: item!.name,
			definitionId: expect.stringContaining("flower-text-"),
			params: {
				content: expect.any(String),
				progress: 1,
			},
			animations: {
				"params.progress": expect.any(Object),
			},
		});
	});

	test("keeps existing shape stickers graphic-backed", async () => {
		const preset = getGraphicStickerPreset({
			item: {
				id: "shapes:rectangle",
				provider: "shapes",
				name: "Rectangle",
				previewUrl: "data:image/svg+xml,",
				metadata: {
					definitionId: "rectangle",
					params: {},
				},
			},
		});

		expect(preset).toMatchObject({
			name: "Rectangle",
			definitionId: "rectangle",
		});
	});
});
