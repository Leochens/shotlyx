import { transcribeAudio } from "@/agent/tools/transcription/providers";
import { type ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";

function stringFormValue({
	form,
	key,
}: {
	form: FormData;
	key: string;
}): string | undefined {
	const value = form.get(key);
	return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error")) return { message, status: 500 };
	if (message.startsWith("provider_unsupported")) return { message, status: 400 };
	if (message.startsWith("provider_error")) return { message, status: 502 };
	return { message: "provider_error: ASR transcription failed", status: 502 };
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
		return ApiResponse.json(
			{ error: 'Invalid input: "audio" file is required' },
			{ status: 400 },
		);
	}

	try {
		const result = await transcribeAudio({
			input: {
				audio,
				provider: stringFormValue({ form, key: "provider" }),
				language: stringFormValue({ form, key: "language" }),
				model: stringFormValue({ form, key: "model" }),
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
