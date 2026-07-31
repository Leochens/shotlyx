/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixtures use branded MediaTime as raw tick numbers. */
import { describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { wasmMock } from "@/test/wasm-mock";
import type { SceneTracks } from "@/timeline";
import type { MediaTime } from "@/wasm/media-time";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { buildScene } = await import("@/services/renderer/scene-builder");
const { ImageNode } = await import("@/services/renderer/nodes/image-node");

function time(value: number): MediaTime {
	return value as unknown as MediaTime;
}

function imageAsset({
	file,
	name = file.name,
}: {
	file: File;
	name?: string;
}): MediaAsset {
	return {
		id: "asset-1",
		name,
		type: "image",
		file,
		url: "blob:asset-1",
		width: 320,
		height: 240,
	};
}

function tracks(): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [
				{
					id: "element-1",
					type: "image",
					name: "Reaction.gif",
					mediaId: "asset-1",
					startTime: time(0),
					duration: time(120_000),
					trimStart: time(0),
					trimEnd: time(0),
					hidden: false,
					params: {
						"transform.positionX": 0,
						"transform.positionY": 0,
						"transform.scaleX": 1,
						"transform.scaleY": 1,
						"transform.rotate": 0,
						opacity: 1,
						blendMode: "normal",
					},
				},
			],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [],
	};
}

describe("scene builder animated images", () => {
	test("marks GIF image nodes as animated sources", () => {
		const file = new File([new Uint8Array([1])], "Reaction.gif", {
			type: "image/gif",
		});
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: tracks(),
			mediaAssets: [
				imageAsset({
					file,
				}),
			],
			duration: 120_000,
			background: { type: "color", color: "transparent" },
			isPreview: true,
		});

		const imageNode = scene.children.find(
			(child): child is ImageNode => child instanceof ImageNode,
		);

		expect(imageNode?.params.animated).toBe(true);
		expect(imageNode?.params.animatedMimeType).toBe("image/gif");
		expect(imageNode?.params.file).toBe(file);
		expect(imageNode?.params.maxSourceSize).toBe(2048);
	});

	test("marks GIF image nodes as animated when restored assets lose their file extension", () => {
		const file = new File([new Uint8Array([1])], "opfs-file");
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: tracks(),
			mediaAssets: [
				imageAsset({
					file,
					name: "Restored asset",
				}),
			],
			duration: 120_000,
			background: { type: "color", color: "transparent" },
			isPreview: true,
		});

		const imageNode = scene.children.find(
			(child): child is ImageNode => child instanceof ImageNode,
		);

		expect(imageNode?.params.animated).toBe(true);
		expect(imageNode?.params.animatedMimeType).toBe("image/gif");
		expect(imageNode?.params.file).toBe(file);
	});
});
