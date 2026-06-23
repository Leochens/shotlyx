import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { AudioElement, SceneTracks, VideoElement } from "@/timeline";

const TICKS_PER_SECOND = 120_000;

const {
	audioRangeToSeconds,
	getTranscriptionAudioElementOptions,
	getTranscriptionAudioTrackOptions,
	resolveSelectedTranscriptionAudioRange,
} = await import("./audio-range");

function videoElement(overrides: Partial<VideoElement> = {}): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Interview",
		mediaId: "media-video",
		startTime: 2 * TICKS_PER_SECOND,
		duration: 4 * TICKS_PER_SECOND,
		trimStart: 0,
		trimEnd: 0,
		sourceDuration: 4 * TICKS_PER_SECOND,
		params: {},
		isSourceAudioEnabled: true,
		...overrides,
	};
}

function audioElement(overrides: Partial<AudioElement> = {}): AudioElement {
	return {
		id: "audio-1",
		type: "audio",
		name: "Voiceover",
		sourceType: "upload",
		mediaId: "media-audio",
		startTime: 8 * TICKS_PER_SECOND,
		duration: 3 * TICKS_PER_SECOND,
		trimStart: 0,
		trimEnd: 0,
		sourceDuration: 3 * TICKS_PER_SECOND,
		params: {},
		...overrides,
	};
}

function tracks({
	video = videoElement(),
	audio = audioElement(),
}: {
	video?: VideoElement;
	audio?: AudioElement;
} = {}): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [video],
		},
		overlay: [],
		audio: [
			{
				id: "audio-track",
				type: "audio",
				name: "Audio",
				elements: [audio],
			},
		],
	};
}

function mediaAssets(): MediaAsset[] {
	return [
		{
			id: "media-video",
			name: "interview.mp4",
			type: "video",
			hasAudio: true,
			file: new File(["video"], "interview.mp4", { type: "video/mp4" }),
		},
		{
			id: "media-audio",
			name: "voice.wav",
			type: "audio",
			file: new File(["audio"], "voice.wav", { type: "audio/wav" }),
		},
	];
}

describe("getTranscriptionAudioElementOptions", () => {
	test("includes audible video and audio clips", () => {
		const options = getTranscriptionAudioElementOptions({
			tracks: tracks(),
			mediaAssets: mediaAssets(),
		});

		expect(options.map((option) => option.label)).toEqual([
			"Interview",
			"Voiceover",
		]);
		expect(audioRangeToSeconds({ range: options[0] })).toEqual({
			startTimeSeconds: 2,
			durationSeconds: 4,
		});
	});

	test("excludes muted clips and video clips without enabled source audio", () => {
		const options = getTranscriptionAudioElementOptions({
			tracks: tracks({
				video: videoElement({ isSourceAudioEnabled: false }),
				audio: audioElement({ params: { muted: true } }),
			}),
			mediaAssets: mediaAssets(),
		});

		expect(options).toEqual([]);
	});

	test("includes compound clips when their expanded children have audio", () => {
		const compound = videoElement({
			id: "compound-1",
			name: "Compound clip",
			mediaId: "missing-parent-media",
			startTime: 12 * TICKS_PER_SECOND,
			duration: 5 * TICKS_PER_SECOND,
			compound: {
				elements: [
					audioElement({
						id: "compound-audio-1",
						startTime: TICKS_PER_SECOND,
						duration: 2 * TICKS_PER_SECOND,
					}),
				],
			},
		});

		const options = getTranscriptionAudioElementOptions({
			tracks: tracks({ video: compound }),
			mediaAssets: mediaAssets(),
		});

		expect(options[0]).toMatchObject({
			kind: "element",
			label: "Compound clip",
			startTime: 12 * TICKS_PER_SECOND,
			duration: 5 * TICKS_PER_SECOND,
			elementRef: { trackId: "main", elementId: "compound-1" },
		});
	});
});

