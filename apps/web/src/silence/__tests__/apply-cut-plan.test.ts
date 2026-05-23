import { describe, expect, mock, test } from "bun:test";

import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement, VideoTrack } from "@/timeline";

mock.module("@/wasm", () => ({
	ZERO_MEDIA_TIME: 0,
	TICKS_PER_SECOND: 120000,
	mediaTime: ({ ticks }: { ticks: number }) => ticks,
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * 120000),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / 120000,
	addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
	subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTime: ({ time }: { time: number }) => time,
	roundFrameTicks: ({ ticks }: { ticks: number }) => ticks,
	snapSeekMediaTime: ({ time }: { time: number }) => time,
	lastFrameMediaTime: ({ duration }: { duration: number }) => duration,
}));

const { buildSilenceCutTracks } = await import("@/silence/apply-cut-plan");

function mt(value: number): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as MediaTime;
}

function videoElement({
	id,
	startTime,
	duration,
	trimStart = 0,
	trimEnd = 0,
	retime,
}: {
	id: string;
	startTime: number;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
	retime?: VideoElement["retime"];
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: `${id}-media`,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(trimStart),
		trimEnd: mt(trimEnd),
		params: {},
		retime,
	};
}

function sceneWithMain(elements: VideoElement[]): SceneTracks {
	return {
		overlay: [],
		audio: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		} satisfies VideoTrack,
	};
}

describe("buildSilenceCutTracks", () => {
	test("cuts silence out of a selected clip and shifts later clips on the same track", () => {
		const tracks = sceneWithMain([
			videoElement({ id: "clip-a", startTime: 0, duration: 1000 }),
			videoElement({ id: "clip-b", startTime: 1200, duration: 200 }),
		]);

		const result = buildSilenceCutTracks({
			tracks,
			targets: [
				{
					trackId: "main",
					elementId: "clip-a",
					ranges: [{ startTime: mt(300), endTime: mt(500) }],
				},
			],
		});

		expect(result.main.elements).toHaveLength(3);
		expect(result.main.elements[0]).toMatchObject({
			id: "clip-a",
			startTime: mt(0),
			duration: mt(300),
			trimStart: mt(0),
			trimEnd: mt(700),
		});
		expect(result.main.elements[1]).toMatchObject({
			startTime: mt(300),
			duration: mt(500),
			trimStart: mt(500),
			trimEnd: mt(0),
		});
		expect(result.main.elements[1]?.id).not.toBe("clip-a");
		expect(result.main.elements[2]).toMatchObject({
			id: "clip-b",
			startTime: mt(1000),
			duration: mt(200),
		});
	});

	test("ignores ranges that do not overlap the target element", () => {
		const tracks = sceneWithMain([
			videoElement({ id: "clip-a", startTime: 100, duration: 400 }),
		]);

		const result = buildSilenceCutTracks({
			tracks,
			targets: [
				{
					trackId: "main",
					elementId: "clip-a",
					ranges: [{ startTime: mt(600), endTime: mt(700) }],
				},
			],
		});

		expect(result).toEqual(tracks);
	});

	test("merges adjacent cut ranges before shifting later material", () => {
		const tracks = sceneWithMain([
			videoElement({ id: "clip-a", startTime: 0, duration: 1000 }),
			videoElement({ id: "clip-b", startTime: 1000, duration: 200 }),
		]);

		const result = buildSilenceCutTracks({
			tracks,
			targets: [
				{
					trackId: "main",
					elementId: "clip-a",
					ranges: [
						{ startTime: mt(200), endTime: mt(300) },
						{ startTime: mt(300), endTime: mt(450) },
					],
				},
			],
		});

		expect(result.main.elements).toHaveLength(3);
		expect(result.main.elements[0]).toMatchObject({
			startTime: mt(0),
			duration: mt(200),
		});
		expect(result.main.elements[1]).toMatchObject({
			startTime: mt(200),
			duration: mt(550),
			trimStart: mt(450),
		});
		expect(result.main.elements[2]).toMatchObject({
			id: "clip-b",
			startTime: mt(750),
		});
	});

	test("keeps retimed source trim math aligned with visible clip time", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "clip-a",
				startTime: 0,
				duration: 1000,
				retime: { rate: 2 },
			}),
		]);

		const result = buildSilenceCutTracks({
			tracks,
			targets: [
				{
					trackId: "main",
					elementId: "clip-a",
					ranges: [{ startTime: mt(200), endTime: mt(400) }],
				},
			],
		});

		expect(result.main.elements[0]).toMatchObject({
			duration: mt(200),
			trimStart: mt(0),
			trimEnd: mt(1600),
		});
		expect(result.main.elements[1]).toMatchObject({
			startTime: mt(200),
			duration: mt(600),
			trimStart: mt(800),
			trimEnd: mt(0),
		});
	});
});
