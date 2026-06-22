import { describe, expect, test } from "bun:test";
import type { TProjectSubtitleTrack } from "@/project/types";
import {
	cutTranscriptTrackByTimeRange,
	editTranscriptSelection,
	findActiveTranscriptToken,
	resolveTranscriptTokenRange,
} from "./transcript-editing";

function track(): TProjectSubtitleTrack {
	return {
		id: "track:voice",
		label: "Voice",
		sourceTrackId: "voice",
		cues: [
			{
				text: "这是错字",
				startTime: 0,
				duration: 4,
				tokens: [
					{ text: "这", startTime: 0, duration: 1 },
					{ text: "是", startTime: 1, duration: 1 },
					{ text: "错", startTime: 2, duration: 1 },
					{ text: "字", startTime: 3, duration: 1 },
				],
			},
			{
				text: "删除后面",
				startTime: 4,
				duration: 3,
				tokens: [
					{ text: "删除", startTime: 4, duration: 1 },
					{ text: "后", startTime: 5, duration: 1 },
					{ text: "面", startTime: 6, duration: 1 },
				],
			},
		],
	};
}

describe("transcript editing", () => {
	test("resolves a word selection into text and timing", () => {
		const range = resolveTranscriptTokenRange({
			track: track(),
			selection: {
				anchor: { cueIndex: 0, tokenIndex: 2 },
				focus: { cueIndex: 0, tokenIndex: 3 },
			},
		});

		expect(range).toMatchObject({
			startTime: 2,
			endTime: 4,
			text: "错字",
		});
	});

	test("does not resolve selections that cross cue boundaries", () => {
		expect(
			resolveTranscriptTokenRange({
				track: track(),
				selection: {
					anchor: { cueIndex: 0, tokenIndex: 2 },
					focus: { cueIndex: 1, tokenIndex: 0 },
				},
			}),
		).toBeNull();
	});

	test("edits selected tokens without changing timing", () => {
		const result = editTranscriptSelection({
			track: track(),
			selection: {
				anchor: { cueIndex: 0, tokenIndex: 2 },
				focus: { cueIndex: 0, tokenIndex: 2 },
			},
			text: "对",
		});

		expect(result.cues[0]?.text).toBe("这是对字");
		expect(result.cues[0]?.tokens?.[2]).toMatchObject({
			text: "对",
			startTime: 2,
			duration: 1,
		});
	});

	test("cuts a transcript range and shifts later tokens left", () => {
		const result = cutTranscriptTrackByTimeRange({
			track: track(),
			startTime: 4,
			endTime: 6,
		});

		expect(result.cues.map((cue) => cue.text)).toEqual(["这是错字", "面"]);
		expect(result.cues[1]?.tokens?.[0]).toMatchObject({
			text: "面",
			startTime: 4,
		});
	});

	test("finds the active token at a playback time", () => {
		expect(
			findActiveTranscriptToken({ track: track(), timeSeconds: 2.4 }),
		).toEqual({ cueIndex: 0, tokenIndex: 2 });
	});
});
