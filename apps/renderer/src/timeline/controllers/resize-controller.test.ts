import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement, VideoTrack } from "@/timeline";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { buildResizeMembers, buildRollingResizeMembers } = await import(
	"./resize-controller"
);

const TICKS_PER_SECOND = 120_000;

function mt(seconds: number): MediaTime {
	return Math.round(seconds * TICKS_PER_SECOND);
}

function videoElement({
	id,
	mediaId = "media-1",
	startTime,
	duration,
	trimStart,
	trimEnd,
}: {
	id: string;
	mediaId?: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(trimStart),
		trimEnd: mt(trimEnd),
		sourceDuration: mt(10),
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

describe("buildResizeMembers", () => {
	test("carries continuous split sibling data for rolling edge resize", () => {
		const members = buildResizeMembers({
			tracks: sceneWithMain([
				videoElement({
					id: "clip",
					startTime: 3,
					duration: 2,
					trimStart: 3,
					trimEnd: 5,
				}),
				videoElement({
					id: "right-sibling",
					startTime: 5,
					duration: 2,
					trimStart: 5,
					trimEnd: 3,
				}),
			]),
			selectedElements: [{ trackId: "main", elementId: "clip" }],
		});

		expect(members[0]).toMatchObject({
			sourceKey: "media:media-1",
			rightNeighborBound: mt(5),
			rightBoundaryNeighbor: {
				trackId: "main",
				elementId: "right-sibling",
				sourceKey: "media:media-1",
				startTime: mt(5),
				duration: mt(2),
				trimStart: mt(5),
			},
		});
	});

	test("builds rolling resize members from either side of an adjacent edit point", () => {
		const left = videoElement({
			id: "a",
			mediaId: "media-a",
			startTime: 0,
			duration: 5,
			trimStart: 0,
			trimEnd: 5,
		});
		const right = videoElement({
			id: "b",
			mediaId: "media-b",
			startTime: 5,
			duration: 3,
			trimStart: 2,
			trimEnd: 5,
		});
		const tracks = sceneWithMain([left, right]);

		expect(
			buildRollingResizeMembers({
				tracks,
				trackId: "main",
				element: left,
				side: "right",
			})?.map((member) => member.elementId),
		).toEqual(["a", "b"]);
		expect(
			buildRollingResizeMembers({
				tracks,
				trackId: "main",
				element: right,
				side: "left",
			})?.map((member) => member.elementId),
		).toEqual(["a", "b"]);
	});
});
