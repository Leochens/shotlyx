import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-media-transcript-route-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_MEDIA_ANALYZE_DIR: tempDir,
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
	mock.restore();
});

test("desktop media transcript route extracts audio and returns timed transcript", async () => {
	mock.module("@/desktop/media/analyze", () => ({
		analyzeVideoAsset: async ({ videoId }) => ({
			analysisMeta: {
				analysisLevel: "basic",
				createdAt: "2026-06-03T00:00:00.000Z",
				modelUsed: ["ffprobe", "ffmpeg"],
			},
			keyframes: [],
			profile: {
				aspectRatio: "16:9",
				contentTypeGuess: "unknown",
				duration: 4,
				fps: 30,
				hasAudio: true,
				height: 720,
				motionLevel: "low",
				sceneChangeDensity: 0,
				silenceRatio: 0.25,
				speechRatio: 0.75,
				videoId,
				width: 1280,
			},
			shots: [],
			videoId,
		}),
		extractVideoAudioForAsr: async ({ filePath }) => {
			expect(filePath).toContain(tempDir);
			return new File(["wav"], "shotlyx-asr.wav", { type: "audio/wav" });
		},
		writeUploadedVideoToTemp: async ({ blob, name }) => {
			expect(blob.size).toBeGreaterThan(0);
			expect(name).toBe("demo.mp4");
			return path.join(tempDir, "uploaded.mp4");
		},
	}));
	mock.module("@/agent/tools/transcription/providers", () => ({
		transcribeAudio: async ({ input }) => {
			expect(input.audio.name).toBe("shotlyx-asr.wav");
			expect(input.provider).toBe("volcengine");
			return {
				cues: [
					{
						durationSeconds: 2.5,
						startTimeSeconds: 1,
						text: "这里展示自动字幕功能。",
					},
				],
				model: "bigmodel",
				provider: "volcengine",
				text: "这里展示自动字幕功能。",
			};
		},
	}));

	const { POST } = await import("../route");
	const response = await POST(
		new Request(
			`http://localhost/api/desktop/media/transcript?payload=${encodeURIComponent(
				JSON.stringify({
					name: "demo.mp4",
					provider: "volcengine",
					videoId: "media-1",
				}),
			)}`,
			{
				body: new Blob(["video"], { type: "video/mp4" }),
				method: "POST",
			},
		),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		language: undefined,
		metadata: undefined,
		model: "bigmodel",
		modelUsed: "volcengine:bigmodel",
		provider: "volcengine",
		text: "这里展示自动字幕功能。",
		transcript: [
			{
				end: 3.5,
				start: 1,
				text: "这里展示自动字幕功能。",
			},
		],
		videoId: "media-1",
	});
});
