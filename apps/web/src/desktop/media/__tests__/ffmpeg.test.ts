import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	parseSceneDetectionOutput,
	parseSilenceDetectOutput,
	resolveFfmpegBundleKey,
	resolveFfmpegPaths,
} from "../ffmpeg";

describe("desktop ffmpeg resources", () => {
	test("selects the platform-specific resource bundle", () => {
		expect(resolveFfmpegBundleKey({ platform: "darwin", arch: "arm64" })).toBe(
			"darwin-arm64",
		);
		expect(resolveFfmpegBundleKey({ platform: "win32", arch: "x64" })).toBe(
			"win32-x64",
		);
	});

	test("resolves repo resources in development", () => {
		const paths = resolveFfmpegPaths({
			env: {},
			platform: "darwin",
			arch: "arm64",
			repoRoot: "/repo",
		});

		expect(paths).toEqual({
			bundleKey: "darwin-arm64",
			ffmpegPath: path.join("/repo", "resources/ffmpeg/darwin-arm64/ffmpeg"),
			ffprobePath: path.join("/repo", "resources/ffmpeg/darwin-arm64/ffprobe"),
		});
	});

	test("lets explicit binary overrides win", () => {
		const paths = resolveFfmpegPaths({
			env: {
				SHOTLYX_FFMPEG_PATH: "/tools/ffmpeg-custom",
				SHOTLYX_FFPROBE_PATH: "/tools/ffprobe-custom",
			},
			platform: "linux",
			arch: "x64",
			repoRoot: "/repo",
		});

		expect(paths.ffmpegPath).toBe("/tools/ffmpeg-custom");
		expect(paths.ffprobePath).toBe("/tools/ffprobe-custom");
		expect(paths.bundleKey).toBe("linux-x64");
	});

	test("parses scene detection timestamps from ffmpeg stderr", () => {
		const cuts = parseSceneDetectionOutput(`
			[Parsed_showinfo_1 @ 0x] n:12 pts:576000 pts_time:4.8 pos:-1
			[Parsed_showinfo_1 @ 0x] n:51 pts:1512000 pts_time:12.6 pos:-1
			[Parsed_showinfo_1 @ 0x] n:51 pts:1512000 pts_time:12.6 pos:-1
		`);

		expect(cuts).toEqual([4.8, 12.6]);
	});

	test("parses silence windows from ffmpeg stderr", () => {
		const silence = parseSilenceDetectOutput(`
			[silencedetect @ 0x] silence_start: 2.2
			[silencedetect @ 0x] silence_end: 4.7 | silence_duration: 2.5
			[silencedetect @ 0x] silence_start: 8
			[silencedetect @ 0x] silence_end: 9.25 | silence_duration: 1.25
		`);

		expect(silence).toEqual([2.5, 1.25]);
	});
});
