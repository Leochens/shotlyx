import { audioRangeToSeconds, type TranscriptionAudioRange } from "@/transcription/audio-range";

export type AsrDebugConfirmationMode = "transcript" | "bilingual";

export interface AsrAudioRangeParams {
	audioRangeStartSeconds: number;
	audioRangeDurationSeconds: number;
	audioRangeTrackId?: string;
	audioRangeElementId?: string;
}

export interface AsrDebugConfirmation {
	mode: AsrDebugConfirmationMode;
	label: string;
	startLabel: string;
	durationLabel: string;
	params: AsrAudioRangeParams;
}

export function formatAudioDurationSeconds({
	seconds,
}: {
	seconds: number;
}): string {
	const safeSeconds = Math.max(0, seconds);
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = safeSeconds - minutes * 60;
	return `${String(minutes).padStart(2, "0")}:${remainingSeconds
		.toFixed(1)
		.padStart(4, "0")}`;
}

export function buildAsrDebugConfirmation({
	mode,
	range,
}: {
	mode: AsrDebugConfirmationMode;
	range: TranscriptionAudioRange;
}): AsrDebugConfirmation {
	const { startTimeSeconds, durationSeconds } = audioRangeToSeconds({ range });
	return {
		mode,
		label: range.label,
		startLabel: formatAudioDurationSeconds({ seconds: startTimeSeconds }),
		durationLabel: formatAudioDurationSeconds({ seconds: durationSeconds }),
		params: {
			audioRangeStartSeconds: startTimeSeconds,
			audioRangeDurationSeconds: durationSeconds,
			...(range.elementRef
				? {
						audioRangeTrackId: range.elementRef.trackId,
						audioRangeElementId: range.elementRef.elementId,
					}
				: {}),
		},
	};
}
