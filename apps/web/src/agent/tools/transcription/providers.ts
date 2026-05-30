import type {
	AsrProvider,
	AsrProviderConfig,
	AsrProviderId,
	TranscribeAudioInput,
	TranscribeAudioResult,
	TranscriptionCue,
} from "./types";
import type { SubtitleToken } from "@/subtitles/types";
import { randomUUID } from "node:crypto";
import { getRuntimeEnv } from "@/desktop/config/server";

const DEFAULT_ASR_PROVIDER: AsrProviderId = "volcengine";
const DEFAULT_ASR_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_ONLY_DURATION_SECONDS = 3;
const DEFAULT_VOLCENGINE_FLASH_URL =
	"https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const DEFAULT_VOLCENGINE_FLASH_RESOURCE_ID = "volc.bigasr.auc_turbo";

export const ASR_PROVIDER_CONFIGS: AsrProviderConfig[] = [
	{
		id: "local",
		displayName: "Local Whisper in browser",
		implemented: false,
	},
	{
		id: "openai-compatible",
		displayName: "OpenAI-compatible ASR",
		implemented: true,
	},
	{
		id: "tencent",
		displayName: "Tencent Cloud ASR",
		implemented: false,
	},
	{
		id: "volcengine",
		displayName: "Volcengine/Doubao ASR",
		implemented: true,
	},
	{
		id: "aliyun",
		displayName: "Alibaba Cloud NLS",
		implemented: false,
	},
	{
		id: "baidu",
		displayName: "Baidu Cloud Speech",
		implemented: false,
	},
	{
		id: "iflytek",
		displayName: "iFlytek ASR",
		implemented: false,
	},
];

export interface OpenAICompatibleAsrProviderDeps {
	fetchFn?: typeof fetch;
	env?: Record<string, string | undefined>;
}

export interface VolcengineAsrProviderDeps {
	fetchFn?: typeof fetch;
	env?: Record<string, string | undefined>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

function normalizeTokens({
	value,
	cueIndex,
}: {
	value: unknown;
	cueIndex: number;
}): SubtitleToken[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.flatMap((item, tokenIndex) => {
		if (!isRecord(item)) {
			throw new Error(
				`provider_error: invalid transcription token ${tokenIndex} in cue ${cueIndex}`,
			);
		}
		const text = optionalString(item.text);
		const start =
			optionalNumber(item.startTimeSeconds) ??
			optionalNumber(item.startTime) ??
			optionalNumber(item.start);
		const duration =
			optionalNumber(item.durationSeconds) ?? optionalNumber(item.duration);
		const end =
			optionalNumber(item.endTimeSeconds) ??
			optionalNumber(item.endTime) ??
			optionalNumber(item.end);
		if (!text || start === undefined) return [];
		const resolvedDuration =
			duration ?? (end !== undefined ? end - start : NaN);
		if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) return [];
		return [
			{
				text,
				startTime: start,
				duration: resolvedDuration,
				...(typeof item.confidence === "number"
					? { confidence: item.confidence }
					: {}),
			},
		];
	});
}

function normalizeCue({
	value,
	index,
}: {
	value: unknown;
	index: number;
}): TranscriptionCue {
	if (!isRecord(value)) {
		throw new Error(
			`provider_error: invalid transcription cue at index ${index}`,
		);
	}
	const text = optionalString(value.text);
	const start =
		optionalNumber(value.startTimeSeconds) ??
		optionalNumber(value.startTime) ??
		optionalNumber(value.start) ??
		0;
	const duration =
		optionalNumber(value.durationSeconds) ??
		optionalNumber(value.duration) ??
		(optionalNumber(value.endTimeSeconds) ??
			optionalNumber(value.end) ??
			start) - start;
	if (!text) {
		throw new Error(`provider_error: transcription cue ${index} has no text`);
	}
	if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
		throw new Error(
			`provider_error: transcription cue ${index} has invalid timing`,
		);
	}
	return {
		text,
		startTimeSeconds: start,
		durationSeconds: duration,
		tokens: normalizeTokens({
			value: value.tokens ?? value.words,
			cueIndex: index,
		}),
	};
}

function normalizeOpenAICompatibleResponse({
	body,
	provider,
	model,
}: {
	body: unknown;
	provider: string;
	model?: string;
}): TranscribeAudioResult {
	if (!isRecord(body)) {
		throw new Error("provider_error: ASR response must be a JSON object");
	}

	const text = optionalString(body.text) ?? "";
	const rawCues = Array.isArray(body.cues)
		? body.cues
		: Array.isArray(body.segments)
			? body.segments
			: [];
	const cues =
		rawCues.length > 0
			? rawCues.map((cue, index) => normalizeCue({ value: cue, index }))
			: text
				? [
						{
							text,
							startTimeSeconds: 0,
							durationSeconds:
								optionalNumber(body.duration) ??
								DEFAULT_TEXT_ONLY_DURATION_SECONDS,
						},
					]
				: [];

	if (cues.length === 0) {
		throw new Error(
			"provider_error: ASR response did not include timed captions",
		);
	}

	return {
		text: text || cues.map((cue) => cue.text).join(" "),
		cues,
		language: optionalString(body.language),
		provider,
		model,
		metadata: isRecord(body.metadata) ? body.metadata : undefined,
	};
}

