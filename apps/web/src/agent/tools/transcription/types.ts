import type { ToolProgressEvent } from "@/agent/mcp/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";

export const ASR_PROVIDER_IDS = [
	"local",
	"openai-compatible",
	"tencent",
	"volcengine",
	"aliyun",
	"baidu",
	"iflytek",
] as const;

export type AsrProviderId = (typeof ASR_PROVIDER_IDS)[number];

export type AsrSource = "timeline";

export interface AsrProviderConfig {
	id: AsrProviderId;
	displayName: string;
	implemented: boolean;
}

export interface TranscribeAudioInput {
	audio: File;
	language?: string;
	model?: string;
	provider?: string;
}

export interface TranscriptionCue {
	text: string;
	startTimeSeconds: number;
	durationSeconds: number;
	tokens?: SubtitleToken[];
}

export interface TranscribeAudioResult {
	text: string;
	cues: TranscriptionCue[];
	language?: string;
	provider: string;
	model?: string;
	metadata?: Record<string, unknown>;
}

export interface AsrProvider {
	id: AsrProviderId;
	transcribe(input: TranscribeAudioInput): Promise<TranscribeAudioResult>;
}

export interface GenerateSubtitlesFromVideoInput {
	source?: AsrSource;
	provider?: string;
	language?: string;
	model?: string;
	style?: string;
	placement?: string;
	trackId?: string;
	abortSignal?: AbortSignal;
	onProgress?: (event: ToolProgressEvent) => void;
}

export interface GenerateSubtitlesFromVideoResult {
	imported: boolean;
	provider: string;
	cueCount: number;
	groupId?: string;
	trackId?: string;
	language?: string;
	model?: string;
	text?: string;
	metadata?: Record<string, unknown>;
}

export interface TranscriptionToolDeps {
	generateSubtitlesFromVideo(
		input: GenerateSubtitlesFromVideoInput,
	): Promise<GenerateSubtitlesFromVideoResult>;
}

export function transcriptionCueToSubtitleCue({
	cue,
}: {
	cue: TranscriptionCue;
}): SubtitleLayerCue {
	return {
		text: cue.text,
		startTime: cue.startTimeSeconds,
		duration: cue.durationSeconds,
		tokens: cue.tokens,
	};
}
