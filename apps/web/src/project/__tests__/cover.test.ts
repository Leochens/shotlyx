/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixtures use branded MediaTime as raw tick numbers. */
import { describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { SceneTracks } from "@/timeline";
import type { MediaTime } from "@/wasm";

const { wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => wasmMock);

const {
	buildProjectCoverExportPlan,
	buildProjectCoverParams,
	getProjectDurationWithCover,
} = await import("@/project/cover");

function time(seconds: number): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
}

function imageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "cover",
		name: "Cover",
		type: "image",
		file: new File(["cover"], "cover.png", { type: "image/png" }),
		url: "blob:cover",
		width: 640,
		height: 480,
		...overrides,
	};
}

function tracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "video-1",
					type: "video",
					name: "Video",
					mediaId: "video",
					startTime: time(5),
					duration: time(5),
					trimStart: time(0),
					trimEnd: time(0),
					params: {},
				},
			],
		},
		overlay: [],
		audio: [
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				muted: false,
				elements: [
					{
						id: "audio-1",
						type: "audio",
						sourceType: "upload",
						name: "Music",
						mediaId: "music",
						startTime: time(0.5),
						duration: time(4),
						trimStart: time(0),
						trimEnd: time(0),
						params: {},
					},
				],
			},
		],
	};
}

describe("project cover export plan", () => {
	test("prepends a virtual cover and shifts every existing track", () => {
		const plan = buildProjectCoverExportPlan({
			canvasSize: { width: 1920, height: 1080 },
			cover: {
				enabled: true,
				mediaId: "cover",
				durationSeconds: 3,
				layout: { mode: "fill" },
			},
			mediaAssets: [imageAsset()],
			timelineDuration: time(10),
			tracks: tracks(),
		});

		expect(plan.coverApplied).toBe(true);
		expect(plan.coverDuration).toBe(time(3));
		expect(plan.duration).toBe(time(13));
		expect(plan.tracks.main.elements[0]?.startTime).toBe(time(8));
		expect(plan.tracks.audio[0]?.elements[0]?.startTime).toBe(time(3.5));

		const coverTrack = plan.tracks.overlay.find(
			(track) => track.id === "project-cover-track",
		);
		const coverElement = coverTrack?.elements[0];
		expect(coverElement).toMatchObject({
			id: "project-cover-element",
			type: "image",
			mediaId: "cover",
			startTime: time(0),
			duration: time(3),
		});
		expect(coverElement?.params["transform.scaleX"]).toBeCloseTo(4 / 3, 4);
		expect(coverElement?.params["transform.scaleY"]).toBeCloseTo(4 / 3, 4);
	});

	test("uses custom cover size relative to the renderer contain scale", () => {
		const params = buildProjectCoverParams({
			asset: imageAsset({ width: 1280, height: 720 }),
			canvasSize: { width: 1920, height: 1080 },
			cover: {
				enabled: true,
				mediaId: "cover",
				durationSeconds: 4,
				layout: { mode: "custom", width: 960, height: 540 },
			},
		});

		expect(params["transform.scaleX"]).toBeCloseTo(0.5, 4);
		expect(params["transform.scaleY"]).toBeCloseTo(0.5, 4);
	});

	test("adds cover duration to project metadata duration", () => {
		expect(
			getProjectDurationWithCover({
				timelineDuration: time(10),
				cover: {
					enabled: true,
					mediaId: "cover",
					durationSeconds: 3,
					layout: { mode: "fill" },
				},
			}),
		).toBe(time(13));
	});

	test("allows a 0.1 second cover duration", () => {
		const plan = buildProjectCoverExportPlan({
			canvasSize: { width: 1920, height: 1080 },
			cover: {
				enabled: true,
				mediaId: "cover",
				durationSeconds: 0.1,
				layout: { mode: "fill" },
			},
			mediaAssets: [imageAsset()],
			timelineDuration: time(10),
			tracks: tracks(),
		});

		expect(plan.coverDuration).toBe(time(0.1));
		expect(plan.duration).toBe(time(10.1));
	});
});