describe("getTranscriptionAudioTrackOptions", () => {
	test("groups audible clips by track and spans the track range", () => {
		const sceneTracks = tracks({
			audio: audioElement({
				id: "audio-1",
				startTime: 8 * TICKS_PER_SECOND,
				duration: 3 * TICKS_PER_SECOND,
			}),
		});
		sceneTracks.audio[0].elements.push(
			audioElement({
				id: "audio-2",
				startTime: 14 * TICKS_PER_SECOND,
				duration: 2 * TICKS_PER_SECOND,
			}),
		);

		const options = getTranscriptionAudioTrackOptions({
			tracks: sceneTracks,
			mediaAssets: mediaAssets(),
		});

		expect(options).toEqual([
			expect.objectContaining({
				kind: "track",
				label: "Main",
				trackRef: { trackId: "main" },
				elementRef: { trackId: "main", elementId: "video-1" },
			}),
			expect.objectContaining({
				kind: "track",
				label: "Audio",
				trackRef: { trackId: "audio-track" },
				startTime: 8 * TICKS_PER_SECOND,
				duration: 8 * TICKS_PER_SECOND,
			}),
		]);
	});
});

describe("resolveSelectedTranscriptionAudioRange", () => {
	test("uses the selected audible clip range", () => {
		const sceneTracks = tracks();
		const range = resolveSelectedTranscriptionAudioRange({
			selectedElements: [{ trackId: "audio-track", elementId: "audio-1" }],
			elementsWithTracks: [
				{ track: sceneTracks.main, element: sceneTracks.main.elements[0] },
				{ track: sceneTracks.audio[0], element: sceneTracks.audio[0].elements[0] },
			],
			mediaAssets: mediaAssets(),
		});

		expect(range).toMatchObject({
			kind: "selection",
			label: "Voiceover",
			startTime: 8 * TICKS_PER_SECOND,
			duration: 3 * TICKS_PER_SECOND,
		});
	});

	test("spans multiple selected audible clips so the exported audio is mixed", () => {
		const sceneTracks = tracks();
		const range = resolveSelectedTranscriptionAudioRange({
			selectedElements: [
				{ trackId: "main", elementId: "video-1" },
				{ trackId: "audio-track", elementId: "audio-1" },
			],
			elementsWithTracks: [
				{ track: sceneTracks.main, element: sceneTracks.main.elements[0] },
				{ track: sceneTracks.audio[0], element: sceneTracks.audio[0].elements[0] },
			],
			mediaAssets: mediaAssets(),
		});

		expect(range).toMatchObject({
			kind: "selection",
			label: "Selected 2 clips mixed audio",
			startTime: 2 * TICKS_PER_SECOND,
			duration: 9 * TICKS_PER_SECOND,
		});
	});

	test("uses the outer compound range when a selected compound clip contains audio", () => {
		const compound = videoElement({
			id: "compound-1",
			name: "Compound clip",
			mediaId: "missing-parent-media",
			startTime: 12 * TICKS_PER_SECOND,
			duration: 5 * TICKS_PER_SECOND,
			compound: {
				elements: [
					audioElement({
						id: "compound-audio-1",
						startTime: TICKS_PER_SECOND,
						duration: 2 * TICKS_PER_SECOND,
					}),
				],
			},
		});
		const sceneTracks = tracks({ video: compound });
		const range = resolveSelectedTranscriptionAudioRange({
			selectedElements: [{ trackId: "main", elementId: "compound-1" }],
			elementsWithTracks: [
				{ track: sceneTracks.main, element: sceneTracks.main.elements[0] },
			],
			mediaAssets: mediaAssets(),
		});

		expect(range).toMatchObject({
			kind: "selection",
			label: "Compound clip",
			startTime: 12 * TICKS_PER_SECOND,
			duration: 5 * TICKS_PER_SECOND,
			elementRef: { trackId: "main", elementId: "compound-1" },
		});
	});
});
