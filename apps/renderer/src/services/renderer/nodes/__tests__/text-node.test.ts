/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, shotlyx/prefer-object-params -- Test builds a compact renderer node/context stub. */
import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";
import type { MeasuredTextElement } from "@/text/measure-element";
import type { ResolvedTextNodeState, TextNodeParams } from "../text-node";

mock.module("@/wasm", () => wasmMock);

function makeMeasuredText(): MeasuredTextElement {
	return {
		fontString: "bold 40px Arial",
		letterSpacing: 0,
		lineHeightPx: 48,
		fontSizeRatio: 1,
		scaledFontSize: 40,
		textAlign: "center",
		textDecoration: "none",
		lines: ["我吃了一个苹果"],
		lineMetrics: [{ width: 240 } as TextMetrics],
		block: { visualCenterOffset: 0, height: 48, maxWidth: 240 },
		resolvedBackground: {
			enabled: false,
			color: "transparent",
			paddingX: 0,
			paddingY: 0,
			offsetX: 0,
			offsetY: 0,
			cornerRadius: 0,
		},
		visualRect: { left: -120, top: -24, width: 240, height: 48 },
	};
}

describe("text node rendering", () => {
	test("draws subtitle karaoke highlight from resolved frame state", async () => {
		const { TextNode, renderTextToContext } = await import("../text-node");
		let fillStyle = "";
		const drawCalls: Array<{ text: string; x: number; fillStyle: string }> = [];
		const ctx = {
			save: () => {},
			restore: () => {},
			translate: () => {},
			scale: () => {},
			rotate: () => {},
			fillText: (text: string, x: number) => {
				drawCalls.push({ text, x, fillStyle });
			},
			get fillStyle() {
				return fillStyle;
			},
			set fillStyle(value: string) {
				fillStyle = value;
			},
		} as unknown as CanvasRenderingContext2D;
		const node = new TextNode({
			type: "subtitle",
			params: {},
			canvasCenter: { x: 0, y: 0 },
			canvasHeight: 1080,
		} as TextNodeParams);
		node.resolved = {
			transform: {
				position: { x: 0, y: 0 },
				scaleX: 1,
				scaleY: 1,
				rotate: 0,
			},
			opacity: 1,
			textColor: "#ffffff",
			backgroundColor: "transparent",
			effectPasses: [],
			measuredText: makeMeasuredText(),
			highlightText: "我吃了",
			highlightColor: "#22d3ee",
		} as ResolvedTextNodeState;

		renderTextToContext({ node, ctx });

		expect(drawCalls).toEqual([
			{ text: "我吃了一个苹果", x: 0, fillStyle: "#ffffff" },
			{ text: "我吃了", x: -120, fillStyle: "#22d3ee" },
		]);
	});
});
