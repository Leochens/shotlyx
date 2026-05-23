/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Tests use numeric MediaTime values for deterministic subtitle math. */
import { describe, expect, test } from "bun:test";
import type { SubtitleElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import {
	getSubtitleSourceTimeSeconds,
	resolveSubtitleTextAtTime,
} from "@/subtitles/layer";

const TICKS_PER_SECOND = 90_000;

function ticks(seconds: number): MediaTime {
	return Math.round(seconds * TICKS_PER_SECOND) as unknown as MediaTime;
}

function makeElement(
	overrides: Partial<SubtitleElement> = {},
): SubtitleElement {
	return {
		id: "subtitle-layer-1",
		type: "subtitle",
		name: "Subtitle Layer",
		startTime: ticks(0),
		duration: ticks(60),
		trimStart: ticks(0),
		trimEnd: ticks(0),
		params: {
			content: "",
			fontSize: 5,
			fontFamily: "Arial",
			color: "#ffffff",
			textAlign: "center",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			letterSpacing: 0,
			lineHeight: 1.2,
			"background.enabled": false,
			"background.color": "#000000",
			"background.cornerRadius": 8,
			"background.paddingX": 22,
			"background.paddingY": 24,
			"background.offsetX": 0,
			"background.offsetY": 0,
			"transform.positionX": 0,
			"transform.positionY": 280,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
			blendMode: "normal",
		},
		cues: [],
		revealMode: "token",
		...overrides,
	};
}

describe("subtitle layer timing", () => {
	test("maps a ripple-joined right subtitle clip back to source time", () => {
		const element = makeElement({
			startTime: ticks(20),
			duration: ticks(30),
			trimStart: ticks(30),
			revealMode: "full",
			cues: [
				{
					text: "前面一句",
					startTime: 18,
					duration: 2,
				},
				{
					text: "后面接上",
					startTime: 31.5,
					duration: 2.5,
				},
			],
		});

		expect(
			getSubtitleSourceTimeSeconds({
				element,
				timelineTime: ticks(22),
			}),
		).toBe(32);
		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(22),
			})?.text,
		).toBe("后面接上");
	});

	test("reveals CJK text one token at a time inside a single subtitle element", () => {
		const element = makeElement({
			cues: [
				{
					text: "今天我们",
					startTime: 0,
					duration: 2,
					tokens: [
						{ text: "今", startTime: 0, duration: 0.5 },
						{ text: "天", startTime: 0.5, duration: 0.5 },
						{ text: "我", startTime: 1, duration: 0.5 },
						{ text: "们", startTime: 1.5, duration: 0.5 },
					],
				},
			],
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(0.25),
				revealMode: "token",
			})?.text,
		).toBe("今");
		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(1.1),
				revealMode: "token",
			})?.text,
		).toBe("今天我");
	});
});
