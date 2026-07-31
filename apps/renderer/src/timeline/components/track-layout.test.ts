import { describe, expect, test } from "bun:test";
import {
	getTimelineDensity,
	getTrackGap,
	getTrackHeight,
	getTotalTracksHeight,
} from "./track-layout";

describe("timeline track layout density", () => {
	test("maps viewport height to timeline density", () => {
		expect(getTimelineDensity({ viewportHeight: 120 })).toBe("compact");
		expect(getTimelineDensity({ viewportHeight: 240 })).toBe("normal");
		expect(getTimelineDensity({ viewportHeight: 520 })).toBe("expanded");
	});

	test("uses denser heights and gaps in compact mode", () => {
		const tracks = [
			{ type: "video" },
			{ type: "text" },
			{ type: "audio" },
		] as const;

		const compactTotal = getTotalTracksHeight({
			tracks,
			density: "compact",
		});
		const normalTotal = getTotalTracksHeight({ tracks, density: "normal" });
		const expandedTotal = getTotalTracksHeight({
			tracks,
			density: "expanded",
		});

		expect(getTrackHeight({ type: "video", density: "compact" })).toBeLessThan(
			getTrackHeight({ type: "video", density: "normal" }),
		);
		expect(getTrackGap({ density: "compact" })).toBeLessThan(
			getTrackGap({ density: "normal" }),
		);
		expect(compactTotal).toBeLessThan(normalTotal);
		expect(expandedTotal).toBeGreaterThan(normalTotal);
	});

	test("uses compact density when many tracks would not fit the viewport", () => {
		const tracks = Array.from({ length: 22 }, () => ({
			type: "audio" as const,
		}));

		expect(getTimelineDensity({ viewportHeight: 520, tracks })).toBe("compact");
	});
});
