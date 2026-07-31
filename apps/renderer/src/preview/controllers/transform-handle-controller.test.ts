/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Controller tests use minimal pointer/DOM doubles instead of real React pointer events. */
import { describe, expect, mock, test } from "bun:test";
import type { EffectElement, SceneTracks } from "@/timeline";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { TransformHandleController } = await import(
	"./transform-handle-controller"
);

const TICKS_PER_SECOND = 120_000;

function buildElement(): EffectElement {
	return {
		id: "magnifier-1",
		type: "effect",
		name: "Magnifier",
		effectType: "magnify",
		startTime: 0,
		duration: 5 * TICKS_PER_SECOND,
		trimStart: 0,
		trimEnd: 0,
		params: {
			zoom: 2,
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 0.25,
			"transform.scaleY": 0.2,
			"transform.rotate": 0,
		},
	};
}

function buildTracks({ element }: { element: EffectElement }): SceneTracks {
	return {
		overlay: [
			{
				id: "effect-track",
				name: "Effect",
				type: "effect",
				hidden: false,
				elements: [element],
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

function buildPointerTarget(): HTMLElement {
	return {
		setPointerCapture: mock(),
		hasPointerCapture: () => true,
		releasePointerCapture: mock(),
	} as unknown as HTMLElement;
}

function buildPointerEvent({
	clientX,
	clientY,
}: {
	clientX: number;
	clientY: number;
}) {
	return {
		clientX,
		clientY,
		pointerId: 1,
		stopPropagation: mock(),
		currentTarget: buildPointerTarget(),
	};
}

function buildController() {
	const element = buildElement();
	const previewElements = mock();
	const controller = new TransformHandleController({
		depsRef: {
			current: {
				viewport: {
					screenToCanvas: ({ clientX, clientY }) => ({
						x: clientX,
						y: clientY,
					}),
					screenPixelsToLogicalThreshold: () => ({ x: 0, y: 0 }),
				},
				input: {
					isShiftHeld: () => true,
				},
				scene: {
					getSelectedElements: () => [
						{ trackId: "effect-track", elementId: "magnifier-1" },
					],
					getTracks: () => buildTracks({ element }),
					getCurrentTime: () => TICKS_PER_SECOND,
					getMediaAssets: () => [],
					getCanvasSize: () => ({ width: 1000, height: 1000 }),
				},
				timeline: {
					previewElements,
					commitPreview: mock(),
					discardPreview: mock(),
				},
				preview: {},
			},
		},
	});

	return { controller, previewElements };
}

function getPreviewParams(previewElements: ReturnType<typeof mock>) {
	const updateBatch = previewElements.mock.calls.at(-1)?.[0];
	expect(updateBatch).toHaveLength(1);
	return updateBatch?.[0]?.updates.params ?? {};
}

describe("TransformHandleController edge handles", () => {
	test("keeps the right edge fixed when dragging the left edge", () => {
		const { controller, previewElements } = buildController();

		controller.onEdgePointerDown({
			edge: "left",
			event: buildPointerEvent({ clientX: 375, clientY: 500 }) as never,
		});
		controller.onPointerMove({
			event: buildPointerEvent({ clientX: 425, clientY: 500 }) as never,
		});

		const params = getPreviewParams(previewElements);
		expect(params["transform.scaleX"]).toBeCloseTo(0.2);
		expect(params["transform.positionX"]).toBeCloseTo(25);
		expect(params["transform.scaleY"]).toBeCloseTo(0.2);
	});

	test("keeps the bottom edge fixed when dragging the top edge", () => {
		const { controller, previewElements } = buildController();

		controller.onEdgePointerDown({
			edge: "top",
			event: buildPointerEvent({ clientX: 500, clientY: 400 }) as never,
		});
		controller.onPointerMove({
			event: buildPointerEvent({ clientX: 500, clientY: 450 }) as never,
		});

		const params = getPreviewParams(previewElements);
		expect(params["transform.scaleY"]).toBeCloseTo(0.15);
		expect(params["transform.positionY"]).toBeCloseTo(25);
		expect(params["transform.scaleX"]).toBeCloseTo(0.25);
	});
});
