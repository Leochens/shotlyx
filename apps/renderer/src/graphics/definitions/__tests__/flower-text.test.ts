import { describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import type { MediaTime } from "@/wasm";
import {
	FLOWER_TEXT_PRESETS,
	buildFlowerTextProgressAnimation,
	flowerTextGraphicDefinitions,
} from "../flower-text";

describe("flower text graphic definitions", () => {
	test("provide a useful editable preset library", () => {
		expect(FLOWER_TEXT_PRESETS.length).toBeGreaterThanOrEqual(6);
		expect(flowerTextGraphicDefinitions).toHaveLength(
			FLOWER_TEXT_PRESETS.length,
		);

		for (const preset of FLOWER_TEXT_PRESETS) {
			const definition = flowerTextGraphicDefinitions.find(
				(item) => item.id === preset.definitionId,
			);
			expect(definition).toBeDefined();
			expect(definition?.category).toBe("flower-text");
			expect(definition?.params.map((param) => param.key)).toEqual(
				expect.arrayContaining([
					"content",
					"fontFamily",
					"fontSize",
					"textColor",
					"strokeColor",
					"strokeWidth",
					"accentColor",
					"progress",
				]),
			);
		}
	});

	test("render at tiny timeline thumbnail size without throwing", () => {
		for (const definition of flowerTextGraphicDefinitions) {
			const canvas = createCanvas(20, 20);
			const ctx = canvas.getContext("2d");

			expect(() =>
				definition.render({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
					ctx: ctx as unknown as CanvasRenderingContext2D,
					params: Object.fromEntries(
						definition.params.map((param) => [param.key, param.default]),
					),
					width: 20,
					height: 20,
				}),
			).not.toThrow();
		}
	});

	test("builds a progress animation channel for light motion", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test constructs branded MediaTime from known integer ticks.
		const duration = 600_000 as unknown as MediaTime;
		const animations = buildFlowerTextProgressAnimation({ duration });

		expect(animations["params.progress"]).toMatchObject({
			keys: [
				{ value: 0, segmentToNext: "bezier" },
				{ value: 1, segmentToNext: "linear" },
			],
			extrapolation: {
				before: "hold",
				after: "hold",
			},
		});
	});
});
