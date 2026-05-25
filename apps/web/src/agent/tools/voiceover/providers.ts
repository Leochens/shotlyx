import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EdgeTTS } from "node-edge-tts";
import type {
	SynthesizeVoiceoverInput,
	VoiceoverAudio,
	VoiceoverAudioFormat,
	VoiceoverProvider,
	VoiceoverProviderConfig,
	VoiceoverProviderId,
} from "./types";
import {
	DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID,
	DEFAULT_VOLCENGINE_TTS_RESOURCE_ID,
	DEFAULT_VOLCENGINE_TTS_SPEAKER,
} from "./voices";

const DEFAULT_VOICEOVER_PROVIDER: VoiceoverProviderId = "openai";
const DEFAULT_EDGE_TTS_VOICE = "zh-CN-XiaoyiNeural";
const DEFAULT_EDGE_TTS_LANG = "zh-CN";
const DEFAULT_EDGE_TTS_TIMEOUT_MS = 60_000;
const DEFAULT_VOLCENGINE_TTS_URL =
	"https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const DEFAULT_VOLCENGINE_UID = "shotlyx";
const DEFAULT_VOLCENGINE_SAMPLE_RATE = 24_000;

export const VOICEOVER_PROVIDER_CONFIGS: VoiceoverProviderConfig[] = [
	{
		id: "edge-tts",
		displayName: "Microsoft Edge TTS (Node)",
		kind: "api",
		implemented: true,
	},
	{
		id: "openai",
		displayName: "OpenAI-compatible TTS",
		kind: "api",
		implemented: true,
	},
	{
		id: "volcengine",
		displayName: "Volcengine/Doubao Speech",
		kind: "api",
		implemented: true,
	},
	{
		id: "google",
		displayName: "Google/Gemini TTS",
		kind: "api",
		implemented: false,
	},
	{
		id: "minimax",
		displayName: "MiniMax Speech",
		kind: "api",
		implemented: false,
	},
];

export interface EdgeTtsConfig {
	voice?: string;
	lang?: string;
	outputFormat?: string;
	saveSubtitles?: boolean;
	proxy?: string;
	rate?: string;
	pitch?: string;
	volume?: string;
	timeout?: number;
}

export interface EdgeTtsClient {
	ttsPromise(text: string, audioPath: string): Promise<unknown>;
}

export type EdgeTtsFactory = (config: EdgeTtsConfig) => EdgeTtsClient;

export interface EdgeTtsProviderDeps {
	ttsFactory?: EdgeTtsFactory;
	readFile?: typeof readFile;
	mkdtemp?: (prefix: string) => Promise<string>;
	rm?: typeof rm;
	tmpdir?: typeof tmpdir;
	env?: Record<string, string | undefined>;
}

export interface OpenAITtsProviderDeps {
	fetchFn?: typeof fetch;
	env?: Record<string, string | undefined>;
}

export interface VolcengineTtsProviderDeps {
	fetchFn?: typeof fetch;
	env?: Record<string, string | undefined>;
}

function mimeTypeForFormat(format: VoiceoverAudioFormat): string {
	if (format === "wav") return "audio/wav";
	if (format === "ogg") return "audio/ogg";
	return "audio/mpeg";
}

function normalizeFormat(value: VoiceoverAudioFormat | undefined) {
	return value ?? "mp3";
}

function edgeOutputFormatForFormat(format: VoiceoverAudioFormat): string {
	if (format === "wav") return "riff-24khz-16bit-mono-pcm";
	if (format === "ogg") return "ogg-24khz-16bit-mono-opus";
	return "audio-24khz-48kbitrate-mono-mp3";
}

