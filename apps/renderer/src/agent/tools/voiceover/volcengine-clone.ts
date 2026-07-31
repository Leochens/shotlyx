import { randomUUID } from "node:crypto";
import { getRuntimeEnv } from "@/desktop/config/server";
import { DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID } from "./voices";

const DEFAULT_VOLCENGINE_VOICE_CLONE_URL =
	"https://openspeech.bytedance.com/api/v3/tts/voice_clone";
const DEFAULT_VOLCENGINE_VOICE_STATUS_URL =
	"https://openspeech.bytedance.com/api/v3/tts/get_voice";

export type VolcengineVoiceCloneStatus =
	| "not_found"
	| "training"
	| "available"
	| "failed"
	| "unknown";

export interface VolcengineVoiceCloneResult {
	provider: "volcengine";
	speakerId: string;
	resourceId: string;
	status: VolcengineVoiceCloneStatus;
	customSpeakerId?: string;
	demoAudio?: string;
	availableTrainingTimes?: number;
	language?: number;
	raw: unknown;
}

export interface SubmitVolcengineVoiceCloneInput {
	speakerId: string;
	customSpeakerId?: string;
	audioData: string;
	audioFormat: string;
	text?: string;
	demoText?: string;
	language?: number;
	enableAudioDenoise?: boolean;
}

export interface GetVolcengineVoiceCloneStatusInput {
	speakerId: string;
	customSpeakerId?: string;
}

interface VolcengineVoiceCloneDeps {
	env?: Record<string, string | undefined>;
	fetchFn?: typeof fetch;
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

function stringField({
	value,
	key,
}: {
	value: Record<string, unknown>;
	key: string;
}): string | undefined {
	const found = value[key];
	return typeof found === "string" && found.trim() ? found : undefined;
}

function numberField({
	value,
	key,
}: {
	value: Record<string, unknown>;
	key: string;
}): number | undefined {
	const found = value[key];
	return typeof found === "number" && Number.isFinite(found) ? found : undefined;
}

function authHeaders(env: Record<string, string | undefined>): Record<string, string> {
	const apiKey = optionalEnv({
		env,
		names: [
			"VOLCENGINE_TTS_API_KEY",
			"VOLCENGINE_API_KEY",
			"VOLCENGINE_ASR_API_KEY",
		],
	});
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-Api-Request-Id": randomUUID(),
	};
	if (apiKey) {
		headers["X-Api-Key"] = apiKey;
		return headers;
	}

	const appId = env.VOLCENGINE_TTS_APP_ID;
	const accessKey = env.VOLCENGINE_TTS_ACCESS_KEY;
	if (appId && accessKey) {
		headers["X-Api-App-Key"] = appId;
		headers["X-Api-Access-Key"] = accessKey;
		return headers;
	}

	throw new Error(
		"configuration_error: missing VOLCENGINE_TTS_API_KEY, VOLCENGINE_API_KEY, VOLCENGINE_ASR_API_KEY, or VOLCENGINE_TTS_APP_ID/VOLCENGINE_TTS_ACCESS_KEY",
	);
}

function normalizeStatus(value: unknown): VolcengineVoiceCloneStatus {
	if (value === 0 || value === "NotFound") return "not_found";
	if (value === 1 || value === "Training") return "training";
	if (value === 2 || value === 4 || value === "Success" || value === "Active") {
		return "available";
	}
	if (value === 3 || value === "Failed") return "failed";
	return "unknown";
}

function firstDemoAudio(value: Record<string, unknown>): string | undefined {
	const direct = stringField({ value, key: "demo_audio" });
	if (direct) return direct;
	const statuses = value.speaker_status;
	if (!Array.isArray(statuses)) return undefined;
	for (const status of statuses) {
		if (!isRecord(status)) continue;
		const found = stringField({ value: status, key: "demo_audio" });
		if (found) return found;
	}
}

