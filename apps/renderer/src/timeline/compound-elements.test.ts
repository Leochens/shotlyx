import { describe, expect, mock, test } from "bun:test";

import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { TimelineElement, VideoElement } from "@/timeline";

mock.module("@/wasm", () => wasmMock);

const { expandCompoundElement } = await import("./compound-elements");

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
}: {
	id: string;
	startTime: number;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
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
		sourceDuration: mt(1000),
		params: {},
	};
}

describe("expandCompoundElement", () => {
	test("applies compound trimStart and duration to child clips", () => {
		const compound = {
			...videoElement({
				id: "compound",
				startTime: 1000,
				duration: 500,
				trimStart: 150,
			}),
			compound: {
				elements: [
					videoElement({ id: "first", startTime: 0, duration: 300 }),
					videoElement({ id: "second", startTime: 300, duration: 400 }),
				],
			},
		} satisfies TimelineElement;

		const expanded = expandCompoundElement({ element: compound });

		expect(expanded).toMatchObject([
			{
				id: "first",
				startTime: mt(1000),
				duration: mt(150),
				trimStart: mt(150),
				trimEnd: mt(0),
			},
			{
				id: "second",
				startTime: mt(1150),
				duration: mt(350),
				trimStart: mt(0),
				trimEnd: mt(50),
			},
		]);
	});

	test("drops compound children that are outside the trimmed window", () => {
		const compound = {
			...videoElement({
				id: "compound",
				startTime: 1000,
				duration: 100,
				trimStart: 350,
			}),
			compound: {
				elements: [
					videoElement({ id: "hidden", startTime: 0, duration: 200 }),
					videoElement({ id: "visible", startTime: 300, duration: 200 }),
				],
			},
		} satisfies TimelineElement;

		const expanded = expandCompoundElement({ element: compound });

		expect(expanded).toMatchObject([
			{
				id: "visible",
				startTime: mt(1000),
				duration: mt(100),
				trimStart: mt(50),
				trimEnd: mt(50),
			},
		]);
	});
});
