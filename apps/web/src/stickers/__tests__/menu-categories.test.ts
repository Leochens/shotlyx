import { describe, expect, mock, test } from "bun:test";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { STICKER_CATEGORIES } = await import("../categories");
const { registerDefaultStickerProviders } = await import("../providers");
const { stickersRegistry } = await import("../registry");

describe("sticker menu categories", () => {
	test("does not expose flower text as a sticker menu category", () => {
		registerDefaultStickerProviders({});

		expect(STICKER_CATEGORIES).not.toHaveProperty("flower-text");
		expect(stickersRegistry.has("flower-text")).toBe(false);
	});
});
