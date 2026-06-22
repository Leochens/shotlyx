export interface AudioPayloadDiagnostics {
	byteLength: number;
	durationSeconds?: number;
	mimeType?: string;
}

const WAV_HEADER_READ_LIMIT_BYTES = 1024 * 1024;

function readAscii({
	view,
	offset,
	length,
}: {
	view: DataView;
	offset: number;
	length: number;
}): string {
	let value = "";
	for (let index = 0; index < length; index += 1) {
		value += String.fromCharCode(view.getUint8(offset + index));
	}
	return value;
}

function readWavDurationSeconds({
	buffer,
}: {
	buffer: ArrayBuffer;
}): number | undefined {
	const view = new DataView(buffer);
	if (view.byteLength < 44) return undefined;
	if (
		readAscii({ view, offset: 0, length: 4 }) !== "RIFF" ||
		readAscii({ view, offset: 8, length: 4 }) !== "WAVE"
	) {
		return undefined;
	}

	let byteRate: number | undefined;
	let dataSize: number | undefined;
	let offset = 12;
	while (offset + 8 <= view.byteLength) {
		const chunkId = readAscii({ view, offset, length: 4 });
		const chunkSize = view.getUint32(offset + 4, true);
		const chunkDataOffset = offset + 8;
		if (chunkDataOffset + chunkSize > view.byteLength) break;

		if (chunkId === "fmt " && chunkSize >= 16) {
			byteRate = view.getUint32(chunkDataOffset + 8, true);
		} else if (chunkId === "data") {
			dataSize = chunkSize;
		}

		if (byteRate && dataSize !== undefined) break;
		offset = chunkDataOffset + chunkSize + (chunkSize % 2);
	}

	if (!byteRate || dataSize === undefined) return undefined;
	return dataSize / byteRate;
}

export async function readAudioPayloadDiagnostics({
	audio,
}: {
	audio: Blob;
}): Promise<AudioPayloadDiagnostics> {
	const header = await audio
		.slice(0, Math.min(audio.size, WAV_HEADER_READ_LIMIT_BYTES))
		.arrayBuffer();
	return {
		byteLength: audio.size,
		mimeType: audio.type || undefined,
		durationSeconds: readWavDurationSeconds({ buffer: header }),
	};
}
