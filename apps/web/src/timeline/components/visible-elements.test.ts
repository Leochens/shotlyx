import { describe, expect, test } from "bun:test";
const { getVisibleTimelineElements } = await import("./visible-elements");

function buildElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}) {
	return { id, startTime, duration };
}

const timeToPixels = (time: number) => time * 50;

describe("getVisibleTimelineElements", () => {
	test("returns all elements before the viewport is measured", () => {
		const elements = [
			buildElement({ id: "visible", startTime: 0, duration: 1 }),
			buildElement({ id: "far-away", startTime: 100, duration: 1 }),
		];

		expect(
			getVisibleTimelineElements({
				elements,
				scrollLeft: 0,
				viewportWidth: 0,
				timeToPixels,
			}).map((element) => element.id),
		).toEqual(["visible", "far-away"]);
	});

	test("keeps elements intersecting the viewport plus overscan", () => {
		const elements = [
			buildElement({ id: "before", startTime: 0, duration: 0.8 }),
			buildElement({ id: "overscan-left", startTime: 1.8, duration: 0.4 }),
			buildElement({ id: "visible", startTime: 6, duration: 1.6 }),
			buildElement({ id: "overscan-right", startTime: 10.4, duration: 1.6 }),
			buildElement({ id: "after", startTime: 12, duration: 1 }),
		];

		expect(
			getVisibleTimelineElements({
				elements,
				scrollLeft: 150,
				viewportWidth: 300,
				timeToPixels,
				overscanPx: 100,
			}).map((element) => element.id),
		).toEqual(["overscan-left", "visible", "overscan-right"]);
	});

	test("keeps explicitly pinned elements even when they are off-screen", () => {
		const elements = [
			buildElement({ id: "visible", startTime: 6, duration: 1.6 }),
			buildElement({ id: "dragged", startTime: 18, duration: 1.6 }),
		];

		expect(
			getVisibleTimelineElements({
				elements,
				scrollLeft: 150,
				viewportWidth: 300,
				timeToPixels,
				overscanPx: 0,
				pinnedElementIds: new Set(["dragged"]),
			}).map((element) => element.id),
		).toEqual(["visible", "dragged"]);
	});
});
