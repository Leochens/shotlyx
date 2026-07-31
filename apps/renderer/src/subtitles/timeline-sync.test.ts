import { describe, expect, mock, test } from "bun:test";
import type {
	TProjectSubtitles,
	TProjectSubtitleTrack,
} from "@/project/types";
import type { SceneTracks, VideoElement } from "@/timeline";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const {
	syncProjectSubtitlesForTimelineCuts,
	syncProjectSubtitlesToTimelineFragments,
} = await import("./timeline-sync");
const { mediaTimeFromSeconds } = await import("@/wasm/media-time");

function videoElement({
	id,
	startTimeSeconds,
	durationSeconds,
	trimStartSeconds = 0,
	mediaId = `${id}-media`,
}: {
	id: string;
	startTimeSeconds: number;
	durationSeconds: number;
	trimStartSeconds?: number;
	mediaId?: string;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId,
		startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
		duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
		trimStart: mediaTimeFromSeconds({ seconds: trimStartSeconds }),
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
	test("collapses legacy global transcript timing for timeline cuts", () => {
		const result = syncProjectSubtitlesForTimelineCuts({
			subtitles: {
				enabled: true,
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
				revealMode: "token",
				lineBreakMode: "page",
				maxCharsPerLine: 24,
			},
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

		expect(result?.cues[0]?.text).toBe("前后");
		expect(result?.cues[0]?.tokens?.[1]).toMatchObject({
			text: "后",
			startTime: 2,
		});
		expect(result?.tracks?.[0]).toMatchObject({
			id: "track:global",
			cues: result?.cues,
		});
	});

	test("keeps persisted global track and project cues in sync", () => {
		const currentSubtitles = subtitles();
		const globalTrack: TProjectSubtitleTrack = {
			id: "track:global",
			label: "全局字幕",
			cues: currentSubtitles.tracks?.[0]?.cues ?? [],
		};
		const result = syncProjectSubtitlesForTimelineCuts({
			subtitles: {
				...currentSubtitles,
				cues: globalTrack.cues,
				tracks: [globalTrack],
			},
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
		expect(result?.cues).toEqual(result?.tracks?.[0]?.cues);
	});

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

	test("splits segment-bound transcripts across the new timeline fragments", () => {
		const before = sceneTracks();
		const after: SceneTracks = {
			...before,
			main: {
				...before.main,
				elements: [
					videoElement({
						id: "voice-clip",
						startTimeSeconds: 10,
						durationSeconds: 2,
					}),
					videoElement({
						id: "voice-clip-right",
						startTimeSeconds: 12,
						durationSeconds: 18,
						trimStartSeconds: 2,
						mediaId: "voice-clip-media",
					}),
				],
			},
		};
		const result = syncProjectSubtitlesToTimelineFragments({
			subtitles: {
				...subtitles(),
				tracks: [
					{
						id: "track:voice-track",
						label: "Voice",
						sourceTrackId: "voice-track",
						sourceElementId: "voice-clip",
						cues: [],
						segments: [
							{
								id: "seg-voice",
								sourceTrackId: "voice-track",
								sourceElementId: "voice-clip",
								sourceMediaId: "voice-clip-media",
								cues: [
									{
										text: "前后",
										startTime: 1,
										duration: 3,
										tokens: [
											{ text: "前", startTime: 1, duration: 1 },
											{ text: "后", startTime: 3, duration: 1 },
										],
									},
								],
							},
						],
					},
				],
			},
			beforeTracks: before,
			afterTracks: after,
		});

		expect(result?.tracks?.[0]?.segments).toHaveLength(2);
		expect(
			result?.tracks?.[0]?.segments?.map((segment) => segment.sourceElementId),
		).toEqual(["voice-clip", "voice-clip-right"]);
		expect(
			result?.tracks?.[0]?.segments?.map((segment) => segment.cues[0]?.text),
		).toEqual(["前", "后"]);
	});
});
