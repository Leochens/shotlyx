import { describe, expect, test } from "bun:test";
import { createCanvas } from "@napi-rs/canvas";
import type { MediaTime } from "@/wasm";
import {
	ANIMATED_STICKER_PRESETS,
	animatedStickerGraphicDefinitions,
	buildAnimatedStickerProgressAnimation,
} from "../animated-stickers";

describe("animated sticker graphic definitions", () => {
	test("provide transparent motion sticker presets", () => {
		expect(ANIMATED_STICKER_PRESETS.length).toBeGreaterThanOrEqual(6);
		expect(animatedStickerGraphicDefinitions).toHaveLength(
			ANIMATED_STICKER_PRESETS.length,
		);

		for (const preset of ANIMATED_STICKER_PRESETS) {
			const definition = animatedStickerGraphicDefinitions.find(
				(item) => item.id === preset.definitionId,
			);
			expect(definition).toBeDefined();
			expect(definition?.category).toBe("animated-sticker");
			expect(definition?.params.map((param) => param.key)).toEqual(
				expect.arrayContaining(["progress", "primaryColor", "accentColor"]),
			);
		}
	});

	test("render at tiny timeline thumbnail size without throwing", () => {
		for (const definition of animatedStickerGraphicDefinitions) {
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

	test("builds a looping progress animation channel", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test constructs branded MediaTime from known integer ticks.
		const duration = 360_000 as unknown as MediaTime;
		const animations = buildAnimatedStickerProgressAnimation({ duration });

		expect(animations["params.progress"]).toMatchObject({
			keys: [
				{ value: 0, segmentToNext: "linear" },
				{ value: 1, segmentToNext: "linear" },
			],
			extrapolation: {
				before: "hold",
				after: "hold",
			},
		});
	});
});
