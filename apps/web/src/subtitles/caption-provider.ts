export const CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS = [
	{
		id: "volcengine",
		label: "Volcengine / Doubao",
		startStep: "Generating captions with Volcengine...",
	},
	{
		id: "local",
		label: "Local Whisper",
		startStep: "Generating captions locally...",
	},
] as const;

export type CaptionTranscriptionProvider =
	(typeof CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS)[number]["id"];

export const DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER: CaptionTranscriptionProvider =
	"volcengine";

export function isCaptionTranscriptionProvider(
	value: string,
): value is CaptionTranscriptionProvider {
	return CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS.some(
		(option) => option.id === value,
	);
}

export function getCaptionProviderStartStep({
	provider,
}: {
	provider: CaptionTranscriptionProvider;
}): string {
	return (
		CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS.find(
			(option) => option.id === provider,
		)?.startStep ?? "Generating captions..."
	);
}
