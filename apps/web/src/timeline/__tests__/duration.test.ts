/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixtures use branded MediaTime as raw tick numbers. */
import { describe, expect, mock, test } from "bun:test";

import { wasmMock } from "@/test/wasm-mock";
import type {
	AudioElement,
	AudioTrack,
	SceneTracks,
	TextElement,
	TextTrack,
	VideoElement,
	VideoTrack,
} from "@/timeline";
import type { MediaTime } from "@/wasm";

mock.module("@/wasm", () => wasmMock);

const { calculateTotalDuration } = await import("@/timeline");

function mt(value: number): MediaTime {
	return value as MediaTime;
}

function videoElement({
	id,
	startTime,
	duration,
	hidden = false,
}: {
	id: string;
	startTime: number;
	duration: number;
	hidden?: boolean;
}): VideoElement {
	return {
		id,
		name: id,
		type: "video",
		mediaId: `${id}-media`,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(0),
		trimEnd: mt(0),
		hidden,
		params: {},
	};
}

function textElement({
	id,
	startTime,
	duration,
	hidden = false,
}: {
	id: string;
	startTime: number;
	duration: number;
	hidden?: boolean;
}): TextElement {
	return {
		id,
		name: id,
		type: "text",
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(0),
		trimEnd: mt(0),
		hidden,
		params: {},
	};
}

function audioElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): AudioElement {
	return {
		id,
		name: id,
		type: "audio",
		sourceType: "upload",
		mediaId: `${id}-media`,
		startTime: mt(startTime),
		duration: mt(duration),
		trimStart: mt(0),
		trimEnd: mt(0),
		params: {},
	};
}

function mainTrack({
	elements,
	hidden = false,
}: {
	elements: VideoElement[];
	hidden?: boolean;
}): VideoTrack {
	return {
		id: "main",
		name: "Main",
		type: "video",
		muted: false,
		hidden,
		elements,
	};
}

function textTrack({
	id,
	elements,
	hidden = false,
}: {
	id: string;
	elements: TextElement[];
	hidden?: boolean;
}): TextTrack {
	return {
		id,
		name: id,
		type: "text",
		hidden,
		elements,
	};
}

function audioTrack({
	elements,
}: {
	elements: AudioElement[];
}): AudioTrack {
	return {
		id: "audio",
		name: "Audio",
		type: "audio",
		muted: false,
		elements,
	};
}

function tracks(overrides: Partial<SceneTracks> = {}): SceneTracks {
	return {
		overlay: [],
		main: mainTrack({ elements: [] }),
		audio: [],
		...overrides,
	};
}

describe("calculateTotalDuration", () => {
	test("uses the latest end time from visible timeline elements", () => {
		const duration = calculateTotalDuration({
			tracks: tracks({
				main: mainTrack({
					elements: [
						videoElement({ id: "video", startTime: 100, duration: 200 }),
					],
				}),
				audio: [
					audioTrack({
						elements: [
							audioElement({ id: "audio", startTime: 50, duration: 400 }),
						],
					}),
				],
			}),
		});

		expect(duration).toBe(mt(450));
	});

	test("ignores hidden tracks, hidden elements, and non-positive durations", () => {
		const duration = calculateTotalDuration({
			tracks: tracks({
				overlay: [
					textTrack({
						id: "hidden-track",
						hidden: true,
						elements: [
							textElement({
								id: "hidden-track-element",
								startTime: 1000,
								duration: 300,
							}),
						],
					}),
					textTrack({
						id: "visible-track",
						elements: [
							textElement({
								id: "hidden-element",
								startTime: 900,
								duration: 200,
								hidden: true,
							}),
							textElement({
								id: "zero-duration",
								startTime: 800,
								duration: 0,
							}),
						],
					}),
				],
				main: mainTrack({
					elements: [
						videoElement({ id: "visible", startTime: 100, duration: 200 }),
					],
				}),
			}),
		});

		expect(duration).toBe(mt(300));
	});
});
