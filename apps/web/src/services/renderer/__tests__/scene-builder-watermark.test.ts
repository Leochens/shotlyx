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
const { TextNode } = await import("@/services/renderer/nodes/text-node");
const { VideoNode } = await import("@/services/renderer/nodes/video-node");

function time(value: number): MediaTime {
	return value as unknown as MediaTime;
}

function emptyTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			type: "video",
			name: "Main",
			elements: [],
			muted: false,
			hidden: false,
		},
		overlay: [],
		audio: [],
	};
}

function imageAsset(): MediaAsset {
	return {
		id: "logo",
		name: "Logo",
		type: "image",
		file: new File(["logo"], "logo.png", { type: "image/png" }),
		url: "blob:logo",
		width: 320,
		height: 180,
	};
}

function videoAsset(): MediaAsset {
	return {
		id: "bug",
		name: "Animated logo",
		type: "video",
		file: new File(["video"], "bug.mp4", { type: "video/mp4" }),
		url: "blob:bug",
		width: 320,
		height: 180,
		duration: 1,
		fps: 30,
	};
}

describe("scene builder watermark", () => {
	test("adds a project text watermark without timeline tracks", () => {
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: emptyTracks(),
			mediaAssets: [],
			duration: time(120_000),
			background: { type: "color", color: "transparent" },
			watermark: {
				enabled: true,
				type: "text",
				text: "Shotlyx",
				positionX: 120,
				positionY: -80,
				scale: 0.7,
				rotate: 8,
				opacity: 0.5,
				fontSize: 6,
				color: "#ffffff",
				fontFamily: "Arial",
			},
		});

		const watermarkNode = scene.children.find(
			(child): child is TextNode => child instanceof TextNode,
		);

		expect(watermarkNode?.params.name).toBe("Global watermark");
		expect(watermarkNode?.params.duration).toBe(time(120_000));
		expect(watermarkNode?.params.params).toMatchObject({
			content: "Shotlyx",
			"transform.positionX": 120,
			"transform.positionY": -80,
			"transform.scaleX": 0.7,
			"transform.scaleY": 0.7,
			"transform.rotate": 8,
			opacity: 0.5,
		});
	});

	test("adds project-global subtitles without timeline subtitle elements", () => {
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: emptyTracks(),
			mediaAssets: [],
			duration: time(360_000),
			background: { type: "color", color: "transparent" },
			subtitles: {
				enabled: true,
				revealMode: "line",
				lineBreakMode: "page",
				maxCharsPerLine: 30,
				cues: [
					{
						text: "全局字幕不占时间线轨道",
						startTime: 0,
						duration: 3,
					},
				],
			},
		});

		const subtitleNode = scene.children.find(
			(child): child is TextNode =>
				child instanceof TextNode &&
				child.params.params["subtitle.role"] === "project-global",
		);

		expect(subtitleNode?.params.name).toBe("全局字幕");
		expect(subtitleNode?.params.type).toBe("subtitle");
		expect(subtitleNode?.params.duration).toBe(time(360_000));
		expect(subtitleNode?.params.cues).toHaveLength(1);
	});

	test("stacks multiple project-global subtitle tracks", () => {
		const scene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: emptyTracks(),
			mediaAssets: [],
			duration: time(360_000),
			background: { type: "color", color: "transparent" },
			subtitles: {
				enabled: true,
				revealMode: "line",
				lineBreakMode: "page",
				maxCharsPerLine: 30,
				cues: [],
				tracks: [
					{
						id: "track:v1",
						label: "V1",
						sourceTrackId: "v1",
						cues: [{ text: "第一轨", startTime: 0, duration: 3 }],
					},
					{
						id: "track:v2",
						label: "V2",
						sourceTrackId: "v2",
						cues: [{ text: "第二轨", startTime: 0, duration: 3 }],
					},
				],
			},
		});

		const subtitleNodes = scene.children.filter(
			(child): child is TextNode =>
				child instanceof TextNode &&
				child.params.params["subtitle.role"] === "project-global",
		);

		expect(subtitleNodes.map((node) => node.params.name)).toEqual(["V1", "V2"]);
		expect(
			subtitleNodes[1]?.params.params["transform.positionY"] as number,
		).toBeLessThan(
			subtitleNodes[0]?.params.params["transform.positionY"] as number,
		);
	});

	test("adds image and video watermarks from media assets", () => {
		const imageScene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: emptyTracks(),
			mediaAssets: [imageAsset()],
			duration: time(240_000),
			background: { type: "color", color: "transparent" },
			watermark: {
				enabled: true,
				type: "image",
				mediaId: "logo",
				positionX: 640,
				positionY: 360,
				scale: 0.4,
				rotate: 0,
				opacity: 0.8,
			},
		});
		const imageNode = imageScene.children.find(
			(child): child is ImageNode => child instanceof ImageNode,
		);
		expect(imageNode?.params.duration).toBe(time(240_000));
		expect(imageNode?.params.timeOffset).toBe(time(0));
		expect(imageNode?.params.transform.position).toEqual({ x: 640, y: 360 });

		const videoScene = buildScene({
			canvasSize: { width: 1920, height: 1080 },
			tracks: emptyTracks(),
			mediaAssets: [videoAsset()],
			duration: time(240_000),
			background: { type: "color", color: "transparent" },
			watermark: {
				enabled: true,
				type: "video",
				mediaId: "bug",
				positionX: -640,
				positionY: -360,
				scale: 0.3,
				rotate: 15,
				opacity: 0.7,
			},
		});
		const videoNode = videoScene.children.find(
			(child): child is VideoNode => child instanceof VideoNode,
		);
		expect(videoNode?.params.duration).toBe(time(240_000));
		expect(videoNode?.params.timeOffset).toBe(time(0));
		expect(videoNode?.params.transform.rotate).toBe(15);
	});
});
