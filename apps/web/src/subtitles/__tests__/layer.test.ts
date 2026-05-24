/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Tests use numeric MediaTime values for deterministic subtitle math. */
import { describe, expect, test } from "bun:test";
import type { SubtitleElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import {
	buildRenderableTextElementFromSubtitle,
	getSubtitleSourceTimeSeconds,
	resolveSubtitleTextAtTime,
} from "@/subtitles/layer";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function ticks(seconds: number): MediaTime {
	return Math.round(
		seconds * MEDIA_TIME_TICKS_PER_SECOND,
	) as unknown as MediaTime;
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

	test("does not fake token timing when a cue has no timed tokens", () => {
		const element = makeElement({
			cues: [
				{
					text: "我吃了一个苹果",
					startTime: 0,
					duration: 2,
				},
			],
			revealMode: "token",
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(0.4),
				revealMode: "token",
			})?.text,
		).toBe("我吃了一个苹果");
	});

	test("reveals timed tokens as a prefix of the original text with punctuation", () => {
		const element = makeElement({
			cues: [
				{
					text: "好，我们在 TOI 试完之后。",
					startTime: 5,
					duration: 4,
					tokens: [
						{ text: "好", startTime: 5, duration: 0.2 },
						{ text: "我", startTime: 5.4, duration: 0.1 },
						{ text: "们", startTime: 5.5, duration: 0.1 },
						{ text: "在", startTime: 5.6, duration: 0.1 },
						{ text: "TOI", startTime: 6, duration: 0.4 },
						{ text: "试", startTime: 6.8, duration: 0.2 },
					],
				},
			],
			revealMode: "token",
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(5.45),
				revealMode: "token",
			})?.text,
		).toBe("好，我");
		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(6.05),
				revealMode: "token",
			})?.text,
		).toBe("好，我们在 TOI");
	});

	test("does not reveal a 5.49 second token at the 4 second 17 frame timecode", () => {
		const element = makeElement({
			cues: [
				{
					text: "好，我们在",
					startTime: 5.49,
					duration: 1,
					tokens: [
						{ text: "好", startTime: 5.49, duration: 0.24 },
						{ text: "我", startTime: 5.73, duration: 0.08 },
					],
				},
			],
			revealMode: "token",
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(4 + 17 / 30),
				revealMode: "token",
			}),
		).toBeNull();
	});

	test("line mode wraps long CJK captions by the configured character limit", () => {
		const element = makeElement({
			params: {
				...makeElement().params,
				"subtitle.maxCharsPerLine": 3,
				"subtitle.lineBreakMode": "wrap",
			},
			revealMode: "line",
			cues: [
				{
					text: "我吃了一个苹果",
					startTime: 0,
					duration: 3,
				},
			],
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(1),
			})?.text,
		).toBe("我吃了\n一个苹\n果");
	});

	test("page line break mode shows only the active wrapped line", () => {
		const element = makeElement({
			params: {
				...makeElement().params,
				"subtitle.maxCharsPerLine": 3,
				"subtitle.lineBreakMode": "page",
			},
			revealMode: "line",
			cues: [
				{
					text: "我吃了一个苹果",
					startTime: 0,
					duration: 6,
				},
			],
		});

		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(1),
			})?.text,
		).toBe("我吃了");
		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(2.5),
			})?.text,
		).toBe("一个苹");
		expect(
			resolveSubtitleTextAtTime({
				element,
				timelineTime: ticks(4.5),
			})?.text,
		).toBe("果");
	});

	test("karaoke mode keeps the full line visible while exposing highlighted prefix", () => {
		const element = makeElement({
			params: {
				...makeElement().params,
				"subtitle.maxCharsPerLine": 20,
				"subtitle.lineBreakMode": "wrap",
				"subtitle.highlightColor": "#22d3ee",
			},
			revealMode: "karaoke",
			cues: [
				{
					text: "我吃了一个苹果",
					startTime: 0,
					duration: 4,
					tokens: [
						{ text: "我", startTime: 0, duration: 0.2 },
						{ text: "吃", startTime: 0.8, duration: 0.2 },
						{ text: "了", startTime: 1.6, duration: 0.2 },
						{ text: "一", startTime: 2.4, duration: 0.2 },
					],
				},
			],
		});

		const resolved = resolveSubtitleTextAtTime({
			element,
			timelineTime: ticks(1.7),
		});
		expect(resolved?.text).toBe("我吃了一个苹果");
		expect(resolved?.highlightText).toBe("我吃了");
		expect(
			buildRenderableTextElementFromSubtitle({
				element,
				timelineTime: ticks(1.7),
			})?.params,
		).toMatchObject({
			content: "我吃了一个苹果",
			"subtitle.highlightText": "我吃了",
			"subtitle.highlightColor": "#22d3ee",
		});
	});
});
