import { describe, expect, test } from "bun:test";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import {
	buildCalloutGraphicElement,
	buildMosaicEffectElement,
} from "../presets";

describe("callout presets", () => {
	test("builds an animated arrow graphic element for a subtitle-timed callout", () => {
		const element = buildCalloutGraphicElement({
			kind: "arrow",
			startTimeSeconds: 3.25,
			durationSeconds: 1.5,
			color: "#facc15",
			positionX: 120,
			positionY: -80,
			scaleX: 0.9,
			scaleY: 0.55,
			rotate: -18,
		});

		expect(element.type).toBe("graphic");
		expect(element.definitionId).toBe("callout-arrow");
		expect(element.name).toBe("Arrow callout");
		expect(element.startTime).toBe(3.25 * MEDIA_TIME_TICKS_PER_SECOND);
		expect(element.duration).toBe(1.5 * MEDIA_TIME_TICKS_PER_SECOND);
		expect(element.params.fill).toBe("#facc15");
		expect(element.params.stroke).toBe("#facc15");
		expect(element.params["transform.positionX"]).toBe(120);
		expect(element.params["transform.positionY"]).toBe(-80);
		expect(element.params["transform.scaleX"]).toBe(0.9);
		expect(element.params["transform.scaleY"]).toBe(0.55);
		expect(element.params["transform.rotate"]).toBe(-18);
		expect(element.animations?.opacity).toBeDefined();
		expect(element.animations?.["transform.scaleX"]).toBeDefined();
		expect(element.animations?.["transform.scaleY"]).toBeDefined();
	});

	test.each([
		["box", "callout-box", "Box callout"],
		["circle", "callout-circle", "Circle callout"],
	] as const)(
		"builds an animated %s callout graphic element",
		(kind, definitionId, name) => {
			const element = buildCalloutGraphicElement({
				kind,
				startTimeSeconds: 0,
				durationSeconds: 2,
			});

			expect(element.type).toBe("graphic");
			expect(element.definitionId).toBe(definitionId);
			expect(element.name).toBe(name);
			expect(element.params.fill).toBe("rgba(250, 204, 21, 0.08)");
			expect(element.params.stroke).toBe("#facc15");
			expect(element.params.strokeWidth).toBeGreaterThan(0);
			expect(element.animations?.opacity).toBeDefined();
		},
	);

	test("builds a bounded mosaic scene effect element", () => {
		const element = buildMosaicEffectElement({
			startTimeSeconds: 4,
			durationSeconds: 0.85,
			blockSize: 48,
		});

		expect(element.type).toBe("effect");
		expect(element.effectType).toBe("pixelate");
		expect(element.name).toBe("Mosaic effect");
		expect(element.startTime).toBe(4 * MEDIA_TIME_TICKS_PER_SECOND);
		expect(element.duration).toBe(0.85 * MEDIA_TIME_TICKS_PER_SECOND);
		expect(element.params.blockSize).toBe(48);
	});
});
