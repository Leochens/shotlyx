import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import type { VoiceProfile } from "@/agent/tools/voiceover/types";
import {
	DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID,
	VOLCENGINE_PRESET_VOICES,
	getDefaultVolcengineVoice,
} from "@/agent/tools/voiceover/voices";
import { getRuntimeEnv } from "@/desktop/config/server";

export const runtime = "nodejs";

const VOLCENGINE_OPENAPI_HOST = "open.volcengineapi.com";
const VOLCENGINE_OPENAPI_REGION = "cn-north-1";
const VOLCENGINE_OPENAPI_SERVICE = "speech_saas_prod";
const VOLCENGINE_OPENAPI_VERSION = "2023-11-07";

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function hmacSha256({
	key,
	value,
}: {
	key: Buffer | string;
	value: string;
}): Buffer {
	return createHmac("sha256", key).update(value).digest();
}

function encodeQuery(params: Record<string, string>): string {
	return Object.entries(params)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join("&");
}

function volcengineDate(date = new Date()): string {
	return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signVolcengineRequest({
	accessKeyId,
	secretAccessKey,
	body,
	query,
}: {
	accessKeyId: string;
	secretAccessKey: string;
	body: string;
	query: Record<string, string>;
}): HeadersInit {
	const xDate = volcengineDate();
	const shortDate = xDate.slice(0, 8);
	const contentType = "application/json; charset=utf-8";
	const bodyHash = sha256Hex(body);
	const signedHeaders = "content-type;host;x-content-sha256;x-date";
	const canonicalRequest = [
		"POST",
		"/",
		encodeQuery(query),
		[
			`content-type:${contentType}`,
			`host:${VOLCENGINE_OPENAPI_HOST}`,
			`x-content-sha256:${bodyHash}`,
			`x-date:${xDate}`,
		].join("\n"),
		"",
		signedHeaders,
		bodyHash,
	].join("\n");
	const credentialScope = [
		shortDate,
		VOLCENGINE_OPENAPI_REGION,
		VOLCENGINE_OPENAPI_SERVICE,
		"request",
	].join("/");
	const stringToSign = [
		"HMAC-SHA256",
		xDate,
		credentialScope,
		sha256Hex(canonicalRequest),
	].join("\n");
	const kDate = hmacSha256({ key: secretAccessKey, value: shortDate });
	const kRegion = hmacSha256({
		key: kDate,
		value: VOLCENGINE_OPENAPI_REGION,
	});
	const kService = hmacSha256({
		key: kRegion,
		value: VOLCENGINE_OPENAPI_SERVICE,
	});
	const kSigning = hmacSha256({ key: kService, value: "request" });
	const signature = createHmac("sha256", kSigning)
		.update(stringToSign)
		.digest("hex");

	return {
		Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
		"Content-Type": contentType,
		Host: VOLCENGINE_OPENAPI_HOST,
		"X-Content-Sha256": bodyHash,
		"X-Date": xDate,
	};
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
	const next = value[key];
	return typeof next === "string" && next.trim() ? next : undefined;
}

function parseConfiguredClonedVoices(): VoiceProfile[] {
	const raw = getRuntimeEnv().VOLCENGINE_TTS_CLONED_VOICES;
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item): VoiceProfile[] => {
			if (!isRecord(item)) return [];
			const speaker =
				stringField({ value: item, key: "speaker" }) ??
				stringField({ value: item, key: "id" });
			if (!speaker) return [];
			return [
				{
					id:
						stringField({ value: item, key: "id" }) ??
						`volcengine:cloned:${speaker}`,
					name: stringField({ value: item, key: "name" }) ?? speaker,
					provider: "volcengine",
					kind: "cloned",
					speaker,
					resourceId:
						stringField({ value: item, key: "resourceId" }) ??
						DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID,
					locale: stringField({ value: item, key: "locale" }) ?? "zh-CN",
					description: stringField({ value: item, key: "description" }),
					status: "available",
				},
			];
		});
	} catch {
		return [];
	}
}

function normalizeVoiceState(
	value: string | undefined,
): VoiceProfile["status"] {
	if (value === "Success" || value === "Active") return "available";
	if (value === "Training") return "training";
	if (value === "Expired" || value === "Reclaimed") return "expired";
	return "unknown";
}

async function postVolcengineOpenApi({
	action,
	body,
}: {
	action: string;
	body: Record<string, unknown>;
}): Promise<unknown> {
	const env = getRuntimeEnv();
	const accessKeyId = env.VOLCENGINE_ACCESS_KEY_ID;
	const secretAccessKey = env.VOLCENGINE_SECRET_ACCESS_KEY;
	if (!accessKeyId || !secretAccessKey) return null;

	const query = {
		Action: action,
		Version: VOLCENGINE_OPENAPI_VERSION,
	};
	const requestBody = JSON.stringify(body);
	const response = await fetch(
		`https://${VOLCENGINE_OPENAPI_HOST}/?${encodeQuery(query)}`,
		{
			method: "POST",
			headers: signVolcengineRequest({
				accessKeyId,
				secretAccessKey,
				body: requestBody,
				query,
			}),
			body: requestBody,
		},
	);
	if (!response.ok) {
		throw new Error(`Volcengine ${action} failed with ${response.status}`);
	}
	return response.json();
}

function firstStringField({
	value,
	keys,
}: {
	value: Record<string, unknown>;
	keys: string[];
}): string | undefined {
	for (const key of keys) {
		const found = stringField({ value, key });
		if (found) return found;
	}
	return undefined;
}

