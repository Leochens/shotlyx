import { getVolcengineVoiceCloneStatus } from "@/agent/tools/voiceover/volcengine-clone";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	speakerId: z.string().min(1),
	customSpeakerId: z.string().optional(),
});

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error")) return { message, status: 500 };
	if (message.startsWith("provider_error")) return { message, status: 502 };
	return {
		message: "provider_error: Volcengine voice status failed",
		status: 502,
	};
}

export async function POST(request: ApiRequest) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return ApiResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		return ApiResponse.json(
			await getVolcengineVoiceCloneStatus({ input: parsed.data }),
		);
	} catch (error) {
		const normalized = normalizeError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
