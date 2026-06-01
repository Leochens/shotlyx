import { describe, expect, test } from "bun:test";
import { ANIMATED_STICKER_PRESETS } from "@/graphics/definitions/animated-stickers";
import { getGraphicStickerPreset } from "../graphic-sticker";
import {
	ANIMATED_STICKERS_PROVIDER_ID,
	animatedStickersProvider,
	parseAnimatedStickerId,
} from "../providers/animated-stickers";

describe("animated stickers provider", () => {
	test("browses built-in transparent motion stickers", async () => {
		const result = await animatedStickersProvider.browse({});
		const items = result.sections[0]?.items ?? [];

		expect(items).toHaveLength(ANIMATED_STICKER_PRESETS.length);
		expect(result.sections[0]).toMatchObject({
			id: "built-in",
			layout: "grid",
		});
		expect(items[0]).toMatchObject({
			provider: ANIMATED_STICKERS_PROVIDER_ID,
			metadata: {
				definitionId: ANIMATED_STICKER_PRESETS[0]?.definitionId,
			},
		});
		expect(items[0]?.metadata.params).toMatchObject({
			progress: 1,
		});
	});

	test("searches motion keywords and Chinese aliases", async () => {
		const keywordResult = await animatedStickersProvider.search({
			query: "bounce",
			options: { limit: 20 },
		});
		const aliasResult = await animatedStickersProvider.search({
			query: "透明",
			options: { limit: 20 },
		});

		expect(keywordResult.items.some((item) => item.id.includes("bounce"))).toBe(
			true,
		);
		expect(aliasResult.items.length).toBeGreaterThan(0);
	});

	test("maps built-in animated stickers to graphic insertion data", async () => {
		const item = (await animatedStickersProvider.browse({})).sections[0]
			?.items[0];
		expect(item).toBeDefined();

		const parsed = parseAnimatedStickerId({ stickerId: item!.id });
		const preset = getGraphicStickerPreset({ item: item! });

		expect(parsed?.id).toBe(ANIMATED_STICKER_PRESETS[0]?.id);
		expect(preset).toMatchObject({
			name: item!.name,
			definitionId: expect.stringContaining("animated-sticker-"),
			params: {
				progress: 1,
			},
			animations: {
				"params.progress": expect.any(Object),
			},
		});
	});
});
