import { describe, expect, test } from "bun:test";
import {
	buildMagnifyPass,
	getMagnifyAnimatedZoom,
	magnifyEffectDefinition,
} from "../magnify";

describe("magnify effect definition", () => {
	test("defines a magnifier effect with adjustable strength", () => {
		expect(magnifyEffectDefinition.type).toBe("magnify");
		expect(magnifyEffectDefinition.name).toBe("Magnifier");
		expect(
			magnifyEffectDefinition.params.some(
				(param) => param.key === "zoom" && param.label === "Strength",
			),
		).toBe(true);
		expect(
			magnifyEffectDefinition.params.find((param) => param.key === "shape"),
		).toMatchObject({
			label: "Shape",
			type: "select",
			default: "rect",
			keyframable: false,
			options: [
				{ value: "rect", label: "Rectangle" },
				{ value: "circle", label: "Circle" },
			],
		});
		expect(
			magnifyEffectDefinition.params.find(
				(param) => param.key === "fullscreen",
			),
		).toMatchObject({
			label: "Full Screen",
			type: "boolean",
			default: false,
			keyframable: false,
		});
	});

	test("eases zoom in and out over the standalone effect duration", () => {
		const duration = 1000;

		expect(
			getMagnifyAnimatedZoom({ targetZoom: 3, localTime: 0, duration }),
		).toBe(1);
		expect(
			getMagnifyAnimatedZoom({ targetZoom: 3, localTime: 500, duration }),
		).toBe(3);
		expect(
			getMagnifyAnimatedZoom({ targetZoom: 3, localTime: 1000, duration }),
		).toBe(1);
	});

	test("resolves a magnifier shader pass from effect params", () => {
		const passes = magnifyEffectDefinition.renderer.buildPasses?.({
			effectParams: { zoom: 2.5 },
			width: 1920,
			height: 1080,
			localTime: 540,
			duration: 1080,
		});

		expect(passes).toEqual([
			{
				shader: "magnify",
				uniforms: {
					u_center: [960, 540],
					u_zoom: 2.5,
				},
			},
		]);
		expect(buildMagnifyPass({ zoom: 99, center: [12, 34] })).toEqual({
			shader: "magnify",
			uniforms: {
				u_center: [12, 34],
				u_zoom: 8,
			},
		});
	});
});
