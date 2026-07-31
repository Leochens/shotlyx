export {
	EdgeTtsProvider,
	OpenAICompatibleTtsProvider,
	VOICEOVER_PROVIDER_CONFIGS,
	VoiceoverProviderRegistry,
	createVoiceoverProviderRegistry,
	synthesizeVoiceover,
} from "./providers";
export type {
	EdgeTtsProviderDeps,
	EdgeTtsClient,
	EdgeTtsConfig,
	EdgeTtsFactory,
	OpenAITtsProviderDeps,
} from "./providers";
export {
	buildVoiceoverTools,
	createVoiceoverToolDeps,
} from "./voiceover-tools";
export type { CreateVoiceoverToolDepsOptions } from "./voiceover-tools";
export type {
	GenerateVoiceoverAudioInput,
	GenerateVoiceoverAudioResult,
	SynthesizeVoiceoverInput,
	VoiceoverAudio,
	VoiceoverAudioAsset,
	VoiceoverAudioFormat,
	VoiceoverCandidateMetadata,
	VoiceoverProvider,
	VoiceoverProviderConfig,
	VoiceoverProviderId,
	VoiceoverToolDeps,
} from "./types";