function speedToEdgeRate(speed: number | undefined): string | undefined {
	if (speed === undefined || speed === 1) return undefined;
	const percent = Math.round((speed - 1) * 100);
	return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function speedToVolcengineSpeechRate(
	speed: number | undefined,
): number | undefined {
	if (speed === undefined || speed === 1) return undefined;
	return Math.round((speed - 1) * 100);
}

function optionalNumberFromEnv(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function isTimeoutErrorMessage(message: string): boolean {
	return /timed?\s*out|timeout/i.test(message);
}

function normalizeBaseUrl(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function requireEnv({
	env,
	name,
}: {
	env: Record<string, string | undefined>;
	name: string;
}): string {
	const value = env[name];
	if (!value) {
		throw new Error(`configuration_error: missing ${name}`);
	}
	return value;
}

function optionalEnv({
	env,
	names,
}: {
	env: Record<string, string | undefined>;
	names: string[];
}): string | undefined {
	for (const name of names) {
		const value = env[name];
		if (value) return value;
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resourceIdForVolcengineVoice({
	input,
	env,
	voice,
}: {
	input: SynthesizeVoiceoverInput;
	env: Record<string, string | undefined>;
	voice: string;
}): string {
	if (input.resourceId) return input.resourceId;
	if (voice.startsWith("S_") || voice.startsWith("icl_")) {
		return (
			env.VOLCENGINE_TTS_CLONE_RESOURCE_ID ??
			DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID
		);
	}
	if (env.VOLCENGINE_TTS_RESOURCE_ID) return env.VOLCENGINE_TTS_RESOURCE_ID;
	return DEFAULT_VOLCENGINE_TTS_RESOURCE_ID;
}

function extractJsonObjects(text: string): Array<Record<string, unknown>> {
	const objects: Array<Record<string, unknown>> = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];

		if (start === -1) {
			if (char === "{") {
				start = index;
				depth = 1;
			}
			continue;
		}

		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (char === "{") {
			depth += 1;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) {
				const raw = text.slice(start, index + 1);
				try {
					const parsed: unknown = JSON.parse(raw);
					if (isRecord(parsed)) {
						objects.push(parsed);
					}
				} catch {
					// Ignore malformed transport fragments and let the caller decide.
				}
				start = -1;
			}
		}
	}

	return objects;
}

function decodeVolcengineAudioFrames({
	body,
	response,
}: {
	body: string;
	response: Response;
}): Uint8Array {
	const objects = extractJsonObjects(body);
	const chunks: Uint8Array[] = [];
	let finalCode: number | undefined;
	let finalMessage: string | undefined;

	for (const object of objects) {
		if (typeof object.code === "number") finalCode = object.code;
		if (typeof object.message === "string") finalMessage = object.message;
		const data = object.data;
		if (typeof data === "string" && data.length > 0) {
			chunks.push(Uint8Array.from(Buffer.from(data, "base64")));
		}
	}

	if (finalCode !== undefined && finalCode !== 0 && finalCode !== 20000000) {
		throw new Error(
			`provider_error: Volcengine TTS failed with ${finalCode}${
				finalMessage ? ` (${finalMessage})` : ""
			}`,
		);
	}

	if (chunks.length === 0) {
		throw new Error(
			`provider_error: Volcengine TTS returned no audio chunks (${response.status})`,
		);
	}

	const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const audio = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		audio.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return audio;
}

function providerUnavailable(provider: VoiceoverProviderId): Error {
	return new Error(
		`provider_unsupported: voiceover provider "${provider}" is not implemented yet`,
	);
}

function isVoiceoverProviderId(value: string): value is VoiceoverProviderId {
	return VOICEOVER_PROVIDER_CONFIGS.some((config) => config.id === value);
}

export class EdgeTtsProvider implements VoiceoverProvider {
	readonly id = "edge-tts" as const;

	constructor(private deps: EdgeTtsProviderDeps = {}) {}

	async synthesize(input: SynthesizeVoiceoverInput): Promise<VoiceoverAudio> {
		const env = this.deps.env ?? process.env;
		const format = normalizeFormat(input.format);
		const dir = await (this.deps.mkdtemp ?? mkdtemp)(
			path.join((this.deps.tmpdir ?? tmpdir)(), "shotlyx-voiceover-"),
		);
		const outputPath =
			input.outputPath ?? path.join(dir, `voiceover.${format}`);
		const voice = input.voice ?? env.EDGE_TTS_VOICE ?? DEFAULT_EDGE_TTS_VOICE;
		const lang = input.locale ?? env.EDGE_TTS_LANG ?? DEFAULT_EDGE_TTS_LANG;
		const outputFormat =
			env.EDGE_TTS_OUTPUT_FORMAT ?? edgeOutputFormatForFormat(format);
		const rate =
			input.rate ??
			speedToEdgeRate(input.speed) ??
			env.EDGE_TTS_RATE ??
			"default";
		const pitch = input.pitch ?? env.EDGE_TTS_PITCH ?? "default";
		const volume = env.EDGE_TTS_VOLUME ?? "default";
		const timeout =
			optionalNumberFromEnv(env.EDGE_TTS_TIMEOUT_MS) ??
			DEFAULT_EDGE_TTS_TIMEOUT_MS;
		const ttsFactory =
			this.deps.ttsFactory ?? ((config) => new EdgeTTS(config));
		const tts = ttsFactory({
			voice,
			lang,
			outputFormat,
			rate,
			pitch,
			volume,
			timeout,
			proxy: env.EDGE_TTS_PROXY,
		});

		try {
			await tts.ttsPromise(input.text, outputPath);
			const audio = await (this.deps.readFile ?? readFile)(outputPath);
			return {
				audio: new Uint8Array(audio),
				format,
				mimeType: mimeTypeForFormat(format),
				provider: this.id,
				voice,
				filePath: outputPath,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (isTimeoutErrorMessage(message)) {
				throw new Error(
					`provider_error: node-edge-tts generation timed out after ${timeout}ms; try increasing EDGE_TTS_TIMEOUT_MS or setting EDGE_TTS_PROXY`,
				);
			}
			throw new Error(
				`provider_error: node-edge-tts generation failed: ${message}`,
			);
		} finally {
			if (!input.outputPath) {
				await (this.deps.rm ?? rm)(dir, { recursive: true, force: true });
			}
		}
	}
}

export class OpenAICompatibleTtsProvider implements VoiceoverProvider {
	readonly id = "openai" as const;

	constructor(private deps: OpenAITtsProviderDeps = {}) {}

	async synthesize(input: SynthesizeVoiceoverInput): Promise<VoiceoverAudio> {
		const env = this.deps.env ?? process.env;
		const baseUrl = normalizeBaseUrl(
			env.TTS_GENERATION_BASE_URL ?? "https://api.openai.com/v1",
		);
		const apiKey = requireEnv({ env, name: "TTS_GENERATION_API_KEY" });
		const model = requireEnv({ env, name: "TTS_GENERATION_MODEL" });
		const voice = input.voice ?? env.TTS_GENERATION_VOICE ?? "alloy";
		const format = normalizeFormat(input.format);
		const response = await (this.deps.fetchFn ?? fetch)(
			`${baseUrl}/audio/speech`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					input: input.text,
					voice,
					response_format: format,
					speed: input.speed,
				}),
			},
		);

		if (!response.ok) {
			throw new Error(
				`provider_error: TTS generation failed with ${response.status}`,
			);
		}

		return {
			audio: new Uint8Array(await response.arrayBuffer()),
			format,
			mimeType:
				response.headers.get("content-type") ?? mimeTypeForFormat(format),
			provider: this.id,
			voice,
		};
	}
}

