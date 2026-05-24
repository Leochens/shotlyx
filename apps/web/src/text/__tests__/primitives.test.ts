/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, shotlyx/prefer-object-params -- Test uses a compact canvas context stub. */
import { describe, expect, mock, test } from "bun:test";
import type { MeasuredTextLayout } from "../primitives";

mock.module("@/wasm", () => ({
	TICKS_PER_SECOND: 120_000,
	ZERO_MEDIA_TIME: 0,
	mediaTime: ({ ticks }: { ticks: number }) => Math.round(ticks),
	mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
		Math.round(seconds * 120_000),
}));

describe("text primitives", () => {
	test("draws karaoke highlight from the visual start of each measured line", async () => {
		const { drawMeasuredTextHighlight } = await import("../primitives");
		const drawCalls: Array<{ text: string; x: number; y: number }> = [];
		const ctx = {
			fillText: (text: string, x: number, y: number) => {
				drawCalls.push({ text, x, y });
			},
		} as unknown as CanvasRenderingContext2D;
		const layout = {
			fontString: "bold 40px Arial",
			letterSpacing: 0,
			textAlign: "center",
			lineHeightPx: 48,
			lines: ["我吃了", "一个苹果"],
			lineMetrics: [{ width: 120 }, { width: 160 }],
			block: { visualCenterOffset: 24, height: 96, maxWidth: 160 },
		} as MeasuredTextLayout;

		drawMeasuredTextHighlight({
			ctx,
			layout,
			highlightText: "我吃了\n一",
			textColor: "#22d3ee",
		});

		expect(drawCalls).toEqual([
			{ text: "我吃了", x: -60, y: -24 },
			{ text: "一", x: -80, y: 24 },
		]);
	});
});
