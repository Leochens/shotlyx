import { describe, expect, test } from "bun:test";
import type {
	AudioTrack,
	GraphicElement,
	SceneTracks,
	SubtitleElement,
	VideoElement,
} from "@/timeline";
import { analyzeExportFastPath } from "../export-fast-path";

function videoElement(overrides: Partial<VideoElement> = {}): VideoElement {
	return {
		id: "video-1",
		type: "video",
		name: "Video",
		mediaId: "media-1",
		startTime: 0,
		duration: 120_000,
		trimStart: 0,
		trimEnd: 0,
		sourceDuration: 120_000,
		isSourceAudioEnabled: true,
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
			blendMode: "normal",
		},
		...overrides,
	};
}

function graphicElement(): GraphicElement {
	return {
		id: "mg-1",
		type: "graphic",
		name: "MG",
		definitionId: "shotlyx-mg",
		startTime: 0,
		duration: 120_000,
		trimStart: 0,
		trimEnd: 0,
		params: {},
	};
}

function subtitleElement(): SubtitleElement {
	return {
		id: "subtitle-1",
		type: "subtitle",
		name: "Subtitle",
		cues: [],
		startTime: 0,
		duration: 120_000,
		trimStart: 0,
		trimEnd: 0,
		params: {},
	};
}

function audioTrack(): AudioTrack {
	return {
		id: "audio-1",
		type: "audio",
		name: "Audio",
		muted: false,
		elements: [
			{
				id: "audio-element-1",
				type: "audio",
				sourceType: "upload",
				mediaId: "audio-media-1",
				name: "Audio",
				startTime: 0,
				duration: 120_000,
				trimStart: 0,
				trimEnd: 0,
				params: { muted: false },
			},
		],
	};
}

function tracks(overrides: Partial<SceneTracks> = {}): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "main",
			type: "video",
			name: "Main",
			muted: false,
			hidden: false,
			elements: [videoElement()],
		},
		audio: [],
		...overrides,
	};
}

describe("analyzeExportFastPath", () => {
	test("allows a single unchanged source video", () => {
		expect(
			analyzeExportFastPath({
				includeAudio: true,
				tracks: tracks(),
			}),
		).toEqual({
			eligible: true,
			kind: "single-source-video",
			mediaId: "media-1",
			audioMode: "source",
			reasons: [],
		});
	});

	test("blocks MG and subtitle overlay elements", () => {
		const analysis = analyzeExportFastPath({
			includeAudio: true,
			tracks: tracks({
				overlay: [
					{
						id: "graphic-track",
						type: "graphic",
						name: "Graphics",
						hidden: false,
						elements: [graphicElement()],
					},
					{
						id: "text-track",
						type: "text",
						name: "Text",
						hidden: false,
						elements: [subtitleElement()],
					},
				],
			}),
		});

		expect(analysis.eligible).toBe(false);
		expect(analysis.reasons).toContain("overlay-elements");
	});

	test("blocks extra mixed audio", () => {
		const analysis = analyzeExportFastPath({
			includeAudio: true,
			tracks: tracks({ audio: [audioTrack()] }),
		});

		expect(analysis.eligible).toBe(false);
		expect(analysis.reasons).toContain("mixed-audio");
	});

	test("allows extra audio tracks when audio is excluded", () => {
		const analysis = analyzeExportFastPath({
			includeAudio: false,
			tracks: tracks({ audio: [audioTrack()] }),
		});

		expect(analysis).toMatchObject({
			eligible: true,
			audioMode: "none",
		});
	});

	test("blocks retime, effects, masks, animations, and transforms", () => {
		const analysis = analyzeExportFastPath({
			includeAudio: false,
			tracks: tracks({
				main: {
					id: "main",
					type: "video",
					name: "Main",
					muted: false,
					hidden: false,
					elements: [
						videoElement({
							retime: { rate: 1.25 },
							effects: [{ id: "blur", type: "blur", enabled: true, params: {} }],
							masks: [{ id: "mask", type: "rectangle", params: {} }],
							animations: { "transform.positionX": { keys: [] } },
							params: {
								"transform.positionX": 10,
							},
						}),
					],
				},
			}),
		});

		expect(analysis.eligible).toBe(false);
		expect(analysis.reasons).toEqual(
			expect.arrayContaining([
				"retimed-video",
				"effect-or-mask",
				"animated-video",
				"transformed-video",
			]),
		);
	});
});
