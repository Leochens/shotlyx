import { describe, expect, mock, test } from "bun:test";

import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement, VideoTrack } from "@/timeline";

mock.module("@/wasm", () => wasmMock);

const { buildCompoundElementsPlan, buildMergeElementsPlan } =
	await import("@/timeline/merge-elements");

function mt(value: number): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as MediaTime;
}

function videoElement({
	id,
	name = id,
	mediaId = "media-1",
	startTime,
	duration,
	trimStart,
	trimEnd,
}: {
	id: string;
	name?: string;
	mediaId?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name,
		mediaId,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(trimStart),
		trimEnd: mt(trimEnd),
		sourceDuration: mt(1000),
		params: {},
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

describe("buildMergeElementsPlan", () => {
	test("merges adjacent selected split clips from the same source span", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "clip-left",
				name: "Interview (left)",
				startTime: 0,
				duration: 400,
				trimStart: 100,
				trimEnd: 500,
			}),
			videoElement({
				id: "clip-right",
				name: "Interview (right)",
				startTime: 400,
				duration: 300,
				trimStart: 500,
				trimEnd: 200,
			}),
		]);

		const plan = buildMergeElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "clip-right" },
				{ trackId: "main", elementId: "clip-left" },
			],
		});

		expect(plan?.mergedElement).toMatchObject({
			id: "clip-left",
			name: "Interview",
			startTime: mt(0),
			duration: mt(700),
			trimStart: mt(100),
			trimEnd: mt(200),
		});
		expect(plan?.removedElementIds).toEqual(["clip-right"]);
	});

	test("merges three adjacent split clips from one source span", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "clip-left",
				name: "Interview (left)",
				startTime: 0,
				duration: 300,
				trimStart: 100,
				trimEnd: 600,
			}),
			videoElement({
				id: "clip-middle",
				name: "Interview (right) (left)",
				startTime: 300,
				duration: 300,
				trimStart: 400,
				trimEnd: 300,
			}),
			videoElement({
				id: "clip-right",
				name: "Interview (right) (right)",
				startTime: 600,
				duration: 300,
				trimStart: 700,
				trimEnd: 0,
			}),
		]);

		const plan = buildMergeElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "clip-right" },
				{ trackId: "main", elementId: "clip-left" },
				{ trackId: "main", elementId: "clip-middle" },
			],
		});

		expect(plan?.mergedElement).toMatchObject({
			id: "clip-left",
			name: "Interview",
			startTime: mt(0),
			duration: mt(900),
			trimStart: mt(100),
			trimEnd: mt(0),
		});
		expect(plan?.removedElementIds).toEqual(["clip-middle", "clip-right"]);
	});

	test("refuses to merge timeline-adjacent clips when their source spans skip removed material", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "before-silence",
				startTime: 0,
				duration: 300,
				trimStart: 0,
				trimEnd: 700,
			}),
			videoElement({
				id: "after-silence",
				startTime: 300,
				duration: 500,
				trimStart: 500,
				trimEnd: 0,
			}),
		]);

		const plan = buildMergeElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "before-silence" },
				{ trackId: "main", elementId: "after-silence" },
			],
		});

		expect(plan).toBeNull();
	});

	test("builds a compound clip plan for adjacent clips from different media", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "first",
				name: "First",
				mediaId: "media-1",
				startTime: 100,
				duration: 300,
				trimStart: 10,
				trimEnd: 690,
			}),
			videoElement({
				id: "second",
				name: "Second",
				mediaId: "media-2",
				startTime: 400,
				duration: 200,
				trimStart: 20,
				trimEnd: 780,
			}),
		]);

		const plan = buildCompoundElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "second" },
				{ trackId: "main", elementId: "first" },
			],
		});

		expect(plan?.mergedElement).toMatchObject({
			id: "first",
			name: "Compound clip",
			startTime: mt(100),
			duration: mt(500),
			trimStart: mt(0),
			trimEnd: mt(0),
		});
		expect(plan?.mergedElement.compound?.elements).toMatchObject([
			{
				id: "first",
				mediaId: "media-1",
				startTime: mt(0),
				duration: mt(300),
			},
			{
				id: "second",
				mediaId: "media-2",
				startTime: mt(300),
				duration: mt(200),
			},
		]);
		expect(plan?.removedElementIds).toEqual(["second"]);
	});

	test("builds a compound clip plan that preserves gaps between consecutive clips", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "first",
				mediaId: "media-1",
				startTime: 100,
				duration: 200,
				trimStart: 0,
				trimEnd: 800,
			}),
			videoElement({
				id: "second",
				mediaId: "media-2",
				startTime: 400,
				duration: 200,
				trimStart: 0,
				trimEnd: 800,
			}),
		]);

		const plan = buildCompoundElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "first" },
				{ trackId: "main", elementId: "second" },
			],
		});

		expect(plan?.mergedElement).toMatchObject({
			startTime: mt(100),
			duration: mt(500),
		});
		expect(plan?.mergedElement.compound?.elements).toMatchObject([
			{ id: "first", startTime: mt(0), duration: mt(200) },
			{ id: "second", startTime: mt(300), duration: mt(200) },
		]);
	});

	test("refuses to compound clips with an unselected clip between them", () => {
		const tracks = sceneWithMain([
			videoElement({
				id: "first",
				mediaId: "media-1",
				startTime: 0,
				duration: 100,
				trimStart: 0,
				trimEnd: 900,
			}),
			videoElement({
				id: "middle",
				mediaId: "media-2",
				startTime: 100,
				duration: 100,
				trimStart: 0,
				trimEnd: 900,
			}),
			videoElement({
				id: "last",
				mediaId: "media-3",
				startTime: 200,
				duration: 100,
				trimStart: 0,
				trimEnd: 900,
			}),
		]);

		const plan = buildCompoundElementsPlan({
			tracks,
			elements: [
				{ trackId: "main", elementId: "first" },
				{ trackId: "main", elementId: "last" },
			],
		});

		expect(plan).toBeNull();
	});
});
