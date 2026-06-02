import { describe, expect, test } from "bun:test";
import {
	buildShotSegmentsFromSceneCuts,
	buildVideoAssetProfile,
	planKeyframesForShots,
} from "../inspection";

describe("video asset inspection", () => {
	test("builds a conservative profile from ffprobe streams and local metrics", () => {
		const profile = buildVideoAssetProfile({
			videoId: "asset-demo",
			format: {
				duration: "61.2",
			},
			streams: [
				{
					codec_type: "video",
					width: 1920,
					height: 1080,
					avg_frame_rate: "30000/1001",
				},
				{
					codec_type: "audio",
				},
			],
			sceneCutTimes: [4, 10, 18, 30],
			silenceDurations: [2, 3],
		});

		expect(profile).toEqual({
			videoId: "asset-demo",
			duration: 61.2,
			fps: 29.97,
			width: 1920,
			height: 1080,
			aspectRatio: "16:9",
			hasAudio: true,
			speechRatio: 0.918,
			silenceRatio: 0.082,
			motionLevel: "medium",
			sceneChangeDensity: 3.922,
			contentTypeGuess: "unknown",
		});
	});

	test("turns scene cut times into bounded physical shot segments", () => {
		const shots = buildShotSegmentsFromSceneCuts({
			duration: 12,
			sceneCutTimes: [0, 2.5, 2.5, 9, 14],
		});

		expect(shots).toEqual([
			{
				id: "shot_001",
				start: 0,
				end: 2.5,
				duration: 2.5,
				method: "ffmpeg_scene",
				confidence: 0.65,
			},
			{
				id: "shot_002",
				start: 2.5,
				end: 9,
				duration: 6.5,
				method: "ffmpeg_scene",
				confidence: 0.65,
			},
			{
				id: "shot_003",
				start: 9,
				end: 12,
				duration: 3,
				method: "ffmpeg_scene",
				confidence: 0.65,
			},
		]);
	});

	test("plans keyframes from shot duration without extracting files yet", () => {
		const keyframes = planKeyframesForShots({
			shots: [
				{
					id: "shot_001",
					start: 0,
					end: 2,
					duration: 2,
					method: "ffmpeg_scene",
				},
				{
					id: "shot_002",
					start: 2,
					end: 9,
					duration: 7,
					method: "ffmpeg_scene",
				},
				{
					id: "shot_003",
					start: 9,
					end: 24,
					duration: 15,
					method: "ffmpeg_scene",
				},
			],
		});

		expect(keyframes).toEqual([
			{ id: "keyframe_001_001", shotId: "shot_001", time: 1 },
			{ id: "keyframe_002_001", shotId: "shot_002", time: 2.75 },
			{ id: "keyframe_002_002", shotId: "shot_002", time: 5.5 },
			{ id: "keyframe_002_003", shotId: "shot_002", time: 8.25 },
			{ id: "keyframe_003_001", shotId: "shot_003", time: 12 },
			{ id: "keyframe_003_002", shotId: "shot_003", time: 16.5 },
			{ id: "keyframe_003_003", shotId: "shot_003", time: 21 },
		]);
	});
});
