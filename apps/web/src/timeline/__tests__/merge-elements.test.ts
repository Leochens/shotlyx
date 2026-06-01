import { describe, expect, mock, test } from "bun:test";

import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement, VideoTrack } from "@/timeline";

mock.module("@/wasm", () => wasmMock);

const { buildMergeElementsPlan } = await import("@/timeline/merge-elements");

function mt(value: number): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as MediaTime;
}

function videoElement({
	id,
	name = id,
	startTime,
	duration,
	trimStart,
	trimEnd,
}: {
	id: string;
	name?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name,
		mediaId: "media-1",
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
});
