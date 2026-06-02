import {
	createVolcengineCustomSpeakerId,
	submitVolcengineVoiceClone,
} from "@/agent/tools/voiceover/volcengine-clone";
import { type ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SUPPORTED_AUDIO_FORMATS = new Set([
	"wav",
	"mp3",
	"ogg",
	"m4a",
	"aac",
	"pcm",
	"webm",
]);

function formString({
	form,
	key,
}: {
	form: FormData;
	key: string;
}): string | undefined {
	const value = form.get(key);
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolString(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	if (value === "true") return true;
	if (value === "false") return false;
	return undefined;
}

function numberString(value: string | undefined): number | undefined {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function audioFormatFromFile(file: File): string {
	const fromName = file.name.split(".").pop()?.toLowerCase();
	if (fromName && SUPPORTED_AUDIO_FORMATS.has(fromName)) return fromName;
	if (file.type.includes("wav")) return "wav";
	if (file.type.includes("mpeg") || file.type.includes("mp3")) return "mp3";
	if (file.type.includes("ogg")) return "ogg";
	if (file.type.includes("webm")) return "webm";
	return "wav";
}

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error")) return { message, status: 500 };
	if (message.startsWith("provider_error")) return { message, status: 502 };
	return {
		message: "provider_error: Volcengine voice clone failed",
		status: 502,
	};
}

export async function POST(request: ApiRequest) {
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return ApiResponse.json({ error: "Invalid form data" }, { status: 400 });
	}

	const audio = form.get("audio");
	if (!(audio instanceof File)) {
		return ApiResponse.json({ error: "Audio file is required" }, { status: 400 });
	}
	if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
		return ApiResponse.json(
			{ error: "Audio file must be between 1 byte and 10MB" },
			{ status: 400 },
		);
	}

	const explicitSpeakerId = formString({ form, key: "speakerId" });
	const customSpeakerId = formString({ form, key: "customSpeakerId" });
	const speakerId =
		explicitSpeakerId ?? customSpeakerId ?? createVolcengineCustomSpeakerId();
	const audioFormat =
		formString({ form, key: "audioFormat" }) ?? audioFormatFromFile(audio);
	if (!SUPPORTED_AUDIO_FORMATS.has(audioFormat)) {
		return ApiResponse.json(
			{ error: "Unsupported audio format" },
			{ status: 400 },
		);
	}

	try {
		const bytes = Buffer.from(await audio.arrayBuffer());
		const result = await submitVolcengineVoiceClone({
			input: {
				speakerId,
				customSpeakerId: explicitSpeakerId ? customSpeakerId : speakerId,
				audioData: bytes.toString("base64"),
				audioFormat,
				text: formString({ form, key: "text" }),
				demoText: formString({ form, key: "demoText" }),
				language: numberString(formString({ form, key: "language" })),
				enableAudioDenoise: boolString(
					formString({ form, key: "enableAudioDenoise" }),
				),
			},
		});
		return ApiResponse.json(result);
	} catch (error) {
		const normalized = normalizeError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
