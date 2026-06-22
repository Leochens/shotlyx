import { describe, expect, test } from "bun:test";

import { readAudioPayloadDiagnostics } from "./audio-payload-diagnostics";

function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

function wavBlob({
	durationSeconds,
	sampleRate = 44_100,
	channels = 2,
}: {
	durationSeconds: number;
	sampleRate?: number;
	channels?: number;
}): Blob {
	const bitsPerSample = 16;
	const bytesPerSample = bitsPerSample / 8;
	const sampleCount = Math.round(durationSeconds * sampleRate);
	const dataSize = sampleCount * channels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * bytesPerSample, true);
	view.setUint16(32, channels * bytesPerSample, true);
	view.setUint16(34, bitsPerSample, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataSize, true);

	return new Blob([buffer], { type: "audio/wav" });
}

describe("readAudioPayloadDiagnostics", () => {
	test("reports WAV duration and byte length for an ASR payload", async () => {
		const audio = wavBlob({ durationSeconds: 2.5 });

		await expect(readAudioPayloadDiagnostics({ audio })).resolves.toMatchObject({
			byteLength: audio.size,
			durationSeconds: 2.5,
			mimeType: "audio/wav",
		});
	});
});
