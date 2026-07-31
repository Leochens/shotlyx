import { describe, expect, mock, test } from "bun:test";
import type { SceneTracks } from "@/timeline";

const TICKS_PER_SECOND = 120_000;

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { getVisibleElementsWithBounds } = await import("./element-bounds");

function buildTracks(): SceneTracks {
	return {
		overlay: [
			{
				id: "effect-track",
				name: "Effect",
				type: "effect",
				hidden: false,
				elements: [
					{
						id: "mosaic-1",
						type: "effect",
						name: "Mosaic",
						effectType: "pixelate",
						startTime: 0,
						duration: 5 * TICKS_PER_SECOND,
						trimStart: 0,
						trimEnd: 0,
						params: {
							blockSize: 32,
							"transform.positionX": 120,
							"transform.positionY": -40,
							"transform.scaleX": 0.25,
							"transform.scaleY": 0.2,
							"transform.rotate": 0,
						},
					},
				],
			},
		],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			hidden: false,
			muted: false,
			elements: [],
		},
		audio: [],
	};
}

describe("getVisibleElementsWithBounds", () => {
	test("includes standalone effect elements as transformable preview regions", () => {
		const bounds = getVisibleElementsWithBounds({
			tracks: buildTracks(),
			currentTime: TICKS_PER_SECOND,
			canvasSize: { width: 1920, height: 1080 },
			mediaAssets: [],
		});

		expect(bounds).toHaveLength(1);
		expect(bounds[0]).toMatchObject({
			trackId: "effect-track",
			elementId: "mosaic-1",
			bounds: {
				cx: 1080,
				cy: 500,
				width: 480,
				height: 216,
				rotation: 0,
			},
		});
	});

	test("expands fullscreen magnifier preview bounds to the whole canvas", () => {
		const tracks = buildTracks();
		tracks.overlay[0].elements[0] = {
			...tracks.overlay[0].elements[0],
			id: "magnifier-1",
			name: "Magnifier",
			effectType: "magnify",
			params: {
				zoom: 2,
				shape: "circle",
				fullscreen: true,
				"transform.positionX": 120,
				"transform.positionY": -40,
				"transform.scaleX": 0.25,
				"transform.scaleY": 0.2,
				"transform.rotate": 0,
			},
		};

		const bounds = getVisibleElementsWithBounds({
			tracks,
			currentTime: TICKS_PER_SECOND,
			canvasSize: { width: 1920, height: 1080 },
			mediaAssets: [],
		});

		expect(bounds[0]).toMatchObject({
			elementId: "magnifier-1",
			bounds: {
				cx: 960,
				cy: 540,
				width: 1920,
				height: 1080,
				rotation: 0,
			},
		});
	});
});
