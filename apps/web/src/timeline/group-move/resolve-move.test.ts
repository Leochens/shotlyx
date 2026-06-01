import { describe, expect, mock, test } from "bun:test";
import type { SceneTracks, VideoElement } from "@/timeline";

const TICKS_PER_SECOND = 120_000;
const wasmMock = {
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME: 0,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * TICKS_PER_SECOND),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS_PER_SECOND,
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
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTicks: ({ ticks }: { ticks: number }) => Math.round(ticks),
	roundToFrame: ({ time }: { time: number }) => Math.round(time),
	snapSeekMediaTime: ({ time }: { time: number }) => Math.round(time),
	snappedSeekTime: ({ time }: { time: number }) => Math.round(time),
	lastFrameMediaTime: ({ duration }: { duration: number }) =>
		Math.max(0, duration - 1),
	formatTimecode: () => "00:00:00:00",
	parseTimecode: () => 0,
	parseMediaTimecode: () => 0,
	frameRateToFloat: () => 30,
};

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { buildMoveGroup, resolveGroupMove } = await import("./index");

function seconds(value: number): number {
	return value * TICKS_PER_SECOND;
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
		trimStart: 0,
		trimEnd: 0,
		sourceDuration: seconds(duration),
		params: {},
	};
}

function buildTracks(): SceneTracks {
	return {
		overlay: [
			{
				id: "overlay-video",
				type: "video",
				name: "Overlay video",
				hidden: false,
				muted: false,
				elements: [],
			},
		],
		main: {
			id: "main",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements: [
				videoElement({ id: "a", start: 0 }),
				videoElement({ id: "b", start: 20 }),
				videoElement({ id: "c", start: 30 }),
			],
		},
		audio: [],
	};
}

describe("resolveGroupMove", () => {
	test("moves only the selected main-track clip when ripple editing is off", () => {
		const tracks = buildTracks();
		const group = buildMoveGroup({
			anchorRef: { trackId: "main", elementId: "b" },
			selectedElements: [{ trackId: "main", elementId: "b" }],
			tracks,
		});

		expect(group).not.toBeNull();
		if (!group) throw new Error("expected a move group");

		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(10),
			target: { kind: "existingTrack", anchorTargetTrackId: "main" },
		});

		expect(result?.moves).toMatchObject([
			{ elementId: "b", newStartTime: seconds(10) },
		]);
	});

	test("includes later main-track clips when ripple editing moves a main clip earlier", () => {
		const tracks = buildTracks();
		const group = buildMoveGroup({
			anchorRef: { trackId: "main", elementId: "b" },
			selectedElements: [{ trackId: "main", elementId: "b" }],
			tracks,
		});

		expect(group).not.toBeNull();
		if (!group) throw new Error("expected a move group");

		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(10),
			target: { kind: "existingTrack", anchorTargetTrackId: "main" },
			rippleEditingEnabled: true,
		});

		expect(result?.moves).toMatchObject([
			{ elementId: "b", newStartTime: seconds(10) },
			{ elementId: "c", newStartTime: seconds(20) },
		]);
		expect(result?.targetSelection).toEqual([
			{ trackId: "main", elementId: "b" },
		]);
	});

	test("keeps same-track selected clips together when moving to an existing track", () => {
		const tracks = buildTracks();
		const group = buildMoveGroup({
			anchorRef: { trackId: "main", elementId: "b" },
			selectedElements: [
				{ trackId: "main", elementId: "b" },
				{ trackId: "main", elementId: "c" },
			],
			tracks,
		});

		expect(group).not.toBeNull();
		if (!group) throw new Error("expected a move group");

		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(50),
			target: {
				kind: "existingTrack",
				anchorTargetTrackId: "overlay-video",
			},
		});

		expect(result?.moves).toMatchObject([
			{
				elementId: "b",
				targetTrackId: "overlay-video",
				newStartTime: seconds(50),
			},
			{
				elementId: "c",
				targetTrackId: "overlay-video",
				newStartTime: seconds(60),
			},
		]);
	});

	test("creates one new track for same-track selected clips", () => {
		const tracks = buildTracks();
		const group = buildMoveGroup({
			anchorRef: { trackId: "main", elementId: "b" },
			selectedElements: [
				{ trackId: "main", elementId: "b" },
				{ trackId: "main", elementId: "c" },
			],
			tracks,
		});

		expect(group).not.toBeNull();
		if (!group) throw new Error("expected a move group");

		const result = resolveGroupMove({
			group,
			tracks,
			anchorStartTime: seconds(50),
			target: {
				kind: "newTracks",
				anchorInsertIndex: 0,
				newTrackIds: ["new-video-1", "new-video-2"],
			},
		});

		expect(result?.createTracks).toEqual([
			{ id: "new-video-1", type: "video", index: 0 },
		]);
		expect(result?.moves).toMatchObject([
			{
				elementId: "b",
				targetTrackId: "new-video-1",
				newStartTime: seconds(50),
			},
			{
				elementId: "c",
				targetTrackId: "new-video-1",
				newStartTime: seconds(60),
			},
		]);
	});
});
