/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- These controller tests use DOM-shaped fakes without jsdom. */
import { describe, expect, mock, test, beforeAll } from "bun:test";
import type { DragEvent } from "react";
import type {
	EffectTrack,
	SceneTracks,
	VideoElement,
	VideoTrack,
} from "@/timeline";
import type { TimelineDragData } from "@/timeline/drag";
import type { TimelineDragSource } from "@/timeline/drag-source";

const TICKS_PER_SECOND = 120_000;
const ZERO_MEDIA_TIME = 0;

const wasmMock = {
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * TICKS_PER_SECOND),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS_PER_SECOND,
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTicks: ({ ticks }: { ticks: number }) => Math.round(ticks),
	roundToFrame: ({ time }: { time: number }) => Math.round(time),
	snapSeekMediaTime: ({ time }: { time: number }) => Math.round(time),
	snappedSeekTime: ({ time }: { time: number }) => Math.round(time),
	parseTimecode: () => 0,
	parseMediaTimecode: () => 0,
	addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
	subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
	maxMediaTime: ({ a, b }: { a: number; b: number }) => Math.max(a, b),
	minMediaTime: ({ a, b }: { a: number; b: number }) => Math.min(a, b),
	clampMediaTime: ({
		time,
		min,
		max,
	}: {
		time: number;
		min: number;
		max: number;
	}) => Math.min(Math.max(time, min), max),
	lastFrameMediaTime: ({ duration }: { duration: number }) =>
		Math.max(0, duration - 1),
	formatTimecode: () => "00:00:00:00",
	frameRateToFloat: () => 30,
	getCompositorCanvas: () => ({}),
	getLastFrameProfile: () => null,
	initCompositor: () => {},
	releaseTexture: () => {},
	renderFrame: () => {},
	resizeCompositor: () => {},
	uploadTexture: () => {},
	applyEffectPasses: () => ({}),
	applyMaskFeather: () => ({}),
	initializeGpu: async () => {},
	detectSilenceSegments: () => [],
};

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { DragDropController } =
	await import("@/timeline/controllers/drag-drop-controller");
const { registerDefaultEffects } = await import("@/effects");

beforeAll(() => {
	registerDefaultEffects();
});

function buildVideoElement(): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Video",
		mediaId: "media-1",
		startTime: ZERO_MEDIA_TIME,
		duration: 5 * TICKS_PER_SECOND,
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function buildVideoTrack({
	elements = [buildVideoElement()],
}: {
	elements?: VideoTrack["elements"];
} = {}): VideoTrack {
	return {
		id: "main-track",
		name: "Main",
		type: "video",
		elements,
		hidden: false,
		muted: false,
	};
}

function buildEffectTrack(): EffectTrack {
	return {
		id: "effect-track",
		name: "Effect track",
		type: "effect",
		elements: [],
		hidden: false,
	};
}

function buildSceneTracks({
	overlay = [],
	main = buildVideoTrack(),
}: {
	overlay?: SceneTracks["overlay"];
	main?: VideoTrack;
} = {}): SceneTracks {
	return {
		overlay,
		main,
		audio: [],
	};
}

function buildDragEvent({
	clientX = 80,
	clientY = 10,
}: {
	clientX?: number;
	clientY?: number;
} = {}) {
	return {
		preventDefault: mock(() => {}),
		clientX,
		clientY,
		dataTransfer: {
			types: ["application/x-timeline-drag"],
			files: { length: 0 },
			dropEffect: "none",
		},
	} as unknown as DragEvent;
}

function buildController({
	tracks,
	dragData,
	addClipEffect = mock(() => {}),
	insertElement = mock(() => {}),
	seekToTime = mock(() => {}),
	selectElements = mock(() => {}),
	openElementPropertiesTab = mock(() => {}),
}: {
	tracks: SceneTracks;
	dragData: TimelineDragData;
	addClipEffect?: ReturnType<typeof mock>;
	insertElement?: ReturnType<typeof mock>;
	seekToTime?: ReturnType<typeof mock>;
	selectElements?: ReturnType<typeof mock>;
	openElementPropertiesTab?: ReturnType<typeof mock>;
}) {
	const dragSource = {
		isActive: () => true,
		getActive: () => dragData,
	};
	const trackSurface = {
		scrollLeft: 0,
		scrollTop: 0,
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
	} as unknown as HTMLDivElement;

	const controller = new DragDropController({
		configRef: {
			current: {
				zoomLevel: 1,
				getContainerEl: () => trackSurface,
				getHeaderEl: () =>
					({
						getBoundingClientRect: () => ({ height: 0 }),
					}) as unknown as HTMLElement,
				getTracksScrollEl: () => trackSurface,
				getActiveProjectFps: () => null,
				getActiveProjectId: () => "project-1",
				getSceneTracks: () => tracks,
				getCurrentPlayheadTime: () => ZERO_MEDIA_TIME,
				getMediaAssets: () => [],
				dragSource: dragSource as unknown as TimelineDragSource,
				addMediaAsset: mock(async () => null),
				executeCommand: mock(() => {}),
				insertElement,
				addClipEffect,
				seekToTime,
				selectElements,
				openElementPropertiesTab,
			},
		},
	});

	return {
		controller,
		addClipEffect,
		insertElement,
		seekToTime,
		selectElements,
		openElementPropertiesTab,
	};
}

