import { afterEach, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
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
