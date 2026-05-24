/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally inspect fetch calls, FormData payloads, and provider request bodies. */
import { describe, expect, mock, test } from "bun:test";
import {
	ASR_PROVIDER_CONFIGS,
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

	test("transcribeAudio defaults to Volcengine when no provider is configured", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					result: {
						text: "默认火山",
						utterances: [
							{
								start_time: 0,
								end_time: 1000,
								text: "默认火山",
								words: [
									{ text: "默", start_time: 0, end_time: 250 },
									{ text: "认", start_time: 250, end_time: 500 },
									{ text: "火", start_time: 500, end_time: 750 },
									{ text: "山", start_time: 750, end_time: 1000 },
								],
							},
						],
					},
				}),
				{
					headers: {
						"Content-Type": "application/json",
						"X-Api-Status-Code": "20000000",
					},
				},
			);
		});
		const registry = createAsrProviderRegistry({
			volcengineDeps: {
				fetchFn: fetchFn as unknown as typeof fetch,
				env: { VOLCENGINE_ASR_API_KEY: "test-key" },
			},
		});

		const result = await transcribeAudio({
			registry,
			input: {
				audio: new File([new Uint8Array([1])], "audio.wav", {
					type: "audio/wav",
				}),
			},
		});

		expect(result.provider).toBe("volcengine");
		expect(result.cues[0]?.tokens).toHaveLength(4);
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

	test("marks Volcengine as an implemented provider", () => {
		expect(
			ASR_PROVIDER_CONFIGS.find((provider) => provider.id === "volcengine"),
		).toMatchObject({
			implemented: true,
		});
	});

	test("normalizes Volcengine flash response into word-timed cues", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					audio_info: { duration: 2499 },
					result: {
						text: "关闭透传。",
						utterances: [
							{
								start_time: 450,
								end_time: 1530,
								text: "关闭透传。",
								words: [
									{ text: "关", start_time: 450, end_time: 770 },
									{ text: "闭", start_time: 770, end_time: 970 },
									{ text: "透", start_time: 1130, end_time: 1210 },
									{ text: "传", start_time: 1490, end_time: 1530 },
								],
							},
						],
					},
				}),
				{
					headers: {
						"Content-Type": "application/json",
						"X-Api-Status-Code": "20000000",
						"X-Tt-Logid": "log-1",
					},
				},
			);
		});
		const registry = createAsrProviderRegistry({
			volcengineDeps: {
				fetchFn: fetchFn as unknown as typeof fetch,
				env: { VOLCENGINE_ASR_API_KEY: "test-key" },
			},
		});

		const result = await transcribeAudio({
			registry,
			input: {
				provider: "volcengine",
				audio: new File([new Uint8Array([1, 2, 3])], "audio.wav", {
					type: "audio/wav",
				}),
			},
		});

		expect(result).toMatchObject({
			provider: "volcengine",
			text: "关闭透传。",
			cues: [
				{
					text: "关闭透传。",
					startTimeSeconds: 0.45,
					durationSeconds: 1.08,
					tokens: [
						{ text: "关", startTime: 0.45, duration: 0.32 },
						{ text: "闭", startTime: 0.77, duration: 0.2 },
						{ text: "透", startTime: 1.13, duration: 0.08 },
						{ text: "传", startTime: 1.49, duration: 0.04 },
					],
				},
			],
			metadata: { mode: "flash", logId: "log-1" },
		});
		const fetchCalls = fetchFn.mock.calls as unknown as Array<
			[unknown, RequestInit]
		>;
		const request = fetchCalls[0]?.[1];
		expect(request?.method).toBe("POST");
		expect(request?.headers).toBeInstanceOf(Headers);
		const body =
			typeof request?.body === "string" ? JSON.parse(request.body) : null;
		expect(body?.audio?.data).toBe("AQID");
	});

	test("keeps Volcengine word timing when word text or timing values use alternate shapes", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					result: {
						text: "我吃苹果",
						utterances: [
							{
								start_time: "1000",
								end_time: "2200",
								text: "我吃苹果",
								words: [
									{ word: "我", start_time: "1000", end_time: "1200" },
									{ word: "吃", start_time: "1200", end_time: "1500" },
									{ word: "苹果", start_time: "1700", end_time: "2200" },
								],
							},
						],
					},
				}),
				{
					headers: {
						"Content-Type": "application/json",
						"X-Api-Status-Code": "20000000",
					},
				},
			);
		});
		const registry = createAsrProviderRegistry({
			volcengineDeps: {
				fetchFn: fetchFn as unknown as typeof fetch,
				env: { VOLCENGINE_ASR_API_KEY: "test-key" },
			},
		});

		const result = await transcribeAudio({
			registry,
			input: {
				provider: "volcengine",
				audio: new File([new Uint8Array([1])], "audio.wav", {
					type: "audio/wav",
				}),
			},
		});

		expect(result.cues[0]).toMatchObject({
			text: "我吃苹果",
			startTimeSeconds: 1,
			durationSeconds: 1.2,
			tokens: [
				{ text: "我", startTime: 1, duration: 0.2 },
				{ text: "吃", startTime: 1.2, duration: 0.3 },
				{ text: "苹果", startTime: 1.7, duration: 0.5 },
			],
		});
	});

	test("Volcengine provider requires the new console API key", async () => {
		const registry = createAsrProviderRegistry({
			volcengineDeps: { env: {} },
		});

		await expect(
			transcribeAudio({
				registry,
				input: {
					provider: "volcengine",
					audio: new File([new Uint8Array([1])], "audio.wav", {
						type: "audio/wav",
					}),
				},
			}),
		).rejects.toThrow("missing VOLCENGINE_ASR_API_KEY");
	});
});
