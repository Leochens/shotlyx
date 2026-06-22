import { describe, expect, test } from "bun:test";

import {
	getResizeHandleRevealPolicy,
	getResizeHandleVisualVariant,
} from "./resize-handle-visuals";

describe("getResizeHandleVisualVariant", () => {
	test("uses a compact edge highlight for an adjacent edit-point hover", () => {
		expect(
			getResizeHandleVisualVariant({
				isRollingHighlighted: true,
			}),
		).toBe("rolling-edge");
	});

	test("keeps the compact edge variant for normal trim handles", () => {
		expect(
			getResizeHandleVisualVariant({
				isRollingHighlighted: false,
			}),
		).toBe("edge");
	});
});

describe("getResizeHandleRevealPolicy", () => {
	test("hides the opposite edge while an adjacent edit point is highlighted", () => {
		expect(
			getResizeHandleRevealPolicy({
				isSelected: true,
				isHighlighted: false,
				isPeerHighlighted: true,
			}),
		).toBe("hidden");
	});

	test("forces only the highlighted edit-point edge visible", () => {
		expect(
			getResizeHandleRevealPolicy({
				isSelected: false,
				isHighlighted: true,
				isPeerHighlighted: false,
			}),
		).toBe("force");
	});
});
