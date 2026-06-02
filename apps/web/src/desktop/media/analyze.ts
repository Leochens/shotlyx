import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	buildShotSegmentsFromSceneCuts,
	buildVideoAssetInspection,
	buildVideoAssetProfile,
	type FfprobeFormat,
	type FfprobeStream,
} from "@/video-analysis";
import type {
	VideoAnalysisLevel,
	VideoAssetInspection,
} from "@/video-analysis";
import {
	detectSceneCuts,
	detectSilenceDurations,
	resolveFfmpegPaths,
	runFfprobeJson,
	type FfmpegBinaryPaths,
} from "./ffmpeg";

export interface AnalyzeVideoAssetInput {
	analysisLevel?: VideoAnalysisLevel;
	ffmpegPaths?: FfmpegBinaryPaths;
	filePath: string;
	sceneThreshold?: number;
	videoId?: string;
}

interface FfprobeResult {
	format?: FfprobeFormat;
	streams?: FfprobeStream[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFfprobeResult(value: unknown): FfprobeResult {
	if (!isRecord(value)) return {};
	const streams = Array.isArray(value.streams)
		? value.streams.filter(isRecord).map((stream) => ({
				codec_type:
					typeof stream.codec_type === "string" ? stream.codec_type : undefined,
				width: typeof stream.width === "number" ? stream.width : undefined,
				height: typeof stream.height === "number" ? stream.height : undefined,
				avg_frame_rate:
					typeof stream.avg_frame_rate === "string"
						? stream.avg_frame_rate
						: undefined,
				r_frame_rate:
					typeof stream.r_frame_rate === "string"
						? stream.r_frame_rate
						: undefined,
			}))
		: [];
	const format = isRecord(value.format)
		? {
				duration:
					typeof value.format.duration === "string" ||
					typeof value.format.duration === "number"
						? value.format.duration
						: undefined,
			}
		: undefined;
	return { format, streams };
}

function defaultVideoId({ filePath }: { filePath: string }): string {
	return crypto
		.createHash("sha1")
		.update(path.resolve(filePath))
		.digest("hex")
		.slice(0, 16);
}

export async function analyzeVideoAsset({
	analysisLevel = "basic",
	ffmpegPaths = resolveFfmpegPaths(),
	filePath,
	sceneThreshold,
	videoId = defaultVideoId({ filePath }),
}: AnalyzeVideoAssetInput): Promise<VideoAssetInspection> {
	const stat = await fs.stat(filePath);
	if (!stat.isFile()) {
		throw new Error(`media_analysis_invalid_file: ${filePath}`);
	}

	const probe = normalizeFfprobeResult(
		await runFfprobeJson({
			filePath,
			ffprobePath: ffmpegPaths.ffprobePath,
		}),
	);
	const sceneCutTimes = await detectSceneCuts({
		filePath,
		ffmpegPath: ffmpegPaths.ffmpegPath,
		sceneThreshold,
	});
	const hasAudio = probe.streams?.some(
		(stream) => stream.codec_type === "audio",
	);
	const silenceDurations = hasAudio
		? await detectSilenceDurations({
				filePath,
				ffmpegPath: ffmpegPaths.ffmpegPath,
			}).catch(() => [])
		: [];
	const profile = buildVideoAssetProfile({
		videoId,
		format: probe.format,
		streams: probe.streams,
		sceneCutTimes,
		silenceDurations,
	});
	const shots = buildShotSegmentsFromSceneCuts({
		duration: profile.duration,
		sceneCutTimes,
	});

	return buildVideoAssetInspection({
		analysisLevel,
		profile,
		shots,
		videoId,
	});
}

function safeExtension(name: string): string {
	const extension = path
		.extname(name)
		.toLowerCase()
		.replace(/[^a-z0-9.]/g, "");
	return extension || ".mp4";
}

export async function writeUploadedVideoToTemp({
	blob,
	name,
}: {
	blob: Blob;
	name: string;
}): Promise<string> {
	const baseDir =
		process.env.SHOTLYX_DESKTOP_MEDIA_ANALYZE_DIR ??
		path.join(os.tmpdir(), "shotlyx-media-analysis");
	await fs.mkdir(baseDir, { recursive: true });
	const filePath = path.join(
		baseDir,
		`${crypto.randomUUID()}${safeExtension(name)}`,
	);
	const buffer = Buffer.from(await blob.arrayBuffer());
	await fs.writeFile(filePath, buffer);
	return filePath;
}