export class VolcengineTtsProvider implements VoiceoverProvider {
	readonly id = "volcengine" as const;

	constructor(private deps: VolcengineTtsProviderDeps = {}) {}

	async synthesize(input: SynthesizeVoiceoverInput): Promise<VoiceoverAudio> {
		const env = this.deps.env ?? process.env;
		const apiKey = optionalEnv({
			env,
			names: [
				"VOLCENGINE_TTS_API_KEY",
				"VOLCENGINE_API_KEY",
				"VOLCENGINE_ASR_API_KEY",
			],
		});
		const appId = env.VOLCENGINE_TTS_APP_ID;
		const accessKey = env.VOLCENGINE_TTS_ACCESS_KEY;
		if (!apiKey && (!appId || !accessKey)) {
			throw new Error(
				"configuration_error: missing VOLCENGINE_TTS_API_KEY, VOLCENGINE_API_KEY, VOLCENGINE_ASR_API_KEY, or VOLCENGINE_TTS_APP_ID/VOLCENGINE_TTS_ACCESS_KEY",
			);
		}

		const format = normalizeFormat(input.format);
		const voice =
			input.voice ??
			env.VOLCENGINE_TTS_DEFAULT_SPEAKER ??
			DEFAULT_VOLCENGINE_TTS_SPEAKER;
		const resourceId = resourceIdForVolcengineVoice({ input, env, voice });
		const sampleRate =
			optionalNumberFromEnv(env.VOLCENGINE_TTS_SAMPLE_RATE) ??
			DEFAULT_VOLCENGINE_SAMPLE_RATE;
		const speechRate = speedToVolcengineSpeechRate(input.speed);
		const endpoint = env.VOLCENGINE_TTS_URL ?? DEFAULT_VOLCENGINE_TTS_URL;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Api-Resource-Id": resourceId,
			"X-Api-Request-Id": randomUUID(),
		};
		if (apiKey) {
			headers["X-Api-Key"] = apiKey;
		} else {
			headers["X-Api-App-Id"] = appId ?? "";
			headers["X-Api-Access-Key"] = accessKey ?? "";
		}

