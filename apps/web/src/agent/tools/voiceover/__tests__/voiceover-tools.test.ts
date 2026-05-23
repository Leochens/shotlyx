import { describe, expect, mock, test } from "bun:test";
import type { GenerateVoiceoverAudioInput } from "@/agent/tools/voiceover/types";
import type { EditorCore } from "@/core";
import type {
	ProcessedMediaAsset,
	processMediaAssets,
} from "@/media/processing";
import {
	buildVoiceoverTools,
	createVoiceoverToolDeps,
} from "@/agent/tools/voiceover/voiceover-tools";

function getVoiceoverTool() {
	const generateVoiceoverAudio = mock(async () => ({
		asset: {
			id: "audio_1",
			name: "Narration.wav",
			url: "blob:narration",
			mimeType: "audio/wav",
			durationSeconds: 3.2,
			sizeBytes: 1024,
		},
		candidate: {
			id: "voiceover_1",
			provider: "mock-tts",
			voice: "mei",
			language: "zh-CN",
			speed: 1.2,
			text: "你好，Shotlyx",
			title: "Narration.wav",
			status: "generated" as const,
		},
		metadata: { model: "mock-voice-v1" },
	}));
	const [tool] = buildVoiceoverTools({
		deps: { generateVoiceoverAudio },
	});
	if (!tool) throw new Error("Expected voiceover tool");
	return { tool, generateVoiceoverAudio };
}

describe("voiceover tools", () => {
	test("builds agent_generate_voiceover schema", () => {
		const { tool } = getVoiceoverTool();

		expect(tool.name).toBe("agent_generate_voiceover");
		expect(tool.parameters).toMatchObject({
			text: { type: "string" },
			voice: { type: "string", optional: true },
			language: { type: "string", optional: true },
			speed: { type: "number", optional: true },
			provider: { type: "string", optional: true },
		});
	});

	test("calls injected generator and returns audio metadata", async () => {
		const { tool, generateVoiceoverAudio } = getVoiceoverTool();
		const abortController = new AbortController();
		const progressEvents: unknown[] = [];

		const result = await tool.handler(
			{
				text: "  你好，Shotlyx  ",
				voice: "mei",
				language: "zh-CN",
				speed: 1.2,
				provider: "mock-tts",
			},
			{
				signal: abortController.signal,
				onProgress: (event) => progressEvents.push(event),
			},
		);

		const generatorCalls = generateVoiceoverAudio.mock
			.calls as unknown as Array<[GenerateVoiceoverAudioInput]>;
		const generatorCall = generatorCalls[0]?.[0];
		expect(generatorCall).toMatchObject({
			text: "你好，Shotlyx",
			voice: "mei",
			language: "zh-CN",
			speed: 1.2,
			provider: "mock-tts",
			abortSignal: abortController.signal,
		});
		expect(typeof generatorCall?.onProgress).toBe("function");
		expect(result).toMatchObject({
			asset: {
				id: "audio_1",
				name: "Narration.wav",
				mimeType: "audio/wav",
			},
			candidate: {
				id: "voiceover_1",
				provider: "mock-tts",
				voice: "mei",
				language: "zh-CN",
				speed: 1.2,
				text: "你好，Shotlyx",
			},
			candidates: [
				{
					id: "voiceover_1",
					provider: "mock-tts",
				},
			],
			metadata: { model: "mock-voice-v1" },
		});
		expect(progressEvents).toMatchObject([
			{ stage: "generation", status: "running" },
			{ stage: "generation", status: "success" },
		]);
	});

	test("uses defaults and creates fallback candidate from asset", async () => {
		const generateVoiceoverAudio = mock(async () => ({
			asset: {
				id: "audio_default",
				name: "Voiceover.mp3",
				url: "blob:voiceover",
				mimeType: "audio/mpeg",
			},
		}));
		const [tool] = buildVoiceoverTools({
			deps: { generateVoiceoverAudio },
		});

		const result = await tool?.handler({ text: "Hello" });

		const generatorCalls = generateVoiceoverAudio.mock
			.calls as unknown as Array<[GenerateVoiceoverAudioInput]>;
		const generatorCall = generatorCalls[0]?.[0];
		expect(generatorCall).toMatchObject({
			text: "Hello",
			voice: undefined,
			language: undefined,
			speed: 1,
			provider: "default",
			abortSignal: undefined,
		});
		expect(typeof generatorCall?.onProgress).toBe("undefined");
		expect(result).toMatchObject({
			asset: { id: "audio_default" },
			candidate: {
				provider: "default",
				speed: 1,
				text: "Hello",
				status: "generated",
				audio: { id: "audio_default" },
			},
		});
	});

	test("validates speed range", async () => {
		const { tool } = getVoiceoverTool();

		await expect(tool.handler({ text: "Hello", speed: 10 })).rejects.toThrow(
			'"speed" 必须在 0.25 到 4 之间',
		);
	});

	test("requires injected provider implementation", async () => {
		const [tool] = buildVoiceoverTools();

		await expect(tool?.handler({ text: "Hello" })).rejects.toThrow(
			"请注入 generateVoiceoverAudio",
		);
	});

	test("client voiceover deps emit provider and import progress stages", async () => {
		const progressEvents: Array<{ stage?: string; status?: string }> = [];
		const addMediaAsset = mock(
			async ({ asset }: { asset: ProcessedMediaAsset }) => ({
				...asset,
				id: "audio_1",
				url: "blob:audio_1",
				duration: 2.4,
			}),
		);
		const editor = {
			project: {
				getActiveOrNull: () => ({ metadata: { id: "project-1" } }),
			},
			media: {
				addMediaAsset,
			},
		} as unknown as EditorCore;
		const fetchFn = mock(async () => {
			return new Response(new Uint8Array([1, 2, 3]), {
				headers: {
					"Content-Type": "audio/mpeg",
					"x-voiceover-filename": "Narration.mp3",
					"x-voiceover-provider": "edge-tts",
				},
			});
		});
		const processMediaAssetsFn = mock(
			async ({ files }: { files: FileList | File[] }) => {
				const [file] = Array.from(files);
				if (!file) return [];
				return [
					{
						file,
						name: file.name,
						type: "audio" as const,
						duration: 2.4,
						url: "blob:processed",
					},
				] satisfies ProcessedMediaAsset[];
			},
		);
		const deps = createVoiceoverToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			processMediaAssetsFn:
				processMediaAssetsFn as unknown as typeof processMediaAssets,
		});

		await deps.generateVoiceoverAudio({
			text: "你好，Shotlyx",
			speed: 1,
			provider: "edge-tts",
			onProgress: (event) => progressEvents.push(event),
		});

		expect(progressEvents).toMatchObject([
			{ stage: "voiceover-provider", status: "running" },
			{ stage: "voiceover-provider", status: "success" },
			{ stage: "voiceover-import", status: "running" },
			{ stage: "voiceover-import", status: "running" },
			{ stage: "voiceover-import", status: "success" },
		]);
	});
});
