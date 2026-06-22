import { afterEach, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;

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

function wavFile({ durationSeconds }: { durationSeconds: number }): File {
	const sampleRate = 44_100;
	const channels = 2;
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

	return new File([buffer], "timeline.wav", { type: "audio/wav" });
}

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
	console.info = originalConsoleInfo;
	mock.restore();
});

test("transcription route forwards reference text to the ASR provider", async () => {
	const { POST } = await import("../route");
	process.env = {
		...originalEnv,
		ASR_API_KEY: "asr-key",
		ASR_BASE_URL: "https://asr.example.test/v1",
		ASR_MODEL: "whisper-1",
	};
	const fetchFn: typeof fetch = mock(async (_input, init) => {
		if (!(init?.body instanceof FormData)) {
			throw new Error(
				"Expected transcription provider request body to be FormData",
			);
		}
		const body = init.body;
		expect(body.get("prompt")).toBe(
			"脚本提示：产品名是 Shotlyx，字幕不要识别成 short links。",
		);
		return Response.json({
			segments: [{ end: 1, start: 0, text: "Shotlyx 字幕" }],
			text: "Shotlyx 字幕",
		});
	});
	globalThis.fetch = fetchFn;

	const form = new FormData();
	form.set("provider", "openai-compatible");
	form.set("language", "zh");
	form.set("model", "whisper-1");
	form.set(
		"referenceText",
		"脚本提示：产品名是 Shotlyx，字幕不要识别成 short links。",
	);
	form.set(
		"audio",
		new File([new Uint8Array([1, 2, 3])], "timeline.wav", {
			type: "audio/wav",
		}),
	);

	const response = await POST(
		new ApiRequest("http://localhost/api/agent/transcription", {
			method: "POST",
			body: form,
		}),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		provider: "openai-compatible",
		text: "Shotlyx 字幕",
	});
	expect(fetchFn).toHaveBeenCalledTimes(1);
});

test("transcription route logs the actual audio file duration received for ASR", async () => {
	const { POST } = await import("../route");
	process.env = {
		...originalEnv,
		ASR_API_KEY: "asr-key",
		ASR_BASE_URL: "https://asr.example.test/v1",
		ASR_MODEL: "whisper-1",
	};
	const consoleInfo: typeof console.info = mock(() => {});
	console.info = consoleInfo;
	const fetchFn: typeof fetch = mock(async () => {
		return Response.json({
			segments: [{ end: 1, start: 0, text: "短音频" }],
			text: "短音频",
		});
	});
	globalThis.fetch = fetchFn;

	const form = new FormData();
	form.set("provider", "openai-compatible");
	form.set("audio", wavFile({ durationSeconds: 1.75 }));

	const response = await POST(
		new ApiRequest("http://localhost/api/agent/transcription", {
			method: "POST",
			body: form,
		}),
	);

	expect(response.status).toBe(200);
	expect(consoleInfo).toHaveBeenCalledWith(
		"[Shotlyx transcription] received ASR audio payload",
		expect.objectContaining({
			provider: "openai-compatible",
			payloadDurationSeconds: 1.75,
			payloadBytes: expect.any(Number),
			audioName: "timeline.wav",
		}),
	);
});