function normalizeCloneResult({
	raw,
	fallbackSpeakerId,
	fallbackCustomSpeakerId,
}: {
	raw: unknown;
	fallbackSpeakerId: string;
	fallbackCustomSpeakerId?: string;
}): VolcengineVoiceCloneResult {
	const value = isRecord(raw) ? raw : {};
	const customSpeakerId =
		stringField({ value, key: "custom_speaker_id" }) ??
		fallbackCustomSpeakerId;
	const speakerId =
		customSpeakerId ??
		(stringField({ value, key: "speaker_id" }) === "custom_speaker_id"
			? undefined
			: stringField({ value, key: "speaker_id" })) ??
		fallbackSpeakerId;

	return {
		provider: "volcengine",
		speakerId,
		customSpeakerId,
		resourceId: DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID,
		status: normalizeStatus(value.status),
		demoAudio: firstDemoAudio(value),
		availableTrainingTimes: numberField({
			value,
			key: "available_training_times",
		}),
		language: numberField({ value, key: "language" }),
		raw,
	};
}

async function postVolcengineCloneApi({
	endpoint,
	body,
	deps = {},
}: {
	endpoint: string;
	body: Record<string, unknown>;
	deps?: VolcengineVoiceCloneDeps;
}): Promise<unknown> {
	const env = deps.env ?? getRuntimeEnv();
	const response = await (deps.fetchFn ?? fetch)(endpoint, {
		method: "POST",
		headers: authHeaders(env),
		body: JSON.stringify(body),
	});
	const text = await response.text();
	let data: unknown = text;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		// Keep the raw text so the caller can include a concise provider error.
	}
	if (!response.ok) {
		throw new Error(
			`provider_error: Volcengine voice clone failed with ${response.status}: ${text.slice(0, 300)}`,
		);
	}
	return data;
}

export function createVolcengineCustomSpeakerId(): string {
	return `shotlyx_${randomUUID().replaceAll("-", "")}`;
}

export async function submitVolcengineVoiceClone({
	input,
	deps = {},
}: {
	input: SubmitVolcengineVoiceCloneInput;
	deps?: VolcengineVoiceCloneDeps;
}): Promise<VolcengineVoiceCloneResult> {
	const body: Record<string, unknown> = {
		speaker_id: input.customSpeakerId ? "custom_speaker_id" : input.speakerId,
		audio: {
			data: input.audioData,
			format: input.audioFormat,
		},
	};
	if (input.customSpeakerId) {
		body.custom_speaker_id = input.customSpeakerId;
	}
	if (input.text) body.text = input.text;
	if (input.language !== undefined) body.language = input.language;
	if (input.demoText || input.enableAudioDenoise !== undefined) {
		body.extra_params = {
			...(input.demoText ? { demo_text: input.demoText } : {}),
			...(input.enableAudioDenoise !== undefined
				? { enable_audio_denoise: input.enableAudioDenoise }
				: {}),
		};
	}

	const raw = await postVolcengineCloneApi({
		endpoint:
			(deps.env ?? getRuntimeEnv()).VOLCENGINE_TTS_VOICE_CLONE_URL ??
			DEFAULT_VOLCENGINE_VOICE_CLONE_URL,
		body,
		deps,
	});
	return normalizeCloneResult({
		raw,
		fallbackSpeakerId: input.speakerId,
		fallbackCustomSpeakerId: input.customSpeakerId,
	});
}

export async function getVolcengineVoiceCloneStatus({
	input,
	deps = {},
}: {
	input: GetVolcengineVoiceCloneStatusInput;
	deps?: VolcengineVoiceCloneDeps;
}): Promise<VolcengineVoiceCloneResult> {
	const raw = await postVolcengineCloneApi({
		endpoint:
			(deps.env ?? getRuntimeEnv()).VOLCENGINE_TTS_VOICE_STATUS_URL ??
			DEFAULT_VOLCENGINE_VOICE_STATUS_URL,
		body: {
			speaker_id: input.customSpeakerId ? "custom_speaker_id" : input.speakerId,
			...(input.customSpeakerId
				? { custom_speaker_id: input.customSpeakerId }
				: {}),
		},
		deps,
	});
	return normalizeCloneResult({
		raw,
		fallbackSpeakerId: input.speakerId,
		fallbackCustomSpeakerId: input.customSpeakerId,
	});
}
