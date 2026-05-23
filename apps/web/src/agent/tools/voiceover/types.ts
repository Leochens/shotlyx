export const VOICEOVER_PROVIDER_IDS = [
	"edge-tts",
	"openai",
	"google",
	"minimax",
] as const;

export type VoiceoverProviderId = (typeof VOICEOVER_PROVIDER_IDS)[number];

export type VoiceoverAudioFormat = "mp3" | "wav" | "ogg";

export interface SynthesizeVoiceoverInput {
	text: string;
	voice?: string;
	locale?: string;
	format?: VoiceoverAudioFormat;
	speed?: number;
	rate?: string;
	pitch?: string;
	outputPath?: string;
	provider?: string;
}

export interface VoiceoverAudio {
	audio: Uint8Array;
	format: VoiceoverAudioFormat;
	mimeType: string;
	provider: VoiceoverProviderId;
	voice?: string;
	filePath?: string;
}

export interface VoiceoverProvider {
	id: VoiceoverProviderId;
	synthesize(input: SynthesizeVoiceoverInput): Promise<VoiceoverAudio>;
}

export interface VoiceoverProviderConfig {
	id: VoiceoverProviderId;
	displayName: string;
	kind: "cli" | "api";
	implemented: boolean;
}

export interface VoiceoverAudioAsset {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	durationSeconds?: number;
	sizeBytes?: number;
}

export interface VoiceoverCandidateMetadata {
	id?: string;
	provider: string;
	voice?: string;
	language?: string;
	speed: number;
	text: string;
	title?: string;
	status: "pending" | "generated" | "failed";
	audio?: VoiceoverAudioAsset;
	durationSeconds?: number;
	sizeBytes?: number;
	metadata?: Record<string, unknown>;
}

export interface VoiceoverProgressEvent {
	stage: string;
	label: string;
	status: "running" | "success" | "error";
	detail?: string;
	current?: number;
	total?: number;
}

export interface GenerateVoiceoverAudioInput {
	text: string;
	voice?: string;
	language?: string;
	speed: number;
	provider: string;
	abortSignal?: AbortSignal;
	onProgress?: (event: VoiceoverProgressEvent) => void;
}

export interface GenerateVoiceoverAudioResult {
	asset?: VoiceoverAudioAsset;
	candidate?: VoiceoverCandidateMetadata;
	candidates?: VoiceoverCandidateMetadata[];
	message?: string;
	metadata?: Record<string, unknown>;
}

export interface VoiceoverToolDeps {
	generateVoiceoverAudio(
		input: GenerateVoiceoverAudioInput,
	): Promise<GenerateVoiceoverAudioResult>;
}
