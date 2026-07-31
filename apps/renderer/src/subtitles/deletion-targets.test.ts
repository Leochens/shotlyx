/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixtures use deterministic MediaTime tick values without loading the WASM runtime. */
import { describe, expect, test } from "bun:test";
import type { TProjectSubtitleTrack } from "@/project/types";
import type { AudioElement, AudioTrack, SceneTracks } from "@/timeline";
import type { MediaTime } from "@/wasm/media-time";
import {
	buildTranscriptDeletionTargets,
	resolveTranscriptDeletionSourceTracks,
} from "./deletion-targets";

function mediaTime(value: number): MediaTime {
	return value as MediaTime;
}

function audioTrack({
	id,
	elements = [],
}: {
	id: string;
	elements?: AudioElement[];
}): AudioTrack {
	return {
		id,
		name: id,
		type: "audio",
		elements,
		muted: false,
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
		startTime: mediaTime(startTime),
		duration: mediaTime(duration),
		trimStart: mediaTime(0),
		trimEnd: mediaTime(0),
		params: {},
	};
}

function sceneTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "main",
			type: "video",
			elements: [],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [
			audioTrack({ id: "audio-one" }),
			audioTrack({ id: "audio-two" }),
		],
	};
}

function transcriptTrack(
	patch: Partial<TProjectSubtitleTrack> = {},
): TProjectSubtitleTrack {
	return {
		id: "track:global",
		label: "全局字幕",
		cues: [],
		...patch,
	};
}

describe("transcript deletion targets", () => {
	test("uses the explicitly bound source track", () => {
		const tracks = sceneTracks();
		const sourceTracks = resolveTranscriptDeletionSourceTracks({
			transcriptTrack: transcriptTrack({ sourceTrackId: "audio-two" }),
			selectedTrackId: "track:audio-two",
			timelineTracks: tracks,
			audibleTrackIds: ["audio-one", "audio-two"],
		});

		expect(sourceTracks.map((track) => track.id)).toEqual(["audio-two"]);
	});

	test("maps a legacy global transcript to all audible timeline tracks", () => {
		const tracks = sceneTracks();
		const sourceTracks = resolveTranscriptDeletionSourceTracks({
			transcriptTrack: transcriptTrack(),
			selectedTrackId: "track:global",
			timelineTracks: tracks,
			audibleTrackIds: ["audio-one", "audio-two"],
		});

		expect(sourceTracks.map((track) => track.id)).toEqual([
			"audio-one",
			"audio-two",
		]);
	});

	test("does not guess when a non-global binding is stale", () => {
		const sourceTracks = resolveTranscriptDeletionSourceTracks({
			transcriptTrack: transcriptTrack({
				id: "track:missing",
				sourceTrackId: "missing",
			}),
			selectedTrackId: "track:missing",
			timelineTracks: sceneTracks(),
			audibleTrackIds: ["audio-one"],
		});

		expect(sourceTracks).toEqual([]);
	});

	test("builds targets only for clips overlapping the selection", () => {
		const sourceTrack = audioTrack({
			id: "audio-one",
			elements: [
				audioElement({ id: "before", startTime: 0, duration: 1 }),
				audioElement({ id: "hit", startTime: 1, duration: 2 }),
				audioElement({ id: "after", startTime: 3, duration: 1 }),
			],
		});
		const startTime = mediaTime(1.5);
		const endTime = mediaTime(2.5);

		expect(
			buildTranscriptDeletionTargets({
				sourceTracks: [sourceTrack],
				startTime,
				endTime,
			}),
		).toEqual([
			{
				trackId: "audio-one",
				elementId: "hit",
				ranges: [{ startTime, endTime }],
			},
		]);
	});
});
