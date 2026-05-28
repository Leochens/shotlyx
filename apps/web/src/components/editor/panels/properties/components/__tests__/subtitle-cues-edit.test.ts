import { describe, expect, test } from "bun:test";
import { applySubtitleCueTextEdits } from "../subtitle-cues-edit";

describe("applySubtitleCueTextEdits", () => {
	test("updates cue text and clears stale tokens only for edited cues", () => {
		const cues = [
			{
				text: "旧字幕一",
				startTime: 0,
				duration: 1.5,
				tokens: [
					{ text: "旧", startTime: 0, duration: 0.3 },
					{ text: "字幕", startTime: 0.3, duration: 0.6 },
				],
			},
			{
				text: "字幕二",
				startTime: 1.5,
				duration: 2,
				tokens: [{ text: "字幕二", startTime: 1.5, duration: 1 }],
			},
		];

		const nextCues = applySubtitleCueTextEdits({
			cues,
			texts: ["新字幕一", "字幕二"],
		});

		expect(nextCues[0]).toMatchObject({
			text: "新字幕一",
			startTime: 0,
			duration: 1.5,
		});
		expect(nextCues[0]?.tokens).toBeUndefined();
		expect(nextCues[1]?.tokens).toEqual(cues[1]?.tokens);
	});
});
