import type {
	AsrProvider,
	AsrProviderConfig,
	AsrProviderId,
	TranscribeAudioInput,
	TranscribeAudioResult,
	TranscriptionCue,
} from "./types";
import type { SubtitleToken } from "@/subtitles/types";

const DEFAULT_ASR_PROVIDER: AsrProviderId = "openai-compatible";
const DEFAULT_ASR_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_ONLY_DURATION_SECONDS = 3;

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
		implemented: false,
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
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
		const resolvedDuration = duration ?? (end !== undefined ? end - start : NaN);
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
		throw new Error(`provider_error: invalid transcription cue at index ${index}`);
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
		(optionalNumber(value.endTimeSeconds) ?? optionalNumber(value.end) ?? start) -
			start;
	if (!text) {
		throw new Error(`provider_error: transcription cue ${index} has no text`);
	}
	if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
		throw new Error(`provider_error: transcription cue ${index} has invalid timing`);
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
								optionalNumber(body.duration) ?? DEFAULT_TEXT_ONLY_DURATION_SECONDS,
						},
					]
				: [];

	if (cues.length === 0) {
		throw new Error("provider_error: ASR response did not include timed captions");
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

	async transcribe(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
		const env = this.deps.env ?? process.env;
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
			throw new Error(`provider_error: ASR transcription failed with ${response.status}`);
		}

		return normalizeOpenAICompatibleResponse({
			body: await response.json(),
			provider: this.id,
			model,
		});
	}
}

export class AsrProviderRegistry {
	private providers: Partial<Record<AsrProviderId, AsrProvider>>;
	private env: Record<string, string | undefined>;

	constructor({
		providers,
		env = process.env,
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
		if (id !== "openai-compatible") {
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
	env,
}: {
	openAICompatibleDeps?: OpenAICompatibleAsrProviderDeps;
	env?: Record<string, string | undefined>;
} = {}): AsrProviderRegistry {
	const registryEnv = env ?? openAICompatibleDeps?.env ?? process.env;
	return new AsrProviderRegistry({
		providers: {
			"openai-compatible": new OpenAICompatibleAsrProvider(
				openAICompatibleDeps,
			),
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
