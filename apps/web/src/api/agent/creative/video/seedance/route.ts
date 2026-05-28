import { createSeedanceVideoTask } from "@/agent/tools/creative/seedance-video-provider";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	prompt: z.string().min(1),
	aspectRatio: z.string().optional(),
	durationSeconds: z.number().int().min(1).max(30).optional(),
	referenceImageUrl: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.string().min(1).optional(),
	),
});

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
		const result = await createSeedanceVideoTask(parsed.data);
		return ApiResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error &&
			(error.message.startsWith("configuration_error") ||
				error.message.startsWith("provider_error"))
				? error.message
				: "provider_error";
		const status = message.startsWith("configuration_error") ? 500 : 502;
		return ApiResponse.json({ error: message }, { status });
	}
}