		const audioParams: Record<string, string | number> = {
			format,
			sample_rate: sampleRate,
		};
		if (speechRate !== undefined) {
			audioParams.speech_rate = speechRate;
		}
		if (input.emotion) {
			audioParams.emotion = input.emotion;
		}

		const response = await (this.deps.fetchFn ?? fetch)(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify({
				user: {
					uid: env.VOLCENGINE_TTS_UID ?? DEFAULT_VOLCENGINE_UID,
				},
				req_params: {
					text: input.text,
					speaker: voice,
					audio_params: audioParams,
				},
			}),
		});

		const body = await response.text();
		if (!response.ok) {
			throw new Error(
				`provider_error: Volcengine TTS failed with ${response.status}: ${body.slice(0, 300)}`,
			);
		}

		return {
			audio: decodeVolcengineAudioFrames({ body, response }),
			format,
			mimeType: mimeTypeForFormat(format),
			provider: this.id,
			voice,
			resourceId,
		};
	}
}

export class VoiceoverProviderRegistry {
	constructor(
		private providers: Partial<Record<VoiceoverProviderId, VoiceoverProvider>>,
	) {}

	get(provider: string | undefined): VoiceoverProvider {
		const id =
			provider ?? process.env.VOICEOVER_PROVIDER ?? DEFAULT_VOICEOVER_PROVIDER;
		if (!isVoiceoverProviderId(id)) {
			throw new Error(
				`provider_unsupported: unknown voiceover provider "${id}"`,
			);
		}
		if (id === "google" || id === "minimax") {
			throw providerUnavailable(id);
		}
		const found = this.providers[id];
		if (!found) {
			throw new Error(
				`provider_unsupported: unknown voiceover provider "${id}"`,
			);
		}
		return found;
	}
}

export function createVoiceoverProviderRegistry({
	edgeTtsDeps,
	openAIDeps,
	volcengineDeps,
}: {
	edgeTtsDeps?: EdgeTtsProviderDeps;
	openAIDeps?: OpenAITtsProviderDeps;
	volcengineDeps?: VolcengineTtsProviderDeps;
} = {}): VoiceoverProviderRegistry {
	return new VoiceoverProviderRegistry({
		"edge-tts": new EdgeTtsProvider(edgeTtsDeps),
		openai: new OpenAICompatibleTtsProvider(openAIDeps),
		volcengine: new VolcengineTtsProvider(volcengineDeps),
	});
}

export async function synthesizeVoiceover({
	input,
	registry = createVoiceoverProviderRegistry(),
}: {
	input: SynthesizeVoiceoverInput & {
		provider?: string;
		speed?: number;
	};
	registry?: VoiceoverProviderRegistry;
}): Promise<VoiceoverAudio> {
	const provider = registry.get(input.provider);
	return provider.synthesize({
		...input,
		rate:
			provider.id === "edge-tts"
				? (input.rate ?? speedToEdgeRate(input.speed))
				: input.rate,
	});
}
