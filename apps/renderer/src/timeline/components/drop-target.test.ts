import { describe, expect, mock, test } from "bun:test";
import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement, VideoTrack } from "@/timeline";

const TICKS_PER_SECOND = 120_000;
const ZERO_MEDIA_TIME_TICKS = 0;

mock.module("@/wasm", () => ({
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME: ZERO_MEDIA_TIME_TICKS,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
}));

const { computeDropTarget } = await import("./drop-target");
const { mediaTime, ZERO_MEDIA_TIME } = await import("@/wasm");

function seconds(value: number): MediaTime {
	return mediaTime({ ticks: value * TICKS_PER_SECOND });
}

function videoElement({
	id,
	start,
	duration = 10,
}: {
	id: string;
	start: number;
	duration?: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: `${id}-media`,
		startTime: seconds(start),
		duration: seconds(duration),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		sourceDuration: seconds(duration),
		params: {},
	};
}

function sceneWithMain(elements: VideoElement[]): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements,
		} satisfies VideoTrack,
		audio: [],
	};
}

describe("computeDropTarget", () => {
	test("can target an occupied compatible track for ripple insertion", () => {
		const dropTarget = computeDropTarget({
			elementType: "video",
			mouseX: 20,
			mouseY: 0,
			tracks: sceneWithMain([videoElement({ id: "next", start: 20 })]),
			playheadTime: ZERO_MEDIA_TIME,
			isExternalDrop: false,
			elementDuration: seconds(10),
			pixelsPerSecond: 1,
			zoomLevel: 1 / TICKS_PER_SECOND,
			startTimeOverride: seconds(20),
			allowOccupiedExistingTrack: true,
		});

		expect(dropTarget).toMatchObject({
			trackIndex: 0,
			isNewTrack: false,
			xPosition: seconds(20),
		});
	});

	test("does not target the interior of an occupied clip for ripple insertion", () => {
		const dropTarget = computeDropTarget({
			elementType: "video",
			mouseX: 25,
			mouseY: 0,
			tracks: sceneWithMain([videoElement({ id: "next", start: 20 })]),
			playheadTime: ZERO_MEDIA_TIME,
			isExternalDrop: false,
			elementDuration: seconds(10),
			pixelsPerSecond: 1,
			zoomLevel: 1 / TICKS_PER_SECOND,
			startTimeOverride: seconds(25),
			allowOccupiedExistingTrack: true,
		});

		expect(dropTarget).toMatchObject({
			trackIndex: 0,
			isNewTrack: true,
		});
	});
});