function volcengineHeaders({
	env,
	requestId,
}: {
	env: Record<string, string | undefined>;
	requestId: string;
}): Headers {
	const headers = new Headers({
		"Content-Type": "application/json",
		"X-Api-Resource-Id":
			env.VOLCENGINE_ASR_RESOURCE_ID ?? DEFAULT_VOLCENGINE_FLASH_RESOURCE_ID,
		"X-Api-Request-Id": requestId,
		"X-Api-Sequence": "-1",
	});
	const apiKey = env.VOLCENGINE_ASR_API_KEY ?? env.VOLCENGINE_API_KEY;
	if (!apiKey) {
		throw new Error("configuration_error: missing VOLCENGINE_ASR_API_KEY");
	}
	headers.set("X-Api-Key", apiKey);
	return headers;
}

function normalizeVolcengineWord({
	value,
}: {
	value: unknown;
}): SubtitleToken | null {
	if (!isRecord(value)) return null;
	const text = optionalString(value.text) ?? optionalString(value.word);
	const start =
		optionalNumber(value.start_time) ?? optionalNumber(value.startTime);
	const end = optionalNumber(value.end_time) ?? optionalNumber(value.endTime);
	if (!text || start === undefined || end === undefined || end < start) {
		return null;
	}
	return {
		text,
		startTime: start / 1000,
		duration: Math.max((end - start) / 1000, 0.001),
		...(typeof value.confidence === "number"
			? { confidence: value.confidence }
			: {}),
	};
}

function normalizeVolcengineUtterance({
	value,
}: {
	value: unknown;
	index: number;
}): TranscriptionCue | null {
	if (!isRecord(value)) {
		return null;
	}
	const text = optionalString(value.text);
	const start =
		optionalNumber(value.start_time) ?? optionalNumber(value.startTime);
	const end = optionalNumber(value.end_time) ?? optionalNumber(value.endTime);
	if (!text || start === undefined || end === undefined || end <= start) {
		return null;
	}
	const rawWords = Array.isArray(value.words) ? value.words : [];
	const tokens = rawWords.flatMap((word) => {
		const token = normalizeVolcengineWord({ value: word });
		return token ? [token] : [];
	});
	return {
		text,
		startTimeSeconds: start / 1000,
		durationSeconds: (end - start) / 1000,
		...(tokens.length > 0 ? { tokens } : {}),
	};
}

function normalizeVolcengineResponse({
	body,
	model,
	logId,
}: {
	body: unknown;
	model?: string;
	logId?: string;
}): TranscribeAudioResult {
	if (!isRecord(body) || !isRecord(body.result)) {
		throw new Error("provider_error: Volcengine ASR response has no result");
	}
	const result = body.result;
	const text = optionalString(result.text) ?? "";
	const rawUtterances = Array.isArray(result.utterances)
		? result.utterances
		: [];
	const utteranceCues = rawUtterances.flatMap((utterance, index) => {
		const cue = normalizeVolcengineUtterance({ value: utterance, index });
		return cue ? [cue] : [];
	});
	const cues =
		utteranceCues.length > 0
			? utteranceCues
			: text
				? [
						{
							text,
							startTimeSeconds: 0,
							durationSeconds:
								isRecord(body.audio_info) &&
								typeof body.audio_info.duration === "number"
									? body.audio_info.duration / 1000
									: DEFAULT_TEXT_ONLY_DURATION_SECONDS,
						},
					]
				: [];
	if (cues.length === 0) {
		throw new Error("provider_error: Volcengine ASR returned no captions");
	}
	return {
		text: text || cues.map((cue) => cue.text).join(""),
		cues,
		provider: "volcengine",
		model,
		metadata: {
			mode: "flash",
			...(logId ? { logId } : {}),
		},
	};
}

function isAsrProviderId(value: string): value is AsrProviderId {
	return ASR_PROVIDER_CONFIGS.some((config) => config.id === value);
}

function providerUnavailable(provider: AsrProviderId): Error {
	return new Error(
		`provider_unsupported: ASR provider "${provider}" is reserved but not implemented yet; configure ASR_PROVIDER=openai-compatible for the generic endpoint, or add a server provider adapter for this vendor`,
	);
}

export class OpenAICompatibleAsrProvider implements AsrProvider {
	readonly id = "openai-compatible" as const;

	constructor(private deps: OpenAICompatibleAsrProviderDeps = {}) {}

