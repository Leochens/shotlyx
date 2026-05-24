import { describe, expect, test } from "bun:test";
import { buildTimestampedAudioChunkLayout } from "@/media/audio-timestamp";

describe("timestamped audio chunk layout", () => {
	test("preserves the leading timestamp offset from decoded audio chunks", () => {
		const layout = buildTimestampedAudioChunkLayout({
			sampleRate: 44_100,
			chunks: [
				{
					timestamp: 0.5,
					length: 11_025,
				},
			],
		});

		expect(layout.totalSamples).toBe(33_075);
		expect(layout.placements).toEqual([
			{
				chunkIndex: 0,
				outputStartSample: 22_050,
				sourceStartSample: 0,
				samplesToCopy: 11_025,
			},
		]);
	});

	test("clips negative timestamp priming instead of shifting the timeline left", () => {
		const layout = buildTimestampedAudioChunkLayout({
			sampleRate: 1_000,
			chunks: [
				{
					timestamp: -0.1,
					length: 250,
				},
			],
		});

		expect(layout.totalSamples).toBe(150);
		expect(layout.placements).toEqual([
			{
				chunkIndex: 0,
				outputStartSample: 0,
				sourceStartSample: 100,
				samplesToCopy: 150,
			},
		]);
	});
});
