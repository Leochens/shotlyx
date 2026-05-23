import * as wasm from "opencut-wasm";

export interface WasmSilenceDetectionOptions {
	sampleRate: number;
	thresholdDb: number;
	minSilenceMs: number;
	paddingMs: number;
	windowMs: number;
	mergeGapMs: number;
}

export interface WasmSilenceSegment {
	startSample: number;
	endSample: number;
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
}

type WasmWithSilenceDetection = typeof wasm & {
	detectSilenceSegments?: (
		samples: Float32Array,
		options: WasmSilenceDetectionOptions,
	) => unknown;
};

export function detectSilenceSegments({
	samples,
	options,
}: {
	samples: Float32Array;
	options: WasmSilenceDetectionOptions;
}): WasmSilenceSegment[] {
	const detect = (wasm as WasmWithSilenceDetection).detectSilenceSegments;
	if (typeof detect !== "function") {
		throw new Error(
			"Silence detection is not available. Rebuild and link the local opencut-wasm package.",
		);
	}

	const result = detect(samples, options);
	if (!Array.isArray(result)) {
		return [];
	}

	return result.flatMap((segment): WasmSilenceSegment[] => {
		if (!isRecord(segment)) {
			return [];
		}

		const startSeconds = numberValue(segment.startSeconds);
		const endSeconds = numberValue(segment.endSeconds);
		const durationSeconds = numberValue(segment.durationSeconds);
		const startSample = numberValue(segment.startSample);
		const endSample = numberValue(segment.endSample);
		if (
			startSeconds === null ||
			endSeconds === null ||
			durationSeconds === null ||
			startSample === null ||
			endSample === null
		) {
			return [];
		}

		return [
			{
				startSeconds,
				endSeconds,
				durationSeconds,
				startSample,
				endSample,
			},
		];
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
