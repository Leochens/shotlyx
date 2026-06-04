/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- These tests use lightweight branded MediaTime fakes to avoid loading the wasm runtime. */
import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import {
	buildTimelineCoverInsertion,
	resolveTimelineCoverDurationSeconds,
} from "@/timeline/cover";
import type {
	AudioElement,
	SceneTracks,
	TextElement,
	VideoElement,
} from "@/timeline/types";
import type { MediaTime } from "@/wasm";

const ZERO_MEDIA_TIME = 0 as unknown as MediaTime;

function mediaTime({ ticks }: { ticks: number }): MediaTime {
	return ticks as unknown as MediaTime;
}

const coverAsset: MediaAsset = {
	id: "cover-asset",
	name: "Cover image",
	type: "image",
	file: new File(["cover"], "cover.png", { type: "image/png" }),
	url: "blob:cover",
	width: 1280,
	height: 720,
};

function buildVideoElement(): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Main video",
		mediaId: "video-asset",
		startTime: mediaTime({ ticks: 120 }),
		duration: mediaTime({ ticks: 600 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function buildTextElement(): TextElement {
	return {
		id: "title-1",
		type: "text",
		name: "Title",
		startTime: mediaTime({ ticks: 60 }),
		duration: mediaTime({ ticks: 120 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function buildAudioElement(): AudioElement {
	return {
		id: "audio-1",
		type: "audio",
		sourceType: "upload",
		name: "Music",
		mediaId: "audio-asset",
		startTime: mediaTime({ ticks: 30 }),
		duration: mediaTime({ ticks: 300 }),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {},
	};
}

function buildTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements: [buildVideoElement()],
		},
		overlay: [
			{
				id: "text-track",
				type: "text",
				name: "Text",
				hidden: false,
				elements: [buildTextElement()],
			},
		],
		audio: [
			{
				id: "audio-track",
				type: "audio",
				name: "Audio",
				muted: false,
				elements: [buildAudioElement()],
			},
		],
	};
}

describe("timeline cover insertion", () => {
	test("resolves default cover duration from frames and fps", () => {
		expect(resolveTimelineCoverDurationSeconds({ fps: 30 })).toBe(0.2);
		expect(
			resolveTimelineCoverDurationSeconds({
				fps: 24,
				durationFrames: 12,
			}),
		).toBe(0.5);
		expect(
			resolveTimelineCoverDurationSeconds({
				fps: 30,
				durationFrames: 12,
				durationSeconds: 1.25,
			}),
		).toBe(1.25);
	});

	test("builds a beginning cover and shifts every existing track", () => {
		const duration = mediaTime({ ticks: 12 });
		const plan = buildTimelineCoverInsertion({
			asset: coverAsset,
			duration,
			tracks: buildTracks(),
		});

		expect(plan.trackId).toBe("main");
		expect(plan.updates).toEqual([
			{
				trackId: "main",
				elementId: "video-1",
				patch: { startTime: mediaTime({ ticks: 132 }) },
			},
			{
				trackId: "text-track",
				elementId: "title-1",
				patch: { startTime: mediaTime({ ticks: 72 }) },
			},
			{
				trackId: "audio-track",
				elementId: "audio-1",
				patch: { startTime: mediaTime({ ticks: 42 }) },
			},
		]);
		expect(plan.element).toMatchObject({
			type: "image",
			name: "Cover - Cover image",
			mediaId: "cover-asset",
			startTime: ZERO_MEDIA_TIME,
			duration,
			params: expect.objectContaining({ "cover.exclusive": true }),
		});
	});
});
