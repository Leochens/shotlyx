/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test only needs a narrow renderer shape for source sizing. */
import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";
import type { CanvasRenderer } from "../../canvas-renderer";
import { SHOTLYX_MG_GRAPHIC_DEFINITION_ID } from "@/shotlyx/remotion-components/project-assets";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { getGraphicNodeSourceSize } = await import("../graphic-node");

function rendererFixture({
	width,
	height,
	renderShotlyxMG,
}: {
	width: number;
	height: number;
	renderShotlyxMG: boolean;
}): CanvasRenderer {
	return {
		width,
		height,
		renderShotlyxMG,
	} as CanvasRenderer;
}

describe("graphic node source sizing", () => {
	test("keeps normal graphics at thumbnail source size", () => {
		expect(
			getGraphicNodeSourceSize({
				definitionId: "callout-arrow",
				renderer: rendererFixture({
					width: 1920,
					height: 1080,
					renderShotlyxMG: true,
				}),
			}),
		).toEqual({ width: 512, height: 512 });
	});

	test("renders Shotlyx MG at export-canvas scale", () => {
		expect(
			getGraphicNodeSourceSize({
				definitionId: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
				renderer: rendererFixture({
					width: 1920,
					height: 1080,
					renderShotlyxMG: true,
				}),
			}),
		).toEqual({ width: 1920, height: 1920 });
	});

	test("skips high-resolution Shotlyx MG sources in editor preview", () => {
		expect(
			getGraphicNodeSourceSize({
				definitionId: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
				renderer: rendererFixture({
					width: 1920,
					height: 1080,
					renderShotlyxMG: false,
				}),
			}),
		).toEqual({ width: 512, height: 512 });
	});
});
