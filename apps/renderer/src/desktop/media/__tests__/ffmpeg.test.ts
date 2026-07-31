import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
	buildExtractAudioArgs,
	buildExtractKeyframeArgs,
	buildTranscodeToAlphaWebmArgs,
	buildTranscodeToBrowserMp4Args,
	probeHasAlphaVideo,
	parseSceneDetectionOutput,
	parseSilenceDetectOutput,
	resolveFfmpegBundleKey,
	resolveFfmpegPaths,
	selectBrowserVideoTranscodePlan,
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

	test("ignores Electron dependency resources path in desktop development", () => {
		const paths = resolveFfmpegPaths({
			env: { SHOTLYX_DESKTOP_DEV: "1" },
			platform: "darwin",
			arch: "arm64",
			repoRoot: "/repo",
			resourcesPath:
				"/repo/node_modules/.bun/electron@42.3.0/node_modules/electron/dist/Electron.app/Contents/Resources",
		});

		expect(paths).toEqual({
			bundleKey: "darwin-arm64",
			ffmpegPath: path.join("/repo", "resources/ffmpeg/darwin-arm64/ffmpeg"),
			ffprobePath: path.join("/repo", "resources/ffmpeg/darwin-arm64/ffprobe"),
		});
	});

	test("uses packaged app resources outside desktop development", () => {
		const paths = resolveFfmpegPaths({
			env: {},
			platform: "darwin",
			arch: "arm64",
			repoRoot: "/repo",
			resourcesPath: "/Applications/Shotlyx Desktop.app/Contents/Resources",
		});

		expect(paths).toEqual({
			bundleKey: "darwin-arm64",
			ffmpegPath: path.join(
				"/Applications/Shotlyx Desktop.app/Contents/Resources",
				"ffmpeg/darwin-arm64/ffmpeg",
			),
			ffprobePath: path.join(
				"/Applications/Shotlyx Desktop.app/Contents/Resources",
				"ffmpeg/darwin-arm64/ffprobe",
			),
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

	test("builds deterministic keyframe extraction args", () => {
		expect(
			buildExtractKeyframeArgs({
				filePath: "/video/demo.mp4",
				outputPath: "/tmp/keyframe.jpg",
				time: 12.345,
			}),
		).toEqual([
			"-hide_banner",
			"-nostdin",
			"-y",
			"-ss",
			"12.345",
			"-i",
			"/video/demo.mp4",
			"-frames:v",
			"1",
			"-q:v",
			"2",
			"/tmp/keyframe.jpg",
		]);
	});

	test("builds audio extraction args for ASR", () => {
		expect(
			buildExtractAudioArgs({
				filePath: "/video/demo.mp4",
				outputPath: "/tmp/audio.wav",
			}),
		).toEqual([
			"-hide_banner",
			"-nostdin",
			"-y",
			"-i",
			"/video/demo.mp4",
			"-vn",
			"-ac",
			"1",
			"-ar",
			"16000",
			"-c:a",
			"pcm_s16le",
			"/tmp/audio.wav",
		]);
	});

	test("builds browser-compatible MP4 transcode args", () => {
		expect(
			buildTranscodeToBrowserMp4Args({
				inputPath: "/video/demo.mov",
				outputPath: "/tmp/demo.mp4",
			}),
		).toEqual([
			"-hide_banner",
			"-nostdin",
			"-y",
			"-i",
			"/video/demo.mov",
			"-map",
			"0:v:0",
			"-map",
			"0:a?",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"/tmp/demo.mp4",
		]);
	});

	test("builds alpha-preserving WebM transcode args", () => {
		expect(
			buildTranscodeToAlphaWebmArgs({
				inputPath: "/video/overlay.mov",
				outputPath: "/tmp/overlay.webm",
			}),
		).toEqual([
			"-hide_banner",
			"-nostdin",
			"-y",
			"-i",
			"/video/overlay.mov",
			"-map",
			"0:v:0",
			"-map",
			"0:a?",
			"-c:v",
			"libvpx-vp9",
			"-pix_fmt",
			"yuva420p",
			"-auto-alt-ref",
			"0",
			"-lossless",
			"1",
			"-c:a",
			"libopus",
			"/tmp/overlay.webm",
		]);
	});

	test("selects alpha WebM only when ffprobe reports an alpha video stream", () => {
		const alphaProbe = {
			streams: [
				{
					codec_type: "video",
					pix_fmt: "argb",
				},
			],
		};
		const normalProbe = {
			streams: [
				{
					codec_type: "video",
					pix_fmt: "yuv420p",
				},
			],
		};
		const alphaTagProbe = {
			streams: [
				{
					codec_type: "video",
					pix_fmt: "yuv420p",
					tags: { alpha_mode: 1 },
				},
			],
		};

		expect(probeHasAlphaVideo({ probe: alphaProbe })).toBe(true);
		expect(probeHasAlphaVideo({ probe: alphaTagProbe })).toBe(true);
		expect(selectBrowserVideoTranscodePlan({ probe: alphaProbe })).toEqual({
			contentType: "video/webm",
			extension: ".webm",
			target: "webm-alpha",
		});
		expect(selectBrowserVideoTranscodePlan({ probe: normalProbe })).toEqual({
			contentType: "video/mp4",
			extension: ".mp4",
			target: "mp4",
		});
	});
});
