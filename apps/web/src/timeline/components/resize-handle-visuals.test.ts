import { describe, expect, test } from "bun:test";

import { getResizeHandleVisualVariant } from "./resize-handle-visuals";

describe("getResizeHandleVisualVariant", () => {
	test("uses the prominent rolling variant for an adjacent edit-point hover", () => {
		expect(
			getResizeHandleVisualVariant({
				isRollingHighlighted: true,
			}),
		).toBe("rolling");
	});

	test("keeps the compact edge variant for normal trim handles", () => {
		expect(
			getResizeHandleVisualVariant({
				isRollingHighlighted: false,
			}),
		).toBe("edge");
	});
});
