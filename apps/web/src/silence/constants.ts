import type { SilenceDetectionOptions } from "./types";

export const DEFAULT_SILENCE_DETECTION_OPTIONS: SilenceDetectionOptions = {
	thresholdDb: -40,
	minSilenceMs: 350,
	paddingMs: 100,
	windowMs: 20,
	mergeGapMs: 120,
};
