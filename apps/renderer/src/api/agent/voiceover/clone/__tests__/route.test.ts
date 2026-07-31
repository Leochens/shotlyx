import { afterEach, describe, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";
import { POST as cloneVoice } from "../route";
import { POST as getCloneStatus } from "../status/route";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
});

describe("Volcengine voice clone routes", () => {
	test("submits recorded audio to the V3 voice_clone API", async () => {
		process.env.VOLCENGINE_TTS_API_KEY = "tts-key";
		const fetchFn: typeof fetch = mock(
			async (input: string | Request | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v3/tts/voice_clone",
				);
				expect(init?.headers).toMatchObject({
					"Content-Type": "application/json",
					"X-Api-Key": "tts-key",
				});
				const body = JSON.parse(String(init?.body));
				expect(body).toMatchObject({
					speaker_id: "S_test",
					audio: {
						data: "AQID",
						format: "wav",
					},
					text: "你好，欢迎使用 Shotlyx。",
					language: 0,
					extra_params: {
						demo_text: "这是克隆后的试听音频。",
						enable_audio_denoise: false,
					},
				});
				return Response.json({
					speaker_id: "S_test",
					status: 1,
					available_training_times: 14,
				});
			},
		);
		globalThis.fetch = fetchFn;

		const form = new FormData();
		form.set("speakerId", "S_test");
		form.set("audioFormat", "wav");
		form.set("language", "0");
		form.set("text", "你好，欢迎使用 Shotlyx。");
		form.set("demoText", "这是克隆后的试听音频。");
		form.set("enableAudioDenoise", "false");
		form.set(
			"audio",
			new File([new Uint8Array([1, 2, 3]).buffer], "sample.wav", {
				type: "audio/wav",
			}),
		);

		const response = await cloneVoice(
			new ApiRequest("http://localhost/api/agent/voiceover/clone", {
				method: "POST",
				body: form,
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			provider: "volcengine",
			speakerId: "S_test",
			resourceId: "seed-icl-2.0",
			status: "training",
			availableTrainingTimes: 14,
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("queries clone progress with get_voice", async () => {
		process.env.VOLCENGINE_TTS_API_KEY = "tts-key";
		const fetchFn: typeof fetch = mock(
			async (input: string | Request | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://openspeech.bytedance.com/api/v3/tts/get_voice",
				);
				expect(init?.headers).toMatchObject({
					"Content-Type": "application/json",
					"X-Api-Key": "tts-key",
				});
				expect(JSON.parse(String(init?.body))).toMatchObject({
					speaker_id: "S_test",
				});
				return Response.json({
					speaker_id: "S_test",
					status: 2,
					speaker_status: [
						{
							model_type: 4,
							demo_audio: "https://example.com/demo.wav",
						},
					],
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await getCloneStatus(
			new ApiRequest("http://localhost/api/agent/voiceover/clone/status", {
				method: "POST",
				body: JSON.stringify({ speakerId: "S_test" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			provider: "volcengine",
			speakerId: "S_test",
			status: "available",
			demoAudio: "https://example.com/demo.wav",
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});
});
