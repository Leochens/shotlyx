import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCanvas, Path2D as CanvasPath2D } from "@napi-rs/canvas";
import { calloutGraphicDefinitions } from "../callouts";

const originalPath2D = globalThis.Path2D;

beforeEach(() => {
	globalThis.Path2D = CanvasPath2D;
});

afterEach(() => {
	globalThis.Path2D = originalPath2D;
});

describe("callout graphic definitions", () => {
	test.each([
		["callout-arrow", "Arrow"],
		["callout-box", "Callout Box"],
		["callout-circle", "Callout Circle"],
	] as const)("registers and renders %s", (definitionId, name) => {
		const definition = calloutGraphicDefinitions.find(
			(item) => item.id === definitionId,
		);
		expect(definition).toBeDefined();
		if (!definition) return;
		expect(definition.name).toBe(name);

		const canvas = createCanvas(64, 64);
		const ctx = canvas.getContext("2d");

		expect(() =>
			definition.render({
				// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
				ctx: ctx as unknown as CanvasRenderingContext2D,
				params: Object.fromEntries(
					definition.params.map((param) => [param.key, param.default]),
				),
				width: 64,
				height: 64,
			}),
		).not.toThrow();
	});
});
