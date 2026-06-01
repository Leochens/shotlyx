import { describe, expect, mock, test } from "bun:test";
import type { EffectElement } from "@/timeline";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { getPropertiesConfig } = await import("./registry");

describe("getPropertiesConfig", () => {
	test("exposes transform controls for standalone effects", () => {
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

		const config = getPropertiesConfig({ element, mediaAssets: [] });

		expect(config.tabs.map((tab) => tab.id)).toEqual(["effects", "transform"]);
	});
});
