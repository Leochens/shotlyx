import { describe, expect, mock, test } from "bun:test";
import type { MediaTime } from "@/wasm/media-time";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { FLOWER_TEXT_PRESETS } =
	await import("@/graphics/definitions/flower-text");
const { buildFlowerTextMenuGraphicElement, getFlowerTextMenuItems } =
	await import("../flower-text-assets");

describe("flower text assets in the text menu", () => {
	test("lists all flower text presets for the text menu", () => {
		const items = getFlowerTextMenuItems({ query: "" });

		expect(items).toHaveLength(FLOWER_TEXT_PRESETS.length);
		expect(items[0]).toMatchObject({
			id: FLOWER_TEXT_PRESETS[0]?.id,
			name: FLOWER_TEXT_PRESETS[0]?.name,
			definitionId: FLOWER_TEXT_PRESETS[0]?.definitionId,
		});
		expect(items[0]?.params).toMatchObject({
			content: FLOWER_TEXT_PRESETS[0]?.defaultText,
		});
		expect(items[0]?.previewUrl).toStartWith("data:image/svg+xml");
	});

	test("searches flower text presets by English keywords and Chinese aliases", () => {
		const keywordItems = getFlowerTextMenuItems({ query: "price" });
		const aliasItems = getFlowerTextMenuItems({ query: "强调" });

		expect(keywordItems.some((item) => item.id === "price-tag")).toBe(true);
		expect(aliasItems.some((item) => item.id === "emphasis-pop")).toBe(true);
	});

	test("builds editable graphic elements for flower text menu items", () => {
		const item = getFlowerTextMenuItems({ query: "price" })[0];
		expect(item).toBeDefined();

		const element = buildFlowerTextMenuGraphicElement({
			item: item!,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test constructs a branded MediaTime from zero ticks.
			startTime: 0 as unknown as MediaTime,
		});

		expect(element).toMatchObject({
			type: "graphic",
			name: item?.name,
			definitionId: item?.definitionId,
			params: {
				content: item?.params.content,
			},
		});
		expect(element.animations?.["params.progress"]).toBeDefined();
	});
});
