/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- The descriptor builder only reads renderer dimensions; the full renderer class requires browser OffscreenCanvas. */
import { beforeAll, describe, expect, mock, test } from "bun:test";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { registerDefaultEffects } = await import("@/effects");
const { EffectLayerNode } = await import("../nodes/effect-layer-node");
const { RootNode } = await import("../nodes/root-node");
const { buildFrameDescriptor } = await import("./frame-descriptor");
const { resolveRenderTree } = await import("../resolve");

beforeAll(() => {
	registerDefaultEffects();
});

describe("buildFrameDescriptor", () => {
	test("describes standalone effects with a transformable scene region", async () => {
		const root = new RootNode({ duration: 10 });
		root.add(
			new EffectLayerNode({
				effectType: "pixelate",
				effectParams: { blockSize: 32 },
				timeOffset: 0,
				duration: 10,
				transform: {
					position: { x: 120, y: -40 },
					scaleX: 0.25,
					scaleY: 0.2,
					rotate: 15,
				},
			}),
		);

		const renderer = { width: 1920, height: 1080 };
		await resolveRenderTree({
			node: root,
			renderer: renderer as never,
			time: 1,
		});
		const { frame } = await buildFrameDescriptor({
			node: root,
			renderer: renderer as never,
		});

		expect(frame.items).toEqual([
			{
				type: "sceneEffect",
				effectPassGroups: [
					[
						{
							shader: "pixelate",
							uniforms: { u_blockSize: 32 },
						},
					],
				],
				transform: {
					centerX: 1080,
					centerY: 500,
					width: 480,
					height: 216,
					rotationDegrees: 15,
					flipX: false,
					flipY: false,
				},
			},
		]);
	});
});
