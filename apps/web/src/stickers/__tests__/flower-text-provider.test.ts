import { describe, expect, test } from "bun:test";
import { FLOWER_TEXT_PRESETS } from "@/graphics/definitions/flower-text";
import {
	flowerTextProvider,
	parseFlowerTextStickerId,
} from "../providers/flower-text";

describe("flower text sticker provider", () => {
	test("browses flower text presets as graphic-backed stickers", async () => {
		const result = await flowerTextProvider.browse({});
		const items = result.sections[0]?.items ?? [];

		expect(items).toHaveLength(FLOWER_TEXT_PRESETS.length);
		expect(result.sections[0]).toMatchObject({
			id: "all",
			layout: "grid",
		});
		expect(items[0]).toMatchObject({
			provider: "flower-text",
			metadata: {
				definitionId: FLOWER_TEXT_PRESETS[0]?.definitionId,
			},
		});
		expect(items[0]?.metadata.params).toMatchObject({
			content: FLOWER_TEXT_PRESETS[0]?.defaultText,
		});
	});

	test("searches English keywords and Chinese aliases", async () => {
		const keywordResult = await flowerTextProvider.search({
			query: "price",
			options: { limit: 20 },
		});
		const aliasResult = await flowerTextProvider.search({
			query: "强调",
			options: { limit: 20 },
		});

		expect(keywordResult.items.some((item) => item.id.includes("price"))).toBe(
			true,
		);
		expect(aliasResult.items.some((item) => item.id.includes("emphasis"))).toBe(
			true,
		);
	});

	test("parses provider IDs back to preset data", async () => {
		const item = (await flowerTextProvider.browse({})).sections[0]?.items[0];
		expect(item).toBeDefined();

		const preset = parseFlowerTextStickerId({ stickerId: item!.id });

		expect(preset?.id).toBe(FLOWER_TEXT_PRESETS[0]?.id);
		expect(preset?.definitionId).toBe(FLOWER_TEXT_PRESETS[0]?.definitionId);
	});
});
