import { describe, expect, test } from "bun:test";
import { buildPixelatePass, pixelateEffectDefinition } from "../pixelate";

describe("pixelate effect definition", () => {
	test("defines the mosaic effect metadata", () => {
		expect(pixelateEffectDefinition.type).toBe("pixelate");
		expect(pixelateEffectDefinition.name).toBe("Mosaic");
		expect(
			pixelateEffectDefinition.params.some(
				(param) => param.key === "blockSize",
			),
		).toBe(true);
	});

	test("clamps block size into a usable mosaic shader pass", () => {
		expect(buildPixelatePass({ blockSize: -4 }).uniforms.u_blockSize).toBe(1);
		expect(buildPixelatePass({ blockSize: 512 }).uniforms.u_blockSize).toBe(
			240,
		);
	});

	test("resolves a pixelate shader pass from effect params", () => {
		const passes = pixelateEffectDefinition.renderer.buildPasses?.({
			effectParams: { blockSize: 24 },
			width: 1920,
			height: 1080,
		});

		expect(passes).toEqual([
			{
				shader: "pixelate",
				uniforms: {
					u_blockSize: 24,
				},
			},
		]);
	});
});
