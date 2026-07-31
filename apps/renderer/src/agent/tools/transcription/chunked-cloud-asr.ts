import type { EditorCore } from "@/core";
import type { extractTimelineAudio } from "@/media/mediabunny";
import { readAudioPayloadDiagnostics } from "@/transcription/audio-payload-diagnostics";
import type { TranscriptionAudioRange } from "@/transcription/audio-range";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type {
	GenerateSubtitlesFromVideoInput,
	TranscribeAudioResult,
} from "./types";
import type { SceneTracks } from "@/timeline";

export const CLOUD_ASR_CHUNK_THRESHOLD_SECONDS = 6 * 60;

const CLOUD_ASR_PROGRESS_CAP = 95;
const CLOUD_ASR_CHUNK_DURATION_SECONDS = 4 * 60;
const CLOUD_ASR_CHUNK_OVERLAP_SECONDS = 1.2;
const CHUNK_CUE_BOUNDARY_EPSILON_SECONDS = 0.05;

type TimelineAudioExtractor = typeof extractTimelineAudio;

export function shouldChunkCloudAsr({
	provider,
	durationSeconds,
}: {
	provider: string;
	durationSeconds: number;
}): boolean {
	return (
		provider !== "local" && durationSeconds > CLOUD_ASR_CHUNK_THRESHOLD_SECONDS
	);
}

function shiftGeneratedTranscription({
	transcription,
	offsetSeconds,
}: {
	transcription: TranscribeAudioResult;
	offsetSeconds: number;
}): TranscribeAudioResult {
	if (offsetSeconds === 0) return transcription;
	return {
		...transcription,
		cues: transcription.cues.map((cue) => ({
			...cue,
			startTimeSeconds: cue.startTimeSeconds + offsetSeconds,
			...(cue.tokens
				? {
						tokens: cue.tokens.map((token) => ({
							...token,
							startTime: token.startTime + offsetSeconds,
						})),
					}
				: {}),
		})),
	};
}

function filterTranscriptionCuesToRange({
	transcription,
	startSeconds,
	endSeconds,
}: {
	transcription: TranscribeAudioResult;
	startSeconds: number;
	endSeconds: number;
}): TranscribeAudioResult {
	const cues = transcription.cues.filter((cue) => {
		const cueStart = cue.startTimeSeconds;
		return (
			cueStart >= startSeconds - CHUNK_CUE_BOUNDARY_EPSILON_SECONDS &&
			cueStart < endSeconds - CHUNK_CUE_BOUNDARY_EPSILON_SECONDS
		);
	});
	return {
		...transcription,
		text: cues.map((cue) => cue.text).join(""),
		cues,
	};
}

function mergeChunkedTranscriptions({
	chunks,
	provider,
	model,
	language,
}: {
	chunks: TranscribeAudioResult[];
	provider: string;
	model?: string;
	language?: string;
}): TranscribeAudioResult {
	const cues = chunks
		.flatMap((chunk) => chunk.cues)
		.sort((left, right) => left.startTimeSeconds - right.startTimeSeconds);
	const firstChunk = chunks[0];
	return {
		text: cues.map((cue) => cue.text).join(""),
		cues,
		language: firstChunk?.language ?? language,
		provider: firstChunk?.provider ?? provider,
		model: firstChunk?.model ?? model,
		metadata: {
			...(firstChunk?.metadata ?? {}),
			chunked: true,
			chunkCount: chunks.length,
			chunkDurationSeconds: CLOUD_ASR_CHUNK_DURATION_SECONDS,
			chunkOverlapSeconds: CLOUD_ASR_CHUNK_OVERLAP_SECONDS,
		},
	};
}

function buildCloudAsrChunks({
	durationSeconds,
}: {
	durationSeconds: number;
}): Array<{
	index: number;
	canonicalStartSeconds: number;
	canonicalEndSeconds: number;
	extractStartSeconds: number;
	extractDurationSeconds: number;
}> {
	const chunks: Array<{
		index: number;
		canonicalStartSeconds: number;
		canonicalEndSeconds: number;
		extractStartSeconds: number;
		extractDurationSeconds: number;
	}> = [];
	for (
		let canonicalStartSeconds = 0;
		canonicalStartSeconds < durationSeconds;
		canonicalStartSeconds += CLOUD_ASR_CHUNK_DURATION_SECONDS
	) {
		const canonicalEndSeconds = Math.min(
			durationSeconds,
			canonicalStartSeconds + CLOUD_ASR_CHUNK_DURATION_SECONDS,
		);
		const extractStartSeconds = Math.max(
			0,
			canonicalStartSeconds - CLOUD_ASR_CHUNK_OVERLAP_SECONDS,
		);
		const extractEndSeconds = Math.min(
			durationSeconds,
			canonicalEndSeconds + CLOUD_ASR_CHUNK_OVERLAP_SECONDS,
		);
		chunks.push({
			index: chunks.length,
			canonicalStartSeconds,
			canonicalEndSeconds,
			extractStartSeconds,
			extractDurationSeconds: extractEndSeconds - extractStartSeconds,
		});
	}
	return chunks;
}