const blurDragData: TimelineDragData = {
	id: "blur",
	name: "Blur",
	type: "effect",
	effectType: "blur",
	targetElementTypes: [
		"video",
		"image",
		"text",
		"subtitle",
		"sticker",
		"graphic",
	],
};

const mosaicDragData: TimelineDragData = {
	...blurDragData,
	id: "pixelate",
	name: "Mosaic",
	effectType: "pixelate",
};

const magnifierDragData: TimelineDragData = {
	...blurDragData,
	id: "magnify",
	name: "Magnifier",
	effectType: "magnify",
};

describe("DragDropController effect drops", () => {
	test("focuses a clip after dropping an effect onto it", () => {
		const tracks = buildSceneTracks();
		const {
			controller,
			addClipEffect,
			seekToTime,
			selectElements,
			openElementPropertiesTab,
		} = buildController({ tracks, dragData: blurDragData });

		const event = buildDragEvent();
		controller.onDragOver(event);
		controller.onDrop(event);

		expect(addClipEffect).toHaveBeenCalledWith({
			trackId: "main-track",
			elementId: "video-1",
			effectType: "blur",
		});
		expect(seekToTime).toHaveBeenCalledTimes(1);
		expect(selectElements).toHaveBeenCalledWith({
			elements: [{ trackId: "main-track", elementId: "video-1" }],
		});
		expect(openElementPropertiesTab).toHaveBeenCalledWith({
			elementType: "video",
			tabId: "effects",
		});
	});

	test("drops mosaic as a standalone effect even when hovering over a clip", () => {
		const tracks = buildSceneTracks({
			overlay: [buildEffectTrack()],
		});
		const {
			controller,
			addClipEffect,
			insertElement,
			seekToTime,
			openElementPropertiesTab,
		} = buildController({ tracks, dragData: mosaicDragData });

		const event = buildDragEvent({ clientY: 40 });
		controller.onDragOver(event);
		controller.onDrop(event);

		expect(addClipEffect).not.toHaveBeenCalled();
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			placement: { mode: "explicit", trackId: "effect-track" },
			element: {
				type: "effect",
				effectType: "pixelate",
				name: "Mosaic",
				params: {
					"transform.scaleX": 0.25,
					"transform.scaleY": 0.25,
				},
			},
		});
		expect(seekToTime).toHaveBeenCalledTimes(1);
		expect(openElementPropertiesTab).toHaveBeenCalledWith({
			elementType: "effect",
			tabId: "transform",
		});
	});

	test("focuses transform controls after dropping mosaic onto an existing effect track", () => {
		const tracks = buildSceneTracks({
			overlay: [buildEffectTrack()],
			main: buildVideoTrack({ elements: [] }),
		});
		const { controller, insertElement, seekToTime, openElementPropertiesTab } =
			buildController({ tracks, dragData: mosaicDragData });

		const event = buildDragEvent();
		controller.onDragOver(event);
		controller.onDrop(event);

		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			placement: { mode: "explicit", trackId: "effect-track" },
			element: { type: "effect", effectType: "pixelate", name: "Mosaic" },
		});
		expect(seekToTime).toHaveBeenCalledTimes(1);
		expect(openElementPropertiesTab).toHaveBeenCalledWith({
			elementType: "effect",
			tabId: "transform",
		});
	});

	test("drops magnifier as a standalone effect region with transform focus", () => {
		const tracks = buildSceneTracks({
			overlay: [buildEffectTrack()],
		});
		const {
			controller,
			addClipEffect,
			insertElement,
			openElementPropertiesTab,
		} = buildController({ tracks, dragData: magnifierDragData });

		const event = buildDragEvent({ clientY: 40 });
		controller.onDragOver(event);
		controller.onDrop(event);

		expect(addClipEffect).not.toHaveBeenCalled();
		expect(insertElement).toHaveBeenCalledTimes(1);
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			placement: { mode: "explicit", trackId: "effect-track" },
			element: {
				type: "effect",
				effectType: "magnify",
				name: "Magnifier",
				params: {
					zoom: 2,
					"transform.scaleX": 0.25,
					"transform.scaleY": 0.25,
				},
			},
		});
		expect(openElementPropertiesTab).toHaveBeenCalledWith({
			elementType: "effect",
			tabId: "transform",
		});
	});
});
