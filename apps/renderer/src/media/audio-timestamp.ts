export interface TimestampedAudioChunkLayoutInput {
	timestamp: number;
	length: number;
}

export interface TimestampedAudioChunkPlacement {
	chunkIndex: number;
	outputStartSample: number;
	sourceStartSample: number;
	samplesToCopy: number;
}

export interface TimestampedAudioChunkLayout {
	totalSamples: number;
	placements: TimestampedAudioChunkPlacement[];
}

export function buildTimestampedAudioChunkLayout({
	chunks,
	sampleRate,
}: {
	chunks: TimestampedAudioChunkLayoutInput[];
	sampleRate: number;
}): TimestampedAudioChunkLayout {
	let totalSamples = 0;
	const placements: TimestampedAudioChunkPlacement[] = [];

	chunks.forEach((chunk, chunkIndex) => {
		const rawStartSample = Number.isFinite(chunk.timestamp)
			? Math.round(chunk.timestamp * sampleRate)
			: totalSamples;
		const sourceStartSample =
			rawStartSample < 0 ? Math.min(chunk.length, -rawStartSample) : 0;
		const outputStartSample = Math.max(0, rawStartSample);
		const samplesToCopy = Math.max(0, chunk.length - sourceStartSample);

		placements.push({
			chunkIndex,
			outputStartSample,
			sourceStartSample,
			samplesToCopy,
		});
		totalSamples = Math.max(totalSamples, outputStartSample + samplesToCopy);
	});

	return {
		totalSamples,
		placements,
	};
}
