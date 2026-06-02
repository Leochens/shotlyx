import type {
	Keyframe,
	ShotSegment,
	VideoAnalysisLevel,
	VideoAssetInspection,
	VideoAssetProfile,
	VideoAspectRatio,
	VideoMotionLevel,
	VideoSceneType,
} from "./types";

export interface FfprobeStream {
	codec_type?: string;
	width?: number;
	height?: number;
	avg_frame_rate?: string;
	r_frame_rate?: string;
}

export interface FfprobeFormat {
	duration?: number | string;
}

export interface BuildVideoAssetProfileInput {
	videoId: string;
	format?: FfprobeFormat;
	streams?: FfprobeStream[];
	sceneCutTimes?: number[];
	silenceDurations?: number[];
}

function round({
	digits = 3,
	value,
}: {
	digits?: number;
	value: number;
}): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function parsePositiveNumber(value: number | string | undefined): number {
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseFrameRate(value: string | undefined): number {
	if (!value) return 0;
	const [numeratorRaw, denominatorRaw] = value.split("/");
	const numerator = Number.parseFloat(numeratorRaw ?? "");
	const denominator = Number.parseFloat(denominatorRaw ?? "");
	if (
		Number.isFinite(numerator) &&
		Number.isFinite(denominator) &&
		denominator > 0
	) {
		return round({ value: numerator / denominator });
	}
	const direct = Number.parseFloat(value);
	return Number.isFinite(direct) && direct > 0 ? round({ value: direct }) : 0;
}

function resolveAspectRatio({
	height,
	width,
}: {
	height: number;
	width: number;
}): VideoAspectRatio {
	if (width <= 0 || height <= 0) return "other";
	const ratio = width / height;
	if (Math.abs(ratio - 16 / 9) < 0.04) return "16:9";
	if (Math.abs(ratio - 9 / 16) < 0.04) return "9:16";
	if (Math.abs(ratio - 1) < 0.04) return "1:1";
	return "other";
}

function classifyMotionLevel(sceneChangeDensity: number): VideoMotionLevel {
	if (sceneChangeDensity >= 12) return "high";
	if (sceneChangeDensity >= 3) return "medium";
	return "low";
}

function inferContentTypeGuess({
	hasAudio,
	motionLevel,
	speechRatio,
}: {
	hasAudio: boolean;
	motionLevel: VideoMotionLevel;
	speechRatio: number;
}): VideoSceneType {
	if (!hasAudio && motionLevel === "high") return "broll";
	if (hasAudio && speechRatio >= 0.85 && motionLevel === "low") {
		return "talking_head";
	}
	return "unknown";
}

export function buildVideoAssetProfile({
	format,
	sceneCutTimes = [],
	silenceDurations = [],
	streams = [],
	videoId,
}: BuildVideoAssetProfileInput): VideoAssetProfile {
	const videoStream = streams.find((stream) => stream.codec_type === "video");
	const hasAudio = streams.some((stream) => stream.codec_type === "audio");
	const duration = round({ value: parsePositiveNumber(format?.duration) });
	const width = videoStream?.width ?? 0;
	const height = videoStream?.height ?? 0;
	const fps = parseFrameRate(
		videoStream?.avg_frame_rate || videoStream?.r_frame_rate,
	);
	const sceneChangeDensity =
		duration > 0 ? round({ value: sceneCutTimes.length / (duration / 60) }) : 0;
	const silenceSeconds = silenceDurations.reduce(
		(total, item) => total + Math.max(0, item),
		0,
	);
	const silenceRatio =
		!hasAudio || duration <= 0
			? hasAudio
				? 0
				: 1
			: round({ value: silenceSeconds / duration });
	const speechRatio = hasAudio
		? round({ value: Math.max(0, 1 - silenceRatio) })
		: 0;
	const motionLevel = classifyMotionLevel(sceneChangeDensity);

	return {
		videoId,
		duration,
		fps,
		width,
		height,
		aspectRatio: resolveAspectRatio({ height, width }),
		hasAudio,
		speechRatio,
		silenceRatio,
		motionLevel,
		sceneChangeDensity,
		contentTypeGuess: inferContentTypeGuess({
			hasAudio,
			motionLevel,
			speechRatio,
		}),
	};
}

function uniqueSortedCutTimes({
	duration,
	sceneCutTimes,
}: {
	duration: number;
	sceneCutTimes: number[];
}): number[] {
	const seen = new Set<number>();
	const result: number[] = [];
	for (const item of sceneCutTimes) {
		const time = round({ value: item });
		if (!Number.isFinite(time) || time <= 0 || time >= duration) continue;
		if (seen.has(time)) continue;
		seen.add(time);
		result.push(time);
	}
	return result.sort((a, b) => a - b);
}

export function buildShotSegmentsFromSceneCuts({
	duration,
	sceneCutTimes,
}: {
	duration: number;
	sceneCutTimes: number[];
}): ShotSegment[] {
	if (!Number.isFinite(duration) || duration <= 0) return [];
	const points = [
		0,
		...uniqueSortedCutTimes({ duration, sceneCutTimes }),
		round({ value: duration }),
	];
	const segments: ShotSegment[] = [];
	for (let index = 0; index < points.length - 1; index++) {
		const start = points[index] ?? 0;
		const end = points[index + 1] ?? start;
		const segmentDuration = round({ value: end - start });
		if (segmentDuration <= 0.05) continue;
		const segmentIndex = segments.length + 1;
		segments.push({
			id: `shot_${String(segmentIndex).padStart(3, "0")}`,
			start,
			end,
			duration: segmentDuration,
			method: "ffmpeg_scene",
			confidence: 0.65,
		});
	}
	return segments;
}

function keyframeTimesForShot(shot: ShotSegment): number[] {
	if (shot.duration < 3) {
		return [round({ value: shot.start + shot.duration / 2 })];
	}
	if (shot.duration <= 10) {
		const edgePadding = Math.min(0.75, shot.duration / 4);
		return [
			round({ value: shot.start + edgePadding }),
			round({ value: shot.start + shot.duration / 2 }),
			round({ value: shot.end - edgePadding }),
		];
	}
	const edgePadding = shot.duration * 0.2;
	return [
		round({ value: shot.start + edgePadding }),
		round({ value: shot.start + shot.duration / 2 }),
		round({ value: shot.end - edgePadding }),
	];
}

export function planKeyframesForShots({
	shots,
}: {
	shots: ShotSegment[];
}): Keyframe[] {
	return shots.flatMap((shot, shotIndex) =>
		keyframeTimesForShot(shot).map((time, keyframeIndex) => ({
			id: `keyframe_${String(shotIndex + 1).padStart(3, "0")}_${String(
				keyframeIndex + 1,
			).padStart(3, "0")}`,
			shotId: shot.id,
			time,
		})),
	);
}

export function buildVideoAssetInspection({
	analysisLevel = "basic",
	createdAt = new Date().toISOString(),
	modelUsed = ["ffprobe", "ffmpeg"],
	profile,
	shots,
	videoId,
}: {
	analysisLevel?: VideoAnalysisLevel;
	createdAt?: string;
	modelUsed?: string[];
	profile: VideoAssetProfile;
	shots: ShotSegment[];
	videoId: string;
}): VideoAssetInspection {
	return {
		videoId,
		profile,
		shots,
		keyframes: planKeyframesForShots({ shots }),
		analysisMeta: {
			createdAt,
			modelUsed,
			analysisLevel,
		},
	};
}
