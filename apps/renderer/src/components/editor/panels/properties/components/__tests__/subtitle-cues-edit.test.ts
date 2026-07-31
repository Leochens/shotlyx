import { describe, expect, mock, test } from "bun:test";
import {
	applySubtitleCueTextEdits,
	syncLinkedSubtitleAssetFromCues,
} from "../subtitle-cues-edit";

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

	test("syncs linked subtitle asset file from edited layer cues", async () => {
		let updateCall: {
			projectId: string;
			id: string;
			updates: { file: File };
		} | null = null;
		const updateMediaAsset = mock(
			async (call: NonNullable<typeof updateCall>) => {
				updateCall = call;
				return {
					id: "subtitle-asset",
					name: "captions.srt",
				};
			},
		);
		const editor = {
			project: {
				getActive: () => ({
					metadata: { id: "project-1" },
				}),
			},
			media: {
				getAssets: () => [
					{
						id: "subtitle-asset",
						name: "captions.srt",
						type: "subtitle",
						file: new File(["old"], "captions.srt", {
							type: "application/x-subrip",
						}),
					},
				],
				updateMediaAsset,
			},
		};

		await syncLinkedSubtitleAssetFromCues({
			editor,
			element: {
				params: {
					"subtitle.assetId": "subtitle-asset",
					"subtitle.assetName": "captions.srt",
				},
			},
			cues: [
				{
					text: "新字幕一",
					startTime: 0,
					duration: 1.25,
				},
				{
					text: "新字幕二",
					startTime: 1.25,
					duration: 2,
				},
			],
		});

		expect(updateMediaAsset).toHaveBeenCalledTimes(1);
		if (!updateCall) {
			throw new Error("Expected linked subtitle asset to be updated");
		}
		expect(updateCall).toMatchObject({
			projectId: "project-1",
			id: "subtitle-asset",
		});
		expect(updateCall.updates.file.name).toBe("captions.srt");
		expect(await updateCall.updates.file.text()).toBe(
			[
				"1",
				"00:00:00,000 --> 00:00:01,250",
				"新字幕一",
				"",
				"2",
				"00:00:01,250 --> 00:00:03,250",
				"新字幕二",
				"",
			].join("\n"),
		);
	});
});
