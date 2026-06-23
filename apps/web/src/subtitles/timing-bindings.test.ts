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
});
