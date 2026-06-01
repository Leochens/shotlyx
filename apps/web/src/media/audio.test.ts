/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- The audio unit test passes minimal DOM-shaped fakes for AudioBuffer and AudioContext. */
import { describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks, VideoElement } from "@/timeline";

const TICKS_PER_SECOND = 120_000;
const wasmMock = {
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME: 0,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * TICKS_PER_SECOND),
	mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS_PER_SECOND,
	roundMediaTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTime: ({ time }: { time: number }) => Math.round(time),
	roundFrameTicks: ({ ticks }: { ticks: number }) => Math.round(ticks),
	roundToFrame: ({ time }: { time: number }) => Math.round(time),
	snapSeekMediaTime: ({ time }: { time: number }) => Math.round(time),
	snappedSeekTime: ({ time }: { time: number }) => Math.round(time),
	parseTimecode: () => 0,
	parseMediaTimecode: () => 0,
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
	lastFrameMediaTime: ({ duration }: { duration: number }) =>
		Math.max(0, duration - 1),
	formatTimecode: () => "00:00:00:00",
	frameRateToFloat: () => 30,
	getCompositorCanvas: () => ({}),
	getLastFrameProfile: () => null,
	initCompositor: () => {},
	releaseTexture: () => {},
	renderFrame: () => {},
	resizeCompositor: () => {},
	uploadTexture: () => {},
	applyEffectPasses: () => ({}),
	applyMaskFeather: () => ({}),
	initializeGpu: async () => {},
	detectSilenceSegments: () => [],
};

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { collectAudioElements } = await import("./audio");

function buildVideoElement(
	overrides: Partial<VideoElement> = {},
): VideoElement {
	return {
		id: "clip",
		type: "video",
		name: "clip",
		mediaId: "media-1",
		startTime: 0,
		duration: 120_000,
		trimStart: 0,
		trimEnd: 0,
		sourceDuration: 120_000,
		params: {
			muted: false,
			volume: 0,
		},
		isSourceAudioEnabled: true,
		...overrides,
	};
}

function buildTracks(elements: VideoElement[]): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements,
		},
		overlay: [],
		audio: [],
	};
}

function buildMediaAsset(): MediaAsset {
	return {
		id: "media-1",
		name: "source.mp4",
		type: "video",
		hasAudio: true,
		file: new File([new Uint8Array([1])], "source.mp4", {
			type: "video/mp4",
		}),
	};
}

describe("collectAudioElements", () => {
	test("reuses one decoded asset buffer for many timeline slices from the same media", async () => {
		const decodedBuffer = { sampleRate: 44_100 } as AudioBuffer;
		const resolveAssetAudioBuffer = mock(async () => decodedBuffer);

		const audioElements = await collectAudioElements({
			tracks: buildTracks([
				buildVideoElement({ id: "clip-a", startTime: 0, trimStart: 0 }),
				buildVideoElement({
					id: "clip-b",
					startTime: 120_000,
					trimStart: 240_000,
				}),
			]),
			mediaAssets: [buildMediaAsset()],
			audioContext: { sampleRate: 44_100 } as AudioContext,
			resolveAssetAudioBuffer,
		});

		expect(resolveAssetAudioBuffer).toHaveBeenCalledTimes(1);
		expect(audioElements).toHaveLength(2);
		expect(audioElements[0]?.buffer).toBe(decodedBuffer);
		expect(audioElements[1]?.buffer).toBe(decodedBuffer);
		expect(audioElements.map((element) => element.trimStart)).toEqual([0, 2]);
	});

	test("expands compound video clips into child audio elements", async () => {
		const decodedBuffer = { sampleRate: 44_100 } as AudioBuffer;
		const resolveAssetAudioBuffer = mock(async () => decodedBuffer);
		const first = buildVideoElement({
			id: "clip-a",
			startTime: 0,
			duration: 120_000,
			trimStart: 0,
		});
		const second = buildVideoElement({
			id: "clip-b",
			startTime: 120_000,
			duration: 120_000,
			trimStart: 240_000,
		});

		const audioElements = await collectAudioElements({
			tracks: buildTracks([
				{
					...first,
					id: "compound",
					name: "Compound clip",
					startTime: 360_000,
					duration: 240_000,
					trimStart: 0,
					trimEnd: 0,
					compound: {
						elements: [first, second],
					},
				},
			]),
			mediaAssets: [buildMediaAsset()],
			audioContext: { sampleRate: 44_100 } as AudioContext,
			resolveAssetAudioBuffer,
		});

		expect(resolveAssetAudioBuffer).toHaveBeenCalledTimes(1);
		expect(audioElements).toHaveLength(2);
		expect(audioElements.map((element) => element.startTime)).toEqual([3, 4]);
		expect(audioElements.map((element) => element.trimStart)).toEqual([0, 2]);
	});
});
