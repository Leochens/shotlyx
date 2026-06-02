import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	buildShotSegmentsFromSceneCuts,
	buildVideoAssetInspection,
	buildVideoAssetProfile,
	planKeyframesForShots,
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
	extractAudioForAsr,
	extractKeyframes,
	resolveFfmpegPaths,
	runFfprobeJson,
	type FfmpegBinaryPaths,
} from "./ffmpeg";

export interface AnalyzeVideoAssetInput {
	analysisLevel?: VideoAnalysisLevel;
	ffmpegPaths?: FfmpegBinaryPaths;
	filePath: string;
	includeKeyframes?: boolean;
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

function warnMediaAnalysisFallback({
	error,
	stage,
}: {
	error: unknown;
	stage: string;
}) {
	const message = error instanceof Error ? error.message : String(error);
	console.warn(`[shotlyx-media-analysis] ${stage} fallback: ${message}`);
}

export async function analyzeVideoAsset({
	analysisLevel = "basic",
	ffmpegPaths = resolveFfmpegPaths(),
	filePath,
	includeKeyframes = analysisLevel !== "basic",
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
	}).catch((error) => {
		warnMediaAnalysisFallback({ error, stage: "scene-detection" });
		return [];
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

	const baseInspection = buildVideoAssetInspection({
		analysisLevel,
		profile,
		shots,
		videoId,
	});
	if (!includeKeyframes || baseInspection.keyframes.length === 0) {
		return baseInspection;
	}
	const outputDir = path.join(getMediaAnalysisTempDir(), videoId, "keyframes");
	const keyframes = await extractKeyframes({
		ffmpegPath: ffmpegPaths.ffmpegPath,
		filePath,
		keyframes: planKeyframesForShots({ shots }),
		outputDir,
	}).catch((error) => {
		warnMediaAnalysisFallback({ error, stage: "keyframe-extraction" });
		return baseInspection.keyframes;
	});
	return {
		...baseInspection,
		keyframes,
	};
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
	const baseDir = getMediaAnalysisTempDir();
	await fs.mkdir(baseDir, { recursive: true });
	const filePath = path.join(
		baseDir,
		`${crypto.randomUUID()}${safeExtension(name)}`,
	);
	const buffer = Buffer.from(await blob.arrayBuffer());
	await fs.writeFile(filePath, buffer);
	return filePath;
}

function getMediaAnalysisTempDir(): string {
	return (
		process.env.SHOTLYX_DESKTOP_MEDIA_ANALYZE_DIR ??
		path.join(os.tmpdir(), "shotlyx-media-analysis")
	);
}

export async function extractVideoAudioForAsr({
	ffmpegPaths = resolveFfmpegPaths(),
	filePath,
}: {
	ffmpegPaths?: FfmpegBinaryPaths;
	filePath: string;
}): Promise<File> {
	const outputPath = path.join(
		getMediaAnalysisTempDir(),
		`${crypto.randomUUID()}-asr.wav`,
	);
	await extractAudioForAsr({
		ffmpegPath: ffmpegPaths.ffmpegPath,
		filePath,
		outputPath,
	});
	const audio = await fs.readFile(outputPath);
	await fs.rm(outputPath, { force: true }).catch(() => {});
	return new File([audio], "shotlyx-asr.wav", { type: "audio/wav" });
}
