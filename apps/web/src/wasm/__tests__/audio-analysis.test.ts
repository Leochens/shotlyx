import { describe, expect, mock, test } from "bun:test";

mock.module("opencut-wasm", () => ({}));

describe("audio silence analysis", () => {
	test("falls back to local detection when wasm silence export is missing", async () => {
		const { detectSilenceSegments } = await import("@/wasm/audio-analysis");
		const samples = new Float32Array([
			...Array.from({ length: 200 }, () => 0.5),
			...Array.from({ length: 300 }, () => 0),
			...Array.from({ length: 200 }, () => 0.5),
		]);

		const segments = detectSilenceSegments({
			samples,
			options: {
				sampleRate: 1_000,
				thresholdDb: -40,
				minSilenceMs: 100,
				paddingMs: 0,
				windowMs: 10,
				mergeGapMs: 0,
			},
		});

		expect(segments).toEqual([
			{
				startSample: 200,
				endSample: 500,
				startSeconds: 0.2,
				endSeconds: 0.5,
				durationSeconds: 0.3,
			},
		]);
	});
});
