import { describe, expect, mock, test } from "bun:test";
import type { EffectElement } from "@/timeline";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { canShowTransformHandlesForElement } = await import("./transform-handles");

describe("TransformHandles", () => {
	test("allows standalone effect regions to show transform handles", () => {
		const element: EffectElement = {
			id: "mosaic-1",
			type: "effect",
			name: "Mosaic",
			effectType: "pixelate",
			startTime: 0,
			duration: 120_000,
			trimStart: 0,
			trimEnd: 0,
			params: {},
		};

		expect(canShowTransformHandlesForElement({ element })).toBe(true);
	});
});
