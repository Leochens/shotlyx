import { describe, expect, mock, test } from "bun:test";
import {
	EdgeTtsProvider,
	OpenAICompatibleTtsProvider,
	VolcengineTtsProvider,
	createVoiceoverProviderRegistry,
	synthesizeVoiceover,
} from "@/agent/tools/voiceover/providers";
import type {
	EdgeTtsConfig,
	EdgeTtsProviderDeps,
} from "@/agent/tools/voiceover/providers";

describe("voiceover providers", () => {
	test("EdgeTtsProvider uses node-edge-tts and reads generated audio", async () => {
		const ttsPromise = mock(async () => undefined);
		const ttsFactory = mock(() => ({ ttsPromise }));
		const readFile = mock(async () => Buffer.from([1, 2, 3]));
		const rm = mock(async () => undefined);
		const provider = new EdgeTtsProvider({
			ttsFactory,
			readFile: readFile as unknown as EdgeTtsProviderDeps["readFile"],
			rm,
			mkdtemp: async () => "/tmp/shotlyx-voiceover-test",
			tmpdir: () => "/tmp",
			env: {
				EDGE_TTS_PROXY: "http://localhost:7890",
			},
		});

		const result = await provider.synthesize({
			text: "你好，Shotlyx",
			voice: "zh-CN-XiaoxiaoNeural",
			format: "mp3",
			rate: "+10%",
		});

		expect(ttsFactory).toHaveBeenCalledWith(
			expect.objectContaining({
				voice: "zh-CN-XiaoxiaoNeural",
				lang: "zh-CN",
				outputFormat: "audio-24khz-48kbitrate-mono-mp3",
				rate: "+10%",
				pitch: "default",
				volume: "default",
				proxy: "http://localhost:7890",
				timeout: 60_000,
			}),
		);
		expect(ttsPromise).toHaveBeenCalledWith(
			"你好，Shotlyx",
			"/tmp/shotlyx-voiceover-test/voiceover.mp3",
		);
		expect(readFile).toHaveBeenCalledWith(
			"/tmp/shotlyx-voiceover-test/voiceover.mp3",
		);
		expect(result).toMatchObject({
			format: "mp3",
			mimeType: "audio/mpeg",
			provider: "edge-tts",
			voice: "zh-CN-XiaoxiaoNeural",
		});
		expect(Array.from(result.audio)).toEqual([1, 2, 3]);
		expect(rm).toHaveBeenCalled();
	});

	test("EdgeTtsProvider reports timeout with actionable configuration guidance", async () => {
		const ttsPromise = mock(async () => {
			throw new Error("Timed out");
		});
		const ttsFactory = mock(() => ({ ttsPromise }));
		const provider = new EdgeTtsProvider({
			ttsFactory,
			readFile: mock(async () =>
				Buffer.from([]),
			) as unknown as EdgeTtsProviderDeps["readFile"],
			rm: async () => undefined,
			mkdtemp: async () => "/tmp/shotlyx-voiceover-test",
			tmpdir: () => "/tmp",
			env: {
				EDGE_TTS_TIMEOUT_MS: "1234",
			},
		});

		await expect(
			provider.synthesize({
				text: "你好，Shotlyx",
				format: "mp3",
			}),
		).rejects.toThrow(
			"node-edge-tts generation timed out after 1234ms; try increasing EDGE_TTS_TIMEOUT_MS or setting EDGE_TTS_PROXY",
		);
	});

	test("OpenAICompatibleTtsProvider posts to audio speech endpoint", async () => {
		const fetchFn = mock(async () => {
			return new Response(new Uint8Array([4, 5, 6]), {
				headers: { "Content-Type": "audio/mpeg" },
			});
		});
		const provider = new OpenAICompatibleTtsProvider({
			fetchFn: fetchFn as unknown as typeof fetch,
			env: {
				TTS_GENERATION_API_KEY: "key",
				TTS_GENERATION_MODEL: "gpt-4o-mini-tts",
				TTS_GENERATION_VOICE: "alloy",
			},
		});

		const result = await provider.synthesize({
			text: "Hello",
			format: "mp3",
			speed: 1.1,
		});

		expect(fetchFn).toHaveBeenCalledWith(
			"https://api.openai.com/v1/audio/speech",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer key",
				}),
				body: JSON.stringify({
					model: "gpt-4o-mini-tts",
					input: "Hello",
					voice: "alloy",
					response_format: "mp3",
					speed: 1.1,
				}),
			}),
		);
		expect(Array.from(result.audio)).toEqual([4, 5, 6]);
		expect(result.provider).toBe("openai");
	});

	test("VolcengineTtsProvider posts to V3 chunked TTS endpoint", async () => {
		const fetchFn = mock(async () => {
			return new Response(
				[
					JSON.stringify({
						code: 0,
						message: "",
						data: Buffer.from([9, 10]).toString("base64"),
					}),
					JSON.stringify({ code: 20000000, message: "OK", data: null }),
				].join("\n"),
				{
					headers: { "Content-Type": "text/plain" },
				},
			);
		});
		const provider = new VolcengineTtsProvider({
			fetchFn: fetchFn as unknown as typeof fetch,
			env: {
				VOLCENGINE_TTS_API_KEY: "volc-key",
				VOLCENGINE_TTS_DEFAULT_SPEAKER: "zh_female_xiaohe_uranus_bigtts",
			},
		});

		const result = await provider.synthesize({
			text: "你好，Shotlyx",
			format: "mp3",
			speed: 1.25,
		});

		expect(fetchFn).toHaveBeenCalledWith(
			"https://openspeech.bytedance.com/api/v3/tts/unidirectional",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"X-Api-Key": "volc-key",
					"X-Api-Resource-Id": "seed-tts-2.0",
				}),
			}),
		);
		const body = JSON.parse(
			String((fetchFn.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
		) as {
			req_params: {
				speaker: string;
				audio_params: { speech_rate?: number };
			};
		};
		expect(body.req_params.speaker).toBe("zh_female_xiaohe_uranus_bigtts");
		expect(body.req_params.audio_params.speech_rate).toBe(25);
		expect(Array.from(result.audio)).toEqual([9, 10]);
		expect(result.provider).toBe("volcengine");
	});

	test("synthesizeVoiceover defaults to pure JS OpenAI-compatible provider", async () => {
		const fetchFn = mock(async () => {
			return new Response(new Uint8Array([8]), {
				headers: { "Content-Type": "audio/mpeg" },
			});
		});
		const registry = createVoiceoverProviderRegistry({
			openAIDeps: {
				fetchFn: fetchFn as unknown as typeof fetch,
				env: {
					TTS_GENERATION_API_KEY: "key",
					TTS_GENERATION_MODEL: "gpt-4o-mini-tts",
				},
			},
		});

		const result = await synthesizeVoiceover({
			input: { text: "Hello", speed: 1.25 },
			registry,
		});

		expect(result.provider).toBe("openai");
		expect(fetchFn).toHaveBeenCalled();
	});

	test("synthesizeVoiceover maps speed to edge-tts rate only when requested", async () => {
		const ttsPromise = mock(async () => undefined);
		const ttsFactory = mock(() => ({ ttsPromise }));
		const readFile = mock(async () => Buffer.from([7]));
		const registry = createVoiceoverProviderRegistry({
			edgeTtsDeps: {
				ttsFactory,
				readFile: readFile as unknown as EdgeTtsProviderDeps["readFile"],
				rm: async () => undefined,
				mkdtemp: async () => "/tmp/shotlyx-voiceover-test",
				tmpdir: () => "/tmp",
			},
		});

		await synthesizeVoiceover({
			input: { text: "Hello", speed: 1.25, provider: "edge-tts" },
			registry,
		});

		const ttsFactoryCalls = ttsFactory.mock.calls as unknown as Array<
			[EdgeTtsConfig]
		>;
		const edgeConfig = ttsFactoryCalls[0]?.[0];
		expect(edgeConfig).toEqual(expect.objectContaining({ rate: "+25%" }));
	});
});
