import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-media-prepare-route-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
	mock.restore();
});

test("desktop media prepare route keeps alpha videos transparent as WebM", async () => {
	mock.module("@/desktop/media/ffmpeg", () => ({
		resolveFfmpegPaths: () => ({
			bundleKey: "test",
			ffmpegPath: "/tools/ffmpeg",
			ffprobePath: "/tools/ffprobe",
		}),
		runFfprobeJson: async ({ ffprobePath, filePath }) => {
			expect(ffprobePath).toBe("/tools/ffprobe");
			expect(path.basename(filePath)).toBe("input.mov");
			return {
				streams: [
					{
						codec_type: "video",
						pix_fmt: "argb",
					},
				],
			};
		},
		selectBrowserVideoTranscodePlan: () => ({
			contentType: "video/webm",
			extension: ".webm",
			target: "webm-alpha",
		}),
		transcodeToBrowserVideo: async ({
			ffmpegPath,
			inputPath,
			outputPath,
			target,
		}: {
			ffmpegPath: string;
			inputPath: string;
			outputPath: string;
			target: string;
		}) => {
			expect(ffmpegPath).toBe("/tools/ffmpeg");
			expect(path.basename(inputPath)).toBe("input.mov");
			expect(target).toBe("webm-alpha");
			writeFileSync(outputPath, "webm bytes");
			return outputPath;
		},
	}));

	const { POST } = await import("../route");
	const response = await POST(
		new Request(
			"http://localhost/api/desktop/media/prepare-video?name=pink-alpha.mov",
			{
				body: new Blob(["mov bytes"], { type: "video/quicktime" }),
				method: "POST",
			},
		),
	);

	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Type")).toBe("video/webm");
	expect(response.headers.get("X-Shotlyx-Filename")).toBe("pink-alpha.webm");
	expect(await response.text()).toBe("webm bytes");
});

test("desktop media prepare route is disabled outside desktop mode", async () => {
	delete process.env.SHOTLYX_DESKTOP;
	delete process.env.VITE_SHOTLYX_DESKTOP;

	const { POST } = await import("../route");
	const response = await POST(
		new Request(
			"http://localhost/api/desktop/media/prepare-video?name=pink-alpha.mov",
			{
				body: new Blob(["mov bytes"], { type: "video/quicktime" }),
				method: "POST",
			},
		),
	);

	expect(response.status).toBe(403);
});
