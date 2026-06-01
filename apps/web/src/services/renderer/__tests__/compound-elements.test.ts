import { describe, expect, mock, test } from "bun:test";
import { wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm";
import type { SceneTracks, VideoElement } from "@/timeline";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const { buildScene } = await import("../scene-builder");
const { VideoNode } = await import("../nodes/video-node");
const { mediaTimeFromSeconds, ZERO_MEDIA_TIME } = await import("@/wasm");

function seconds(value: number): MediaTime {
	return mediaTimeFromSeconds({ seconds: value });
}

function videoElement({
	id,
	mediaId,
	startTime,
	duration,
}: {
	id: string;
	mediaId: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId,
		startTime: seconds(startTime),
		duration: seconds(duration),
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		sourceDuration: seconds(duration),
		params: {},
	};
}

function mediaAsset({ id }: { id: string }) {
	return {
		id,
		name: id,
		type: "video" as const,
		file: new File(["fake"], `${id}.mp4`, { type: "video/mp4" }),
		url: `blob:${id}`,
		width: 1920,
		height: 1080,
		duration: 10,
		fps: 30,
		hasAudio: true,
	};
}

function buildTracks(): SceneTracks {
	const first = videoElement({
		id: "first",
		mediaId: "media-1",
		startTime: 0,
		duration: 2,
	});
	const second = videoElement({
		id: "second",
		mediaId: "media-2",
		startTime: 2,
		duration: 3,
	});

	return {
		overlay: [],
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					...first,
					id: "compound",
					name: "Compound clip",
					startTime: seconds(5),
					duration: seconds(5),
					trimStart: ZERO_MEDIA_TIME,
					trimEnd: ZERO_MEDIA_TIME,
					compound: {
						elements: [
							{ ...first, startTime: ZERO_MEDIA_TIME },
							{ ...second, startTime: seconds(2) },
						],
					},
				},
			],
		},
		audio: [],
	};
}

describe("buildScene compound elements", () => {
	test("expands compound clips into their child video nodes", () => {
		const scene = buildScene({
			background: { type: "color", color: "transparent" },
			canvasSize: { width: 1920, height: 1080 },
			duration: seconds(10),
			mediaAssets: [
				mediaAsset({ id: "media-1" }),
				mediaAsset({ id: "media-2" }),
			],
			tracks: buildTracks(),
		});

		expect(scene.children).toHaveLength(2);
		expect(scene.children[0]).toBeInstanceOf(VideoNode);
		expect(scene.children[1]).toBeInstanceOf(VideoNode);
		expect(scene.children.map((node) => node.params)).toMatchObject([
			{ mediaId: "media-1", timeOffset: seconds(5), duration: seconds(2) },
			{ mediaId: "media-2", timeOffset: seconds(7), duration: seconds(3) },
		]);
	});
});
