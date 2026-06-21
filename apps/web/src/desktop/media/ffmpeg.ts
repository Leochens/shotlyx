import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Keyframe } from "@/video-analysis";

export interface FfmpegBinaryPaths {
	bundleKey: string;
	ffmpegPath: string;
	ffprobePath: string;
}

export interface ResolveFfmpegPathsInput {
	arch?: NodeJS.Architecture;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	repoRoot?: string;
	resourcesPath?: string;
}

export interface RunFfmpegCommandInput {
	args: string[];
	binaryPath: string;
	timeoutMs?: number;
}

export type BrowserVideoTranscodeTarget = "mp4" | "webm-alpha";

export interface BrowserVideoTranscodePlan {
	contentType: "video/mp4" | "video/webm";
	extension: ".mp4" | ".webm";
	target: BrowserVideoTranscodeTarget;
}

const DEFAULT_FFMPEG_TIMEOUT_MS = 120_000;

function getProcessResourcesPath(): string | undefined {
	return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

export function resolveFfmpegBundleKey({
	arch = process.arch,
	platform = process.platform,
}: {
	arch?: NodeJS.Architecture | string;
	platform?: NodeJS.Platform | string;
} = {}): string {
	return `${platform}-${arch}`;
}

function binaryName({
	kind,
	platform,
}: {
	kind: "ffmpeg" | "ffprobe";
	platform: NodeJS.Platform | string;
}): string {
	return platform === "win32" ? `${kind}.exe` : kind;
}

function findRepoRoot(startDir = process.cwd()): string {
	let current = path.resolve(startDir);
	for (;;) {
		if (existsSync(path.join(current, "resources", "ffmpeg"))) {
			return current;
		}
		const parent = path.dirname(current);
		if (parent === current) return path.resolve(startDir);
		current = parent;
	}
}

function isElectronDependencyResourcesPath(resourcesPath: string): boolean {
	const normalized = resourcesPath.split(path.sep).join("/");
	return (
		normalized.includes("/node_modules/electron/") ||
		normalized.includes("/node_modules/.bun/electron@")
	);
}

function shouldUsePackagedResourcesPath({
	env,
	resourcesPath,
}: {
	env: NodeJS.ProcessEnv;
	resourcesPath?: string;
}): resourcesPath is string {
	if (!resourcesPath) return false;
	if (env.SHOTLYX_DESKTOP_DEV === "1") return false;
	return !isElectronDependencyResourcesPath(resourcesPath);
}

export function resolveFfmpegPaths({
	arch = process.arch,
	env = process.env,
	platform = process.platform,
	repoRoot,
	resourcesPath = getProcessResourcesPath(),
}: ResolveFfmpegPathsInput = {}): FfmpegBinaryPaths {
	const bundleKey = resolveFfmpegBundleKey({ arch, platform });
	const ffmpegOverride = env.SHOTLYX_FFMPEG_PATH?.trim();
	const ffprobeOverride = env.SHOTLYX_FFPROBE_PATH?.trim();
	if (ffmpegOverride && ffprobeOverride) {
		return {
			bundleKey,
			ffmpegPath: ffmpegOverride,
			ffprobePath: ffprobeOverride,
		};
	}

	const configuredDir = env.SHOTLYX_FFMPEG_DIR?.trim();
	const usePackagedResourcesPath = shouldUsePackagedResourcesPath({
		env,
		resourcesPath,
	});
	const baseDir = configuredDir
		? configuredDir
		: usePackagedResourcesPath
			? path.join(resourcesPath, "ffmpeg", bundleKey)
			: path.join(repoRoot ?? findRepoRoot(), "resources", "ffmpeg", bundleKey);

	return {
		bundleKey,
		ffmpegPath:
			ffmpegOverride ??
			path.join(baseDir, binaryName({ kind: "ffmpeg", platform })),
		ffprobePath:
			ffprobeOverride ??
			path.join(baseDir, binaryName({ kind: "ffprobe", platform })),
	};
}

export async function runFfmpegCommand({
	args,
	binaryPath,
	timeoutMs = DEFAULT_FFMPEG_TIMEOUT_MS,
}: RunFfmpegCommandInput): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(binaryPath, args, {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			reject(new Error(`ffmpeg_timeout: ${path.basename(binaryPath)}`));
		}, timeoutMs);

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(
				new Error(
					`ffmpeg_failed: ${path.basename(binaryPath)} exited with ${code}\n${stderr}`,
				),
			);
		});
	});
}

export async function runFfprobeJson({
	filePath,
	ffprobePath,
}: {
	filePath: string;
	ffprobePath: string;
}): Promise<unknown> {
	const { stdout } = await runFfmpegCommand({
		binaryPath: ffprobePath,
		args: [
			"-v",
			"error",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			filePath,
		],
	});
	return JSON.parse(stdout) as unknown;
}

