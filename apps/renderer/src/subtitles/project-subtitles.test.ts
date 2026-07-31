import { describe, expect, mock, test } from "bun:test";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";
import type { SceneTracks, VideoElement } from "@/timeline";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { buildProjectSubtitleElements } = await import("./project-subtitles");
const { resolveSubtitleTextAtTime } = await import("./layer");
const { mediaTimeFromSeconds } = await import("@/wasm/media-time");

function videoElement({
	id,
	startTimeSeconds,
	durationSeconds,
}: {
	id: string;
	startTimeSeconds: number;
	durationSeconds: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: `${id}-media`,
		startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
		duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
		trimStart: mediaTimeFromSeconds({ seconds: 0 }),
		trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
		params: {},
	};
}

function sceneTracks(): SceneTracks {
	return {
		overlay: [],
		main: {
			id: "voice-track",
			name: "Voice",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				videoElement({
					id: "voice-clip",
					startTimeSeconds: 10,
					durationSeconds: 20,
				}),
			],
		},
		audio: [],
	};
}

describe("project subtitles", () => {
	test("applies project-level subtitle style params to rendered subtitle elements", () => {
		const elements = buildProjectSubtitleElements({
			canvasSize: { width: 1920, height: 1080 },
			duration: 120_000,
			subtitles: {
				enabled: true,
				cues: [],
				revealMode: "karaoke",
				lineBreakMode: "page",
				maxCharsPerLine: 24,
				styleParams: {
					color: "#ff3366",
					fontSize: 5,
					"transform.positionY": 500,
					"subtitle.highlightColor": "#22d3ee",
				},
				tracks: [
					{
						id: "track:one",
						label: "One",
						cues: [{ text: "第一轨", startTime: 0, duration: 1 }],
					},
					{
						id: "track:two",
						label: "Two",
						cues: [{ text: "第二轨", startTime: 0, duration: 1 }],
					},
				],
			},
		});

		expect(elements).toHaveLength(2);
		expect(elements[0]).toMatchObject({
			revealMode: "karaoke",
			params: {
				color: "#ff3366",
				fontSize: 5,
				"transform.positionY": 500,
				"subtitle.highlightColor": "#22d3ee",
				"subtitle.maxCharsPerLine": 24,
				"subtitle.lineBreakMode": "page",
			},
		});
		expect(elements[1]?.params["transform.positionY"]).toBeCloseTo(424.4);
	});

	test("skips subtitle tracks whose rendering is turned off", () => {
		const elements = buildProjectSubtitleElements({
			canvasSize: { width: 1920, height: 1080 },
			duration: 120_000,
			subtitles: {
				enabled: true,
				cues: [],
				revealMode: "line",
				lineBreakMode: "page",
				maxCharsPerLine: 24,
				tracks: [
					{
						id: "track:hidden",
						label: "Hidden",
						renderEnabled: false,
						cues: [{ text: "不显示", startTime: 0, duration: 1 }],
					},
					{
						id: "track:visible",
						label: "Visible",
						renderEnabled: true,
						cues: [{ text: "显示这一条", startTime: 0, duration: 1 }],
					},
				],
			},
		});

		expect(elements).toHaveLength(1);
		expect(elements[0]?.name).toBe("Visible");
		expect(elements[0]?.cues[0]?.text).toBe("显示这一条");
	});

	test("renders project subtitles at the current source clip offset", () => {
		const elements = buildProjectSubtitleElements({
			canvasSize: { width: 1920, height: 1080 },
			duration: mediaTimeFromSeconds({ seconds: 30 }),
			timelineTracks: sceneTracks(),
			subtitles: {
				enabled: true,
				cues: [],
				revealMode: "token",
				lineBreakMode: "page",
				maxCharsPerLine: 24,
				tracks: [
					{
						id: "track:voice-track",
						label: "Voice",
						sourceTrackId: "voice-track",
						sourceElementId: "voice-clip",
						sourceTimelineStartTimeSeconds: 0,
						cues: [
							{
								text: "你好",
								startTime: 1,
								duration: 2,
								tokens: [
									{ text: "你", startTime: 1, duration: 1 },
									{ text: "好", startTime: 2, duration: 1 },
								],
							},
						],
					},
				],
			},
		});

		const subtitleElement = elements[0];
		expect(subtitleElement?.startTime).toBe(
			mediaTimeFromSeconds({ seconds: 11 }),
		);
		expect(subtitleElement?.cues[0]?.startTime).toBe(0);
		expect(subtitleElement?.cues[0]?.tokens?.[1]?.startTime).toBe(1);
		expect(
			subtitleElement
				? resolveSubtitleTextAtTime({
						element: subtitleElement,
						timelineTime: mediaTimeFromSeconds({ seconds: 0 }),
					})
				: null,
		).toBeNull();
		expect(
			subtitleElement
				? resolveSubtitleTextAtTime({
						element: subtitleElement,
						timelineTime: mediaTimeFromSeconds({ seconds: 11.5 }),
					})?.text
				: null,
		).toBe("你");
	});
});
