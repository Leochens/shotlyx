/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixtures use branded MediaTime as raw tick numbers. */
import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { buildScene } from "@/services/renderer/scene-builder";
import { ImageNode } from "@/services/renderer/nodes/image-node";
import type { SceneTracks } from "@/timeline";
import type { MediaTime } from "@/wasm/media-time";

function time(value: number): MediaTime {
	return value as unknown as MediaTime;
}

function imageAsset({ file }: { file: File }): MediaAsset {
	return {
		id: "asset-1",
		name: file.name,
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
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: tracks(),
			mediaAssets: [
				imageAsset({
					file: new File([new Uint8Array([1])], "Reaction.gif", {
						type: "image/gif",
					}),
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
		expect(imageNode?.params.maxSourceSize).toBe(2048);
	});
});
