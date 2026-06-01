import { describe, expect, test } from "bun:test";
import { selectAnimatedImageFrameIndex } from "../image-node";

describe("animated image frame selection", () => {
	test("selects frames by looping local source time", () => {
		const durations = [0.1, 0.2, 0.1];

		expect(
			selectAnimatedImageFrameIndex({
				frameDurationsSeconds: durations,
				localTimeSeconds: 0,
			}),
		).toBe(0);
		expect(
			selectAnimatedImageFrameIndex({
				frameDurationsSeconds: durations,
				localTimeSeconds: 0.11,
			}),
		).toBe(1);
		expect(
			selectAnimatedImageFrameIndex({
				frameDurationsSeconds: durations,
				localTimeSeconds: 0.31,
			}),
		).toBe(2);
		expect(
			selectAnimatedImageFrameIndex({
				frameDurationsSeconds: durations,
				localTimeSeconds: 0.45,
			}),
		).toBe(0);
	});
});
