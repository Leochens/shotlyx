/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally inspect fetch calls and FormData payloads. */
import { describe, expect, mock, test } from "bun:test";
import {
	OpenAICompatibleAsrProvider,
	createAsrProviderRegistry,
	transcribeAudio,
} from "@/agent/tools/transcription/providers";

describe("ASR providers", () => {
	test("OpenAICompatibleAsrProvider posts audio to the transcription endpoint", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "你好 Shotlyx",
					segments: [{ text: "你好 Shotlyx", start: 0.25, end: 1.75 }],
					language: "zh",
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const provider = new OpenAICompatibleAsrProvider({
			fetchFn: fetchFn as unknown as typeof fetch,
			env: {
				ASR_API_KEY: "asr-key",
				ASR_BASE_URL: "https://asr.example.test/v1/",
				ASR_MODEL: "whisper-large-v3",
			},
		});

		const result = await provider.transcribe({
			audio: new File([new Uint8Array([1, 2, 3])], "timeline.wav", {
				type: "audio/wav",
			}),
			language: "zh",
		});

		expect(fetchFn).toHaveBeenCalledWith(
			"https://asr.example.test/v1/audio/transcriptions",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer asr-key",
				}),
			}),
		);
		const fetchCalls = fetchFn.mock.calls as unknown as Array<
			[string, RequestInit]
		>;
		const init = fetchCalls[0]?.[1];
		expect(init?.body).toBeInstanceOf(FormData);
		const form = init?.body as FormData;
		expect(form.get("model")).toBe("whisper-large-v3");
		expect(form.get("language")).toBe("zh");
		expect(form.get("response_format")).toBe("verbose_json");
		expect(result).toMatchObject({
			text: "你好 Shotlyx",
			language: "zh",
			provider: "openai-compatible",
			cues: [
				{
					text: "你好 Shotlyx",
					startTimeSeconds: 0.25,
					durationSeconds: 1.5,
				},
			],
		});
	});

	test("transcribeAudio selects the configured provider", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "测试字幕",
					segments: [{ text: "测试字幕", start: 1, end: 2 }],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const registry = createAsrProviderRegistry({
			openAICompatibleDeps: {
				fetchFn: fetchFn as unknown as typeof fetch,
				env: {
					ASR_PROVIDER: "openai-compatible",
					ASR_API_KEY: "key",
					ASR_MODEL: "whisper-1",
				},
			},
		});

		const result = await transcribeAudio({
			input: {
				audio: new File([new Uint8Array([4])], "audio.wav", {
					type: "audio/wav",
				}),
			},
			registry,
		});

		expect(result.provider).toBe("openai-compatible");
		expect(result.cues).toHaveLength(1);
	});

	test("transcribeAudio rejects unimplemented domestic providers with configuration guidance", async () => {
		const registry = createAsrProviderRegistry({
			openAICompatibleDeps: {
				env: {
					ASR_PROVIDER: "tencent",
					ASR_API_KEY: "key",
					ASR_MODEL: "16k_zh",
				},
			},
		});

		await expect(
			transcribeAudio({
				input: {
					audio: new File([new Uint8Array([5])], "audio.wav", {
						type: "audio/wav",
					}),
				},
				registry,
			}),
		).rejects.toThrow(
			'provider_unsupported: ASR provider "tencent" is reserved but not implemented yet',
		);
	});
});