function createChunkProgressHandler({
	onProgress,
	chunkIndex,
	chunkCount,
}: {
	onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
	chunkIndex: number;
	chunkCount: number;
}): GenerateSubtitlesFromVideoInput["onProgress"] {
	if (!onProgress) return undefined;
	return (event) => {
		const chunkLabel = `第 ${chunkIndex + 1}/${chunkCount} 段`;
		const mappedCurrent =
			typeof event.current === "number" && typeof event.total === "number"
				? Math.min(
						CLOUD_ASR_PROGRESS_CAP,
						5 + ((chunkIndex + event.current / event.total) / chunkCount) * 90,
					)
				: undefined;
		onProgress({
			...event,
			label:
				event.status === "running"
					? `${chunkLabel} ${event.label}`
					: event.label,
			detail: event.detail ? `${chunkLabel} ${event.detail}` : chunkLabel,
			...(mappedCurrent !== undefined
				? { current: mappedCurrent, total: 100 }
				: {}),
		});
	};
}

export async function transcribeTimelineWithChunkedApi({
	audioExtractor,
	tracks,
	mediaAssets,
	totalDuration,
	audioRange,
	audioRangeSeconds,
	provider,
	language,
	model,
	transcribeAudio,
	abortSignal,
	onProgress,
}: {
	audioExtractor: TimelineAudioExtractor;
	tracks: SceneTracks;
	mediaAssets: ReturnType<EditorCore["media"]["getAssets"]>;
	totalDuration: number;
	audioRange: TranscriptionAudioRange;
	audioRangeSeconds: { startTimeSeconds: number; durationSeconds: number };
	provider: string;
	language?: string;
	model?: string;
	transcribeAudio: (args: {
		audioBlob: Blob;
		onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
	}) => Promise<TranscribeAudioResult>;
	abortSignal?: AbortSignal;
	onProgress?: GenerateSubtitlesFromVideoInput["onProgress"];
}): Promise<TranscribeAudioResult> {
	const chunks = buildCloudAsrChunks({
		durationSeconds: audioRangeSeconds.durationSeconds,
	});
	console.info("[Shotlyx transcription] chunking long ASR audio payload", {
		provider,
		audioRangeKind: audioRange.kind,
		audioRangeLabel: audioRange.label,
		requestedStartSeconds: audioRangeSeconds.startTimeSeconds,
		requestedDurationSeconds: audioRangeSeconds.durationSeconds,
		chunkCount: chunks.length,
		chunkDurationSeconds: CLOUD_ASR_CHUNK_DURATION_SECONDS,
		chunkOverlapSeconds: CLOUD_ASR_CHUNK_OVERLAP_SECONDS,
	});
	const chunkResults: TranscribeAudioResult[] = [];
	for (const chunk of chunks) {
		abortSignal?.throwIfAborted?.();
		onProgress?.({
			stage: "audio-extract",
			label: `正在提取第 ${chunk.index + 1}/${chunks.length} 段音频`,
			status: "running",
			detail: audioRange.label,
		});
		const audioBlob = await audioExtractor({
			tracks,
			mediaAssets,
			totalDuration,
			rangeStart:
				audioRange.startTime +
				Math.round(
					chunk.extractStartSeconds * MEDIA_TIME_TICKS_PER_SECOND,
				),
			rangeDuration: Math.round(
				chunk.extractDurationSeconds * MEDIA_TIME_TICKS_PER_SECOND,
			),
		});
		const payloadDiagnostics = await readAudioPayloadDiagnostics({
			audio: audioBlob,
		});
		console.info("[Shotlyx transcription] extracted ASR audio chunk", {
			provider,
			chunkIndex: chunk.index + 1,
			chunkCount: chunks.length,
			canonicalStartSeconds:
				audioRangeSeconds.startTimeSeconds + chunk.canonicalStartSeconds,
			canonicalEndSeconds:
				audioRangeSeconds.startTimeSeconds + chunk.canonicalEndSeconds,
			extractStartSeconds:
				audioRangeSeconds.startTimeSeconds + chunk.extractStartSeconds,
			extractDurationSeconds: chunk.extractDurationSeconds,
			payloadDurationSeconds: payloadDiagnostics.durationSeconds,
			payloadBytes: payloadDiagnostics.byteLength,
			mimeType: payloadDiagnostics.mimeType,
		});
		const rawChunk = await transcribeAudio({
			audioBlob,
			onProgress: createChunkProgressHandler({
				onProgress,
				chunkIndex: chunk.index,
				chunkCount: chunks.length,
			}),
		});
		const timelineChunk = shiftGeneratedTranscription({
			transcription: rawChunk,
			offsetSeconds: audioRangeSeconds.startTimeSeconds + chunk.extractStartSeconds,
		});
		const boundedChunk = filterTranscriptionCuesToRange({
			transcription: timelineChunk,
			startSeconds:
				audioRangeSeconds.startTimeSeconds + chunk.canonicalStartSeconds,
			endSeconds: audioRangeSeconds.startTimeSeconds + chunk.canonicalEndSeconds,
		});
		console.info("[Shotlyx transcription] received ASR audio chunk result", {
			provider: boundedChunk.provider,
			chunkIndex: chunk.index + 1,
			chunkCount: chunks.length,
			cueCount: boundedChunk.cues.length,
			firstCueStartSeconds: boundedChunk.cues[0]?.startTimeSeconds,
			lastCueStartSeconds:
				boundedChunk.cues[boundedChunk.cues.length - 1]?.startTimeSeconds,
		});
		chunkResults.push(boundedChunk);
	}
	return mergeChunkedTranscriptions({
		chunks: chunkResults,
		provider,
		model,
		language,
	});
}
