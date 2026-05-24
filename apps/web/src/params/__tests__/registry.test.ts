/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test builds a compact SubtitleElement fixture. */
import { describe, expect, mock, test } from "bun:test";
import type { SubtitleElement } from "@/timeline";

mock.module("@/wasm", () => ({
	TICKS_PER_SECOND: 120_000,
	ZERO_MEDIA_TIME: 0,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * 120_000),
}));

describe("element param registry", () => {
	test("exposes subtitle display controls and writes reveal mode to the layer", async () => {
		const {
			getElementParam,
			readElementParamValue,
			writeElementParamValue,
		} = await import("../registry");
		const element = {
			id: "subtitle-1",
			type: "subtitle",
			name: "Subtitles",
			startTime: 0,
			duration: 120_000,
			trimStart: 0,
			trimEnd: 0,
			params: {
				"subtitle.maxCharsPerLine": 18,
				"subtitle.lineBreakMode": "wrap",
				"subtitle.highlightColor": "#22d3ee",
			},
			cues: [],
			revealMode: "token",
		} as unknown as SubtitleElement;

		const revealModeParam = getElementParam({
			element,
			key: "subtitle.revealMode",
		});
		expect(revealModeParam).toMatchObject({
			label: "Display Mode",
			type: "select",
		});
		expect(
			revealModeParam
				? readElementParamValue({ element, param: revealModeParam })
				: null,
		).toBe("token");

		const updated =
			revealModeParam &&
			writeElementParamValue({
				element,
				param: revealModeParam,
				value: "karaoke",
			});
		expect(updated && "revealMode" in updated ? updated.revealMode : null).toBe(
			"karaoke",
		);
		expect(
			getElementParam({ element, key: "subtitle.maxCharsPerLine" }),
		).toMatchObject({
			label: "Max Chars / Line",
			type: "number",
		});
		expect(
			getElementParam({ element, key: "subtitle.lineBreakMode" }),
		).toMatchObject({
			label: "Line Overflow",
			type: "select",
		});
	});
});
