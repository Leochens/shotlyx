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
		return detectSilenceSegmentsInJs({ samples, options });
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

function detectSilenceSegmentsInJs({
	samples,
	options,
}: {
	samples: Float32Array;
	options: WasmSilenceDetectionOptions;
}): WasmSilenceSegment[] {
	validateOptions({ options });
	if (samples.length === 0) return [];

	const windowSamples = Math.max(
		1,
		millisecondsToSamples({
			milliseconds: options.windowMs,
			sampleRate: options.sampleRate,
			mode: "round",
		}),
	);
	const minSilenceSamples = millisecondsToSamples({
		milliseconds: options.minSilenceMs,
		sampleRate: options.sampleRate,
		mode: "ceil",
	});
	const paddingSamples = millisecondsToSamples({
		milliseconds: options.paddingMs,
		sampleRate: options.sampleRate,
		mode: "round",
	});
	const mergeGapSamples = millisecondsToSamples({
		milliseconds: options.mergeGapMs,
		sampleRate: options.sampleRate,
		mode: "round",
	});

	const ranges = mergeCloseRanges({
		ranges: detectRawSilenceRanges({
			samples,
			windowSamples,
			thresholdDb: options.thresholdDb,
		}),
		mergeGapSamples,
	});

	return ranges.flatMap(([rangeStartSample, rangeEndSample]) => {
		const startSample = Math.min(
			samples.length,
			rangeStartSample + paddingSamples,
		);
		const endSample = Math.max(0, rangeEndSample - paddingSamples);
		if (endSample <= startSample) return [];
		if (endSample - startSample < minSilenceSamples) return [];
		return [
			buildSegment({
				startSample,
				endSample,
				sampleRate: options.sampleRate,
			}),
		];
	});
}

function validateOptions({
	options,
}: {
	options: WasmSilenceDetectionOptions;
}): void {
	if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
		throw new Error("sampleRate must be a positive finite number");
	}
	if (!Number.isFinite(options.thresholdDb)) {
		throw new Error("thresholdDb must be finite");
	}
	if (!Number.isFinite(options.minSilenceMs) || options.minSilenceMs < 0) {
		throw new Error("minSilenceMs must be a finite non-negative number");
	}
	if (!Number.isFinite(options.paddingMs) || options.paddingMs < 0) {
		throw new Error("paddingMs must be a finite non-negative number");
	}
	if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
		throw new Error("windowMs must be a positive finite number");
	}
	if (!Number.isFinite(options.mergeGapMs) || options.mergeGapMs < 0) {
		throw new Error("mergeGapMs must be a finite non-negative number");
	}
}

function detectRawSilenceRanges({
	samples,
	windowSamples,
	thresholdDb,
}: {
	samples: Float32Array;
	windowSamples: number;
	thresholdDb: number;
}): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	let currentStart: number | null = null;
	let start = 0;

	while (start < samples.length) {
		const end = Math.min(samples.length, start + windowSamples);
		const isSilent =
			windowDbfs({ samples, startSample: start, endSample: end }) <= thresholdDb;

		if (currentStart === null && isSilent) {
			currentStart = start;
		} else if (currentStart !== null && !isSilent) {
			ranges.push([currentStart, start]);
			currentStart = null;
		}

		start = end;
	}

	if (currentStart !== null) {
		ranges.push([currentStart, samples.length]);
	}

	return ranges;
}

function mergeCloseRanges({
	ranges,
	mergeGapSamples,
}: {
	ranges: Array<[number, number]>;
	mergeGapSamples: number;
}): Array<[number, number]> {
	const merged: Array<[number, number]> = [];
	for (const [startSample, endSample] of ranges) {
		const previous = merged[merged.length - 1];
		if (previous && startSample - previous[1] <= mergeGapSamples) {
			previous[1] = endSample;
			continue;
		}
		merged.push([startSample, endSample]);
	}
	return merged;
}

function windowDbfs({
	samples,
	startSample,
	endSample,
}: {
	samples: Float32Array;
	startSample: number;
	endSample: number;
}): number {
	if (endSample <= startSample) return Number.NEGATIVE_INFINITY;
	let sumSquares = 0;
	for (let index = startSample; index < endSample; index++) {
		const sample = samples[index];
		const finiteSample = Number.isFinite(sample) ? sample : 0;
		sumSquares += finiteSample * finiteSample;
	}
	const rms = Math.sqrt(sumSquares / (endSample - startSample));
	return rms <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(rms);
}

function millisecondsToSamples({
	milliseconds,
	sampleRate,
	mode,
}: {
	milliseconds: number;
	sampleRate: number;
	mode: "ceil" | "round";
}): number {
	const samples = (milliseconds / 1_000) * sampleRate;
	return mode === "ceil" ? Math.ceil(samples) : Math.round(samples);
}

function buildSegment({
	startSample,
	endSample,
	sampleRate,
}: {
	startSample: number;
	endSample: number;
	sampleRate: number;
}): WasmSilenceSegment {
	const startSeconds = startSample / sampleRate;
	const endSeconds = endSample / sampleRate;
	return {
		startSample,
		endSample,
		startSeconds,
		endSeconds,
		durationSeconds: endSeconds - startSeconds,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
