import { describe, expect, test } from "bun:test";
import { getTimelineFitZoom, getTimelineZoomMin } from "./zoom-utils";

const TICKS_PER_SECOND = 120_000;

describe("timeline zoom utils", () => {
	test("fits the full timeline with less empty padding than the minimum zoom", () => {
		const duration = 120 * TICKS_PER_SECOND;
		const containerWidth = 1200;

		const minZoom = getTimelineZoomMin({ duration, containerWidth });
		const fitZoom = getTimelineFitZoom({ duration, containerWidth });

		expect(fitZoom).toBeGreaterThan(minZoom);
	});
});
