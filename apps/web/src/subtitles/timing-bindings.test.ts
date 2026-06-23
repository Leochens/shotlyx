import { describe, expect, mock, test } from "bun:test";
import type { TProjectSubtitleTrack } from "@/project/types";
import type { SceneTracks, VideoElement } from "@/timeline";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const {
	getTimelineSubtitleTrack,
	resolveSubtitleSourceTimelineStartSeconds,
	storedSubtitleSecondsToTimelineSeconds,
} = await import("./timing-bindings");
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

function sceneTracks({ clipStartSeconds }: { clipStartSeconds: number }) {
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
					startTimeSeconds: clipStartSeconds,
					durationSeconds: 20,
				}),
			],
		},
		audio: [],
	} satisfies SceneTracks;
}

function subtitleTrack(): TProjectSubtitleTrack {
	return {
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
	};
}

describe("subtitle timing bindings", () => {
	test("shifts project subtitles by the current source clip offset", () => {
		const tracks = sceneTracks({ clipStartSeconds: 10 });
		const timelineTrack = getTimelineSubtitleTrack({
			track: subtitleTrack(),
			tracks,
		});

		expect(
			resolveSubtitleSourceTimelineStartSeconds({
				sourceTrackId: "voice-track",
				sourceElementId: "voice-clip",
				tracks,
			}),
		).toBe(10);
		expect(timelineTrack.cues[0]?.startTime).toBe(11);
		expect(timelineTrack.cues[0]?.tokens?.[1]?.startTime).toBe(12);
		expect(
			storedSubtitleSecondsToTimelineSeconds({
				track: subtitleTrack(),
				tracks,
				seconds: 2,
			}),
		).toBe(12);
	});

	test("falls back to the earliest whole-second cue start for legacy tracks", () => {
		const {
			sourceTimelineStartTimeSeconds: _sourceTimelineStartTimeSeconds,
			...legacyTrack
		} = subtitleTrack();
		const timelineTrack = getTimelineSubtitleTrack({
			track: legacyTrack,
			tracks: sceneTracks({ clipStartSeconds: 10 }),
		});

		expect(timelineTrack.cues[0]?.startTime).toBe(11);
		expect(timelineTrack.cues[0]?.tokens?.[1]?.startTime).toBe(12);
	});

	test("repairs pre-fix generated tracks that stored source-relative cue times", () => {
		const sourceRelativeTrack: TProjectSubtitleTrack = {
			...subtitleTrack(),
			sourceTimelineStartTimeSeconds: 5,
			cues: [
				{
					text: "先移后识别",
					startTime: 0.5,
					duration: 1,
					tokens: [
						{ text: "先", startTime: 0.5, duration: 0.25 },
						{ text: "移", startTime: 0.75, duration: 0.25 },
					],
				},
			],
		};
		const timelineTrack = getTimelineSubtitleTrack({
			track: sourceRelativeTrack,
			tracks: sceneTracks({ clipStartSeconds: 5 }),
		});
		const movedTimelineTrack = getTimelineSubtitleTrack({
			track: sourceRelativeTrack,
			tracks: sceneTracks({ clipStartSeconds: 10 }),
		});

		expect(timelineTrack.cues[0]?.startTime).toBe(5.5);
		expect(timelineTrack.cues[0]?.tokens?.[1]?.startTime).toBe(5.75);
		expect(movedTimelineTrack.cues[0]?.startTime).toBe(10.5);
		expect(
			storedSubtitleSecondsToTimelineSeconds({
				track: sourceRelativeTrack,
				tracks: sceneTracks({ clipStartSeconds: 10 }),
				seconds: 0.75,
			}),
		).toBe(10.75);
	});
});