export function parseSceneDetectionOutput(output: string): number[] {
	const cuts = new Set<number>();
	for (const match of output.matchAll(/pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
		const value = Number.parseFloat(match[1] ?? "");
		if (Number.isFinite(value) && value > 0) {
			cuts.add(Math.round(value * 1000) / 1000);
		}
	}
	return [...cuts].sort((a, b) => a - b);
}

export async function detectSceneCuts({
	ffmpegPath,
	filePath,
	sceneThreshold = 0.35,
}: {
	ffmpegPath: string;
	filePath: string;
	sceneThreshold?: number;
}): Promise<number[]> {
	const { stderr } = await runFfmpegCommand({
		binaryPath: ffmpegPath,
		args: [
			"-hide_banner",
			"-nostdin",
			"-i",
			filePath,
			"-vf",
			`select='gt(scene,${sceneThreshold})',showinfo`,
			"-f",
			"null",
			"-",
		],
	});
	return parseSceneDetectionOutput(stderr);
}

export function parseSilenceDetectOutput(output: string): number[] {
	const durations: number[] = [];
	for (const match of output.matchAll(
		/silence_duration:\s*([0-9]+(?:\.[0-9]+)?)/g,
	)) {
		const value = Number.parseFloat(match[1] ?? "");
		if (Number.isFinite(value) && value > 0) {
			durations.push(Math.round(value * 1000) / 1000);
		}
	}
	return durations;
}

export async function detectSilenceDurations({
	ffmpegPath,
	filePath,
}: {
	ffmpegPath: string;
	filePath: string;
}): Promise<number[]> {
	const { stderr } = await runFfmpegCommand({
		binaryPath: ffmpegPath,
		args: [
			"-hide_banner",
			"-nostdin",
			"-i",
			filePath,
			"-af",
			"silencedetect=noise=-35dB:d=0.5",
			"-f",
			"null",
			"-",
		],
	});
	return parseSilenceDetectOutput(stderr);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStreamTags({ stream }: { stream: Record<string, unknown> }) {
	const tags = stream.tags;
	return isRecord(tags) ? tags : {};
}

export function videoStreamHasAlpha({ stream }: { stream: unknown }): boolean {
	if (!isRecord(stream)) return false;
	const tags = getStreamTags({ stream });
	if (tags.alpha_mode === "1" || tags.alpha_mode === 1) return true;
	if (
		Array.isArray(stream.side_data_list) &&
		stream.side_data_list.some((item) => {
			if (!isRecord(item)) return false;
			const sideDataType =
				typeof item.side_data_type === "string" ? item.side_data_type : "";
			return sideDataType.toLowerCase().includes("alpha");
		})
	) {
		return true;
	}

	const pixFmt = typeof stream.pix_fmt === "string" ? stream.pix_fmt : "";
	return /(^|[^a-z])(argb|rgba|abgr|bgra|yuva|gbrap|ya\d*|pal8)([^a-z]|$)/i.test(
		pixFmt,
	);
}

export function probeHasAlphaVideo({ probe }: { probe: unknown }): boolean {
	if (!isRecord(probe) || !Array.isArray(probe.streams)) return false;
	return probe.streams.some((stream) => {
		if (!isRecord(stream)) return false;
		const codecType = stream.codec_type;
		return (
			(codecType === undefined || codecType === "video") &&
			videoStreamHasAlpha({ stream })
		);
	});
}

export function selectBrowserVideoTranscodePlan({
	probe,
}: {
	probe: unknown;
}): BrowserVideoTranscodePlan {
	if (probeHasAlphaVideo({ probe })) {
		return {
			contentType: "video/webm",
			extension: ".webm",
			target: "webm-alpha",
		};
	}
	return {
		contentType: "video/mp4",
		extension: ".mp4",
		target: "mp4",
	};
}

export function buildTranscodeToBrowserMp4Args({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}): string[] {
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
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
		outputPath,
	];
}

export function buildTranscodeToAlphaWebmArgs({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}): string[] {
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
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
		outputPath,
	];
}

export async function transcodeToBrowserVideo({
	ffmpegPath,
	inputPath,
	outputPath,
	target,
}: {
	ffmpegPath: string;
	inputPath: string;
	outputPath: string;
	target: BrowserVideoTranscodeTarget;
}): Promise<string> {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await runFfmpegCommand({
		binaryPath: ffmpegPath,
		args:
			target === "webm-alpha"
				? buildTranscodeToAlphaWebmArgs({ inputPath, outputPath })
				: buildTranscodeToBrowserMp4Args({
						inputPath,
						outputPath,
					}),
	});
	return outputPath;
}

export function buildExtractKeyframeArgs({
	filePath,
	outputPath,
	time,
}: {
	filePath: string;
	outputPath: string;
	time: number;
}): string[] {
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-ss",
		`${Math.max(0, Math.round(time * 1000) / 1000)}`,
		"-i",
		filePath,
		"-frames:v",
		"1",
		"-q:v",
		"2",
		outputPath,
	];
}

export async function extractKeyframes({
	ffmpegPath,
	filePath,
	keyframes,
	outputDir,
}: {
	ffmpegPath: string;
	filePath: string;
	keyframes: Keyframe[];
	outputDir: string;
}): Promise<Keyframe[]> {
	await fs.mkdir(outputDir, { recursive: true });
	const results: Keyframe[] = [];
	for (const keyframe of keyframes) {
		const imagePath = path.join(outputDir, `${keyframe.id}.jpg`);
		await runFfmpegCommand({
			binaryPath: ffmpegPath,
			args: buildExtractKeyframeArgs({
				filePath,
				outputPath: imagePath,
				time: keyframe.time,
			}),
		});
		results.push({ ...keyframe, imagePath });
	}
	return results;
}

export function buildExtractAudioArgs({
	filePath,
	outputPath,
}: {
	filePath: string;
	outputPath: string;
}): string[] {
	return [
		"-hide_banner",
		"-nostdin",
		"-y",
		"-i",
		filePath,
		"-vn",
		"-ac",
		"1",
		"-ar",
		"16000",
		"-c:a",
		"pcm_s16le",
		outputPath,
	];
}

export async function extractAudioForAsr({
	ffmpegPath,
	filePath,
	outputPath,
}: {
	ffmpegPath: string;
	filePath: string;
	outputPath: string;
}): Promise<string> {
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await runFfmpegCommand({
		binaryPath: ffmpegPath,
		args: buildExtractAudioArgs({ filePath, outputPath }),
	});
	return outputPath;
}
