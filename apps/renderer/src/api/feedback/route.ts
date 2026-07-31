import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";
import { checkRateLimit } from "@/auth/rate-limit";
import { submitFeedback, MAX_MESSAGE_LENGTH } from "@/feedback";

const submitSchema = z.object({
	message: z
		.string()
		.min(1, "Message is required")
		.max(MAX_MESSAGE_LENGTH, "Message too long"),
});

export async function POST(request: ApiRequest) {
	const { limited } = await checkRateLimit({ request });
	if (limited) {
		return ApiResponse.json({ error: "Too many requests" }, { status: 429 });
	}

	const body = await request.json();
	const result = submitSchema.safeParse(body);

	if (!result.success) {
		return ApiResponse.json(
			{ error: "Invalid input", details: result.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const entry = await submitFeedback(result.data);
	return ApiResponse.json({ entry }, { status: 201 });
}