	async transcribe(
		input: TranscribeAudioInput,
	): Promise<TranscribeAudioResult> {
		const env = this.deps.env ?? getRuntimeEnv();
		const baseUrl = normalizeBaseUrl(env.ASR_BASE_URL ?? DEFAULT_ASR_BASE_URL);
		const apiKey = requireEnv({ env, name: "ASR_API_KEY" });
		const model = input.model ?? requireEnv({ env, name: "ASR_MODEL" });
		const form = new FormData();
		form.set("file", input.audio);
		form.set("model", model);
		form.set("response_format", "verbose_json");
		if (input.language && input.language !== "auto") {
			form.set("language", input.language);
		}

		const response = await (this.deps.fetchFn ?? fetch)(
			`${baseUrl}/audio/transcriptions`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: form,
			},
		);

		if (!response.ok) {
			throw new Error(
				`provider_error: ASR transcription failed with ${response.status}`,
			);
		}

		return normalizeOpenAICompatibleResponse({
			body: await response.json(),
			provider: this.id,
			model,
		});
	}
}

export class VolcengineAsrProvider implements AsrProvider {
	readonly id = "volcengine" as const;

	constructor(private deps: VolcengineAsrProviderDeps = {}) {}

	async transcribe(
		input: TranscribeAudioInput,
	): Promise<TranscribeAudioResult> {
		const env = this.deps.env ?? getRuntimeEnv();
		const requestId = randomUUID();
		const audioData = Buffer.from(await input.audio.arrayBuffer()).toString(
			"base64",
		);
		const response = await (this.deps.fetchFn ?? fetch)(
			env.VOLCENGINE_ASR_FLASH_URL ?? DEFAULT_VOLCENGINE_FLASH_URL,
			{
				method: "POST",
				headers: volcengineHeaders({ env, requestId }),
				body: JSON.stringify({
					user: {
						uid: env.VOLCENGINE_ASR_UID ?? "shotlyx",
					},
					audio: {
						data: audioData,
					},
					request: {
						model_name: input.model ?? "bigmodel",
						enable_itn: true,
						enable_punc: true,
						enable_ddc: true,
						show_utterances: true,
					},
				}),
			},
		);
		const statusCode = response.headers.get("X-Api-Status-Code");
		const statusMessage = response.headers.get("X-Api-Message") ?? "";
		if (!response.ok || (statusCode && statusCode !== "20000000")) {
			throw new Error(
				`provider_error: Volcengine ASR failed${
					statusCode ? ` (${statusCode} ${statusMessage})` : ""
				}`,
			);
		}
		return normalizeVolcengineResponse({
			body: await response.json(),
			model: input.model ?? "bigmodel",
			logId: response.headers.get("X-Tt-Logid") ?? undefined,
		});
	}
}

export class AsrProviderRegistry {
	private providers: Partial<Record<AsrProviderId, AsrProvider>>;
	private env: Record<string, string | undefined>;

	constructor({
		providers,
		env = getRuntimeEnv(),
	}: {
		providers: Partial<Record<AsrProviderId, AsrProvider>>;
		env?: Record<string, string | undefined>;
	}) {
		this.providers = providers;
		this.env = env;
	}

	get(provider: string | undefined): AsrProvider {
		const id = provider ?? this.env.ASR_PROVIDER ?? DEFAULT_ASR_PROVIDER;
		if (!isAsrProviderId(id)) {
			throw new Error(`provider_unsupported: unknown ASR provider "${id}"`);
		}
		if (id !== "openai-compatible" && id !== "volcengine") {
			throw providerUnavailable(id);
		}
		const found = this.providers[id];
		if (!found) {
			throw new Error(`provider_unsupported: unknown ASR provider "${id}"`);
		}
		return found;
	}
}

export function createAsrProviderRegistry({
	openAICompatibleDeps,
	volcengineDeps,
	env,
}: {
	openAICompatibleDeps?: OpenAICompatibleAsrProviderDeps;
	volcengineDeps?: VolcengineAsrProviderDeps;
	env?: Record<string, string | undefined>;
} = {}): AsrProviderRegistry {
	const registryEnv =
		env ?? openAICompatibleDeps?.env ?? volcengineDeps?.env ?? getRuntimeEnv();
	return new AsrProviderRegistry({
		providers: {
			"openai-compatible": new OpenAICompatibleAsrProvider({
				env: registryEnv,
				...openAICompatibleDeps,
			}),
			volcengine: new VolcengineAsrProvider({
				env: registryEnv,
				...volcengineDeps,
			}),
		},
		env: registryEnv,
	});
}

export async function transcribeAudio({
	input,
	registry = createAsrProviderRegistry(),
}: {
	input: TranscribeAudioInput;
	registry?: AsrProviderRegistry;
}): Promise<TranscribeAudioResult> {
	const provider = registry.get(input.provider);
	return provider.transcribe(input);
}