function normalizePresetVoice(
	item: Record<string, unknown>,
): VoiceProfile | null {
	const speaker = firstStringField({
		value: item,
		keys: [
			"SpeakerID",
			"SpeakerId",
			"Speaker",
			"VoiceType",
			"voice_type",
			"Voice",
			"ID",
			"id",
		],
	});
	if (!speaker) return null;

	const tags: string[] = [];
	for (const key of ["Scene", "Language", "Style", "Category"]) {
		const field = stringField({ value: item, key });
		if (field) tags.push(field);
	}

	return {
		id: `volcengine:${speaker}`,
		name:
			firstStringField({
				value: item,
				keys: ["Name", "DisplayName", "SpeakerName", "TimbreName", "name"],
			}) ?? speaker,
		provider: "volcengine",
		kind: "preset",
		speaker,
		resourceId:
			firstStringField({
				value: item,
				keys: ["ResourceID", "ResourceId", "resource_id"],
			}) ?? getRuntimeEnv().VOLCENGINE_TTS_RESOURCE_ID,
		locale:
			firstStringField({ value: item, keys: ["Locale", "Language"] }) ??
			"zh-CN",
		tags,
		description: firstStringField({
			value: item,
			keys: ["Description", "Desc", "SceneDescription"],
		}),
		previewUrl: firstStringField({
			value: item,
			keys: ["DemoAudio", "PreviewUrl", "PreviewURL"],
		}),
		status: "available",
	};
}

function collectRecordArrays(value: unknown): Array<Record<string, unknown>[]> {
	const arrays: Array<Record<string, unknown>[]> = [];
	const visit = (next: unknown) => {
		if (Array.isArray(next) && next.every(isRecord)) {
			arrays.push(next);
			return;
		}
		if (!isRecord(next)) return;
		for (const child of Object.values(next)) {
			visit(child);
		}
	};
	visit(value);
	return arrays;
}

async function fetchPresetVoicesFromVolcengine(): Promise<VoiceProfile[]> {
	const appId = getRuntimeEnv().VOLCENGINE_TTS_APP_ID;
	const body: Record<string, unknown> = appId ? { AppID: appId } : {};
	const data = await postVolcengineOpenApi({ action: "ListSpeakers", body });
	if (!data) return [];

	const candidates = collectRecordArrays(data)
		.flat()
		.map(normalizePresetVoice)
		.filter((voice): voice is VoiceProfile => Boolean(voice));
	const unique = new Map<string, VoiceProfile>();
	for (const voice of candidates) {
		unique.set(voice.speaker, voice);
	}
	return Array.from(unique.values());
}

async function fetchClonedVoicesFromVolcengine(): Promise<VoiceProfile[]> {
	const appId = getRuntimeEnv().VOLCENGINE_TTS_APP_ID;
	if (!appId) return [];

	const data = await postVolcengineOpenApi({
		action: "BatchListMegaTTSTrainStatus",
		body: {
			AppID: appId,
			State: "",
			PageSize: 100,
		},
	});
	if (!data) return [];
	const result = isRecord(data) ? data.Result : undefined;
	const statuses = isRecord(result) ? result.Statuses : undefined;
	if (!Array.isArray(statuses)) return [];

	return statuses.flatMap((item): VoiceProfile[] => {
		if (!isRecord(item)) return [];
		const speakerId = stringField({ value: item, key: "SpeakerID" });
		if (!speakerId) return [];
		const modelDetails = Array.isArray(item.ModelTypeDetails)
			? item.ModelTypeDetails
			: [];
		const firstModel = modelDetails.find(isRecord);
		const speaker =
			(firstModel
				? stringField({ value: firstModel, key: "IclSpeakerId" })
				: undefined) ?? speakerId;
		const state = stringField({ value: item, key: "State" });
		return [
			{
				id: `volcengine:cloned:${speaker}`,
				name: stringField({ value: item, key: "Alias" }) ?? speakerId,
				provider: "volcengine",
				kind: "cloned",
				speaker,
				resourceId:
					(firstModel
						? stringField({ value: firstModel, key: "ResourceID" })
						: undefined) ?? DEFAULT_VOLCENGINE_CLONE_RESOURCE_ID,
				locale: "zh-CN",
				description: "火山引擎账号下的声音复刻音色。",
				previewUrl: stringField({ value: item, key: "DemoAudio" }),
				status: normalizeVoiceState(state),
			},
		];
	});
}

export async function GET() {
	let warning: string | undefined;
	let presetVoices: VoiceProfile[] = VOLCENGINE_PRESET_VOICES;
	let clonedVoices: VoiceProfile[] = parseConfiguredClonedVoices();

	try {
		const remotePresetVoices = await fetchPresetVoicesFromVolcengine();
		if (remotePresetVoices.length > 0) {
			presetVoices = remotePresetVoices;
		}
		const remoteClonedVoices = await fetchClonedVoicesFromVolcengine();
		if (remoteClonedVoices.length > 0) {
			clonedVoices = remoteClonedVoices;
		}
	} catch (error) {
		warning =
			error instanceof Error ? error.message : "Volcengine voice list failed";
	}

	const voices = [...presetVoices, ...clonedVoices];
	const env = getRuntimeEnv();
	return NextResponse.json({
		providerConfigured: Boolean(
			env.VOLCENGINE_TTS_API_KEY ||
			env.VOLCENGINE_API_KEY ||
			(env.VOLCENGINE_TTS_APP_ID && env.VOLCENGINE_TTS_ACCESS_KEY),
		),
		defaultVoiceId:
			voices.find((voice) => voice.id === getDefaultVolcengineVoice().id)?.id ??
			voices[0]?.id,
		voices,
		warning,
	});
}
