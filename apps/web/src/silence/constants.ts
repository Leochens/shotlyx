import type { SilenceDetectionOptions } from "./types";

export const DEFAULT_SILENCE_DETECTION_OPTIONS: SilenceDetectionOptions = {
	thresholdDb: -50,
	minSilenceMs: 500,
	paddingMs: 100,
	windowMs: 20,
	mergeGapMs: 120,
};
