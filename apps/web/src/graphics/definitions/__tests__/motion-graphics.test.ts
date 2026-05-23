import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createCanvas, Path2D as CanvasPath2D } from "@napi-rs/canvas";
import { motionGraphicDefinitions } from "../motion-graphics";

const originalPath2D = globalThis.Path2D;

beforeEach(() => {
	globalThis.Path2D = CanvasPath2D;
});

afterEach(() => {
	globalThis.Path2D = originalPath2D;
});

describe("motion graphic definitions", () => {
	test("render at tiny timeline thumbnail size without invalid rounded rect radii", () => {
		for (const definition of motionGraphicDefinitions) {
			const canvas = createCanvas(20, 20);
			const ctx = canvas.getContext("2d");

			expect(() =>
				definition.render({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
					ctx: ctx as unknown as CanvasRenderingContext2D,
					params: Object.fromEntries(
						definition.params.map((param) => [param.key, param.default]),
					),
					width: 20,
					height: 20,
				}),
			).not.toThrow();
		}
	});
});
