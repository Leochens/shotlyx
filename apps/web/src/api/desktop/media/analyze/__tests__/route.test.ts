import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-media-analyze-route-"));
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

test("desktop media analyze route returns local inspection output", async () => {
	mock.module("@/desktop/media/analyze", () => ({
		analyzeVideoAsset: async ({ filePath, videoId }) => {
			expect(filePath).toBe("/video/demo.mp4");
			return {
				videoId,
				profile: {
					videoId,
					duration: 4,
					fps: 30,
					width: 1280,
					height: 720,
					aspectRatio: "16:9",
					hasAudio: true,
					speechRatio: 0.75,
					silenceRatio: 0.25,
					motionLevel: "low",
					sceneChangeDensity: 0,
					contentTypeGuess: "unknown",
				},
				shots: [],
				keyframes: [],
				analysisMeta: {
					createdAt: "2026-06-02T00:00:00.000Z",
					modelUsed: ["ffprobe", "ffmpeg"],
					analysisLevel: "basic",
				},
			};
		},
	}));

	const { POST } = await import("../route");
	const response = await POST(
		new Request("http://localhost/api/desktop/media/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				videoId: "asset-route",
				filePath: "/video/demo.mp4",
			}),
		}),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		videoId: "asset-route",
		profile: {
			duration: 4,
			width: 1280,
			height: 720,
		},
		analysisMeta: {
			analysisLevel: "basic",
		},
	});
});

test("desktop media analyze route is disabled outside desktop mode", async () => {
	delete process.env.SHOTLYX_DESKTOP;
	delete process.env.VITE_SHOTLYX_DESKTOP;

	const { POST } = await import("../route");
	const response = await POST(
		new Request("http://localhost/api/desktop/media/analyze", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				filePath: "/video/demo.mp4",
			}),
		}),
	);

	expect(response.status).toBe(403);
});
