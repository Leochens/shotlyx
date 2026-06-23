import { describe, expect, mock, test } from "bun:test";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { buildProjectSubtitleElements } = await import("./project-subtitles");

describe("project subtitles", () => {
	test("applies project-level subtitle style params to rendered subtitle elements", () => {
		const elements = buildProjectSubtitleElements({
			canvasSize: { width: 1920, height: 1080 },
			duration: 120_000,
			subtitles: {
				enabled: true,
				cues: [],
				revealMode: "karaoke",
				lineBreakMode: "page",
				maxCharsPerLine: 24,
				styleParams: {
					color: "#ff3366",
					fontSize: 5,
					"transform.positionY": 500,
					"subtitle.highlightColor": "#22d3ee",
				},
				tracks: [
					{
						id: "track:one",
						label: "One",
						cues: [{ text: "第一轨", startTime: 0, duration: 1 }],
					},
					{
						id: "track:two",
						label: "Two",
						cues: [{ text: "第二轨", startTime: 0, duration: 1 }],
					},
				],
			},
		});

		expect(elements).toHaveLength(2);
		expect(elements[0]).toMatchObject({
			revealMode: "karaoke",
			params: {
				color: "#ff3366",
				fontSize: 5,
				"transform.positionY": 500,
				"subtitle.highlightColor": "#22d3ee",
				"subtitle.maxCharsPerLine": 24,
				"subtitle.lineBreakMode": "page",
			},
		});
		expect(elements[1]?.params["transform.positionY"]).toBeCloseTo(424.4);
	});
});
