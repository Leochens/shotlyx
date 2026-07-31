import { describe, expect, mock, test } from "bun:test";

import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type {
	SceneTracks,
	SubtitleElement,
	TextElement,
	TextTrack,
	VideoElement,
	VideoTrack,
} from "@/timeline";

mock.module("@/wasm", () => wasmMock);

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

function subtitleElement({
	id,
	startTime,
	duration,
	trimStart = 0,
	trimEnd = 0,
}: {
	id: string;
	startTime: number;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
}): SubtitleElement {
	return {
		id,
		type: "subtitle",
		name: id,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(trimStart),
		trimEnd: mt(trimEnd),
		params: { "subtitle.groupId": "group-1" },
		cues: [
			{ id: `${id}-cue-a`, text: "before", startTime: 0, duration: 0.2 },
			{ id: `${id}-cue-b`, text: "after", startTime: 0.55, duration: 0.2 },
		],
	};
}

function textElement({
	id,
	startTime,
	duration,
	isSubtitle = false,
}: {
	id: string;
	startTime: number;
	duration: number;
	isSubtitle?: boolean;
}): TextElement {
	return {
		id,
		type: "text",
		name: id,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(0),
		trimEnd: mt(0),
		params: isSubtitle
			? { text: id, "subtitle.groupId": "group-1" }
			: { text: id },
	};
}

function textTrack(elements: TextTrack["elements"]): TextTrack {
	return {
		id: "subtitles",
		name: "Subtitles",
		type: "text",
		hidden: false,
		elements,
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

	test("cuts subtitle layers with the same timeline ranges as the silenced video clip", () => {
		const tracks = {
			...sceneWithMain([
				videoElement({ id: "clip-a", startTime: 0, duration: 1000 }),
			]),
			overlay: [
				textTrack([
					subtitleElement({
						id: "subtitle-layer",
						startTime: 0,
						duration: 1000,
					}),
				]),
			],
		} satisfies SceneTracks;

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

		const subtitleElements = result.overlay[0]?.elements ?? [];
		expect(subtitleElements).toHaveLength(2);
		expect(subtitleElements[0]).toMatchObject({
			id: "subtitle-layer",
			type: "subtitle",
			startTime: mt(0),
			duration: mt(300),
			trimStart: mt(0),
			trimEnd: mt(700),
		});
		expect(subtitleElements[1]).toMatchObject({
			type: "subtitle",
			startTime: mt(300),
			duration: mt(500),
			trimStart: mt(500),
			trimEnd: mt(0),
		});
		expect(subtitleElements[1]?.id).not.toBe("subtitle-layer");
	});

	test("shifts later overlay text after removed silence", () => {
		const tracks = {
			...sceneWithMain([
				videoElement({ id: "clip-a", startTime: 0, duration: 1000 }),
			]),
			overlay: [
				textTrack([
					textElement({
						id: "later-subtitle",
						startTime: 1200,
						duration: 200,
						isSubtitle: true,
					}),
					textElement({
						id: "title-card",
						startTime: 1200,
						duration: 200,
					}),
				]),
			],
		} satisfies SceneTracks;

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

		const [laterSubtitle, titleCard] = result.overlay[0]?.elements ?? [];
		expect(laterSubtitle).toMatchObject({
			id: "later-subtitle",
			startTime: mt(1000),
			duration: mt(200),
		});
		expect(titleCard).toMatchObject({
			id: "title-card",
			startTime: mt(1000),
			duration: mt(200),
		});
	});

	test("compacts ordinary overlay elements across removed timeline ranges", () => {
		const tracks = {
			...sceneWithMain([
				videoElement({ id: "clip-a", startTime: 0, duration: 1000 }),
			]),
			overlay: [
				textTrack([
					textElement({
						id: "title-card",
						startTime: 250,
						duration: 350,
					}),
					textElement({
						id: "lower-third",
						startTime: 1200,
						duration: 200,
					}),
				]),
			],
		} satisfies SceneTracks;

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

		const overlayElements = result.overlay[0]?.elements ?? [];
		expect(overlayElements).toHaveLength(3);
		expect(overlayElements[0]).toMatchObject({
			id: "title-card",
			startTime: mt(250),
			duration: mt(50),
		});
		expect(overlayElements[1]).toMatchObject({
			startTime: mt(300),
			duration: mt(100),
		});
		expect(overlayElements[1]?.id).not.toBe("title-card");
		expect(overlayElements[2]).toMatchObject({
			id: "lower-third",
			startTime: mt(1000),
			duration: mt(200),
		});
	});
});
