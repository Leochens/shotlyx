import { describe, expect, mock, test } from "bun:test";
import type { TProjectSubtitles } from "@/project/types";
import type { SceneTracks, VideoElement } from "@/timeline";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { syncProjectSubtitlesForTimelineCuts } = await import("./timeline-sync");
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

function subtitles(): TProjectSubtitles {
	return {
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
						text: "前中后",
						startTime: 1,
						duration: 3,
						tokens: [
							{ text: "前", startTime: 1, duration: 1 },
							{ text: "中", startTime: 2, duration: 1 },
							{ text: "后", startTime: 3, duration: 1 },
						],
					},
				],
			},
		],
	};
}

describe("subtitle timeline sync", () => {
	test("collapses later transcript timing when timeline cuts close the gap", () => {
		const result = syncProjectSubtitlesForTimelineCuts({
			subtitles: subtitles(),
			timelineTracks: sceneTracks(),
			ranges: [
				{
					sourceTrackId: "voice-track",
					startTime: mediaTimeFromSeconds({ seconds: 12 }),
					endTime: mediaTimeFromSeconds({ seconds: 13 }),
					mode: "collapse",
				},
			],
		});

		expect(result?.tracks?.[0]?.cues[0]?.text).toBe("前后");
		expect(result?.tracks?.[0]?.cues[0]?.tokens?.[1]).toMatchObject({
			text: "后",
			startTime: 2,
		});
	});

	test("removes deleted transcript words without shifting when timeline keeps the gap", () => {
		const result = syncProjectSubtitlesForTimelineCuts({
			subtitles: subtitles(),
			timelineTracks: sceneTracks(),
			ranges: [
				{
					sourceTrackId: "voice-track",
					startTime: mediaTimeFromSeconds({ seconds: 12 }),
					endTime: mediaTimeFromSeconds({ seconds: 13 }),
					mode: "remove",
				},
			],
		});

		expect(result?.tracks?.[0]?.cues[0]?.text).toBe("前后");
		expect(result?.tracks?.[0]?.cues[0]?.tokens?.[1]).toMatchObject({
			text: "后",
			startTime: 3,
		});
	});
});
