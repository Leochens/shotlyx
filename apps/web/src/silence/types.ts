import type { ElementRef } from "@/timeline";
import type { MediaTime } from "@/wasm";

export interface SilenceCutRange {
	startTime: MediaTime;
	endTime: MediaTime;
}

export interface SilenceCutTarget extends ElementRef {
	ranges: SilenceCutRange[];
}

export interface SilenceDetectionOptions {
	thresholdDb: number;
	minSilenceMs: number;
	paddingMs: number;
	windowMs: number;
	mergeGapMs: number;
}

export interface SilenceAnalysisSegment {
	startTime: MediaTime;
	endTime: MediaTime;
	avgDb?: number;
}

export interface SilenceAnalysisTarget extends ElementRef {
	elementName: string;
	segments: SilenceAnalysisSegment[];
}

export interface SilenceAnalysisResult {
	targets: SilenceAnalysisTarget[];
	totalSilenceDuration: MediaTime;
}
