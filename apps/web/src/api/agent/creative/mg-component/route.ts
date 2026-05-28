import { getMGModelBundle } from "@/agent/ai-sdk/providers";
import { generateShotlyxMGComponentDocument } from "@/shotlyx/remotion-components/generator";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	prompt: z.string().min(1),
	durationSeconds: z.number().positive().max(120).optional(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
	styleGuide: z.string().optional(),
	transparentBackground: z.boolean().optional(),
	repairAttempts: z.number().int().min(0).max(3).optional(),
	preferPlainJson: z.boolean().optional(),
	maxOutputTokens: z.number().int().min(512).max(8000).optional(),
});

function normalizeMGGenerationError(error: unknown): {
	message: string;
	status: number;
} {
	const rawMessage = error instanceof Error ? error.message : "";
	if (rawMessage.startsWith("configuration_error")) {
		return { message: rawMessage, status: 500 };
	}
	if (rawMessage.includes("API key") || rawMessage.includes("Authorization")) {
		return {
			message: "configuration_error: missing AGENT_MG_KEY or AGENT_LLM_KEY",
			status: 500,
		};
	}
	if (rawMessage.startsWith("provider_error")) {
		return { message: rawMessage, status: 502 };
	}
	return {
		message: rawMessage || "provider_error: Shotlyx MG generation failed",
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
		const mgModel = getMGModelBundle();
		const document = await generateShotlyxMGComponentDocument({
			...parsed.data,
			model: mgModel.model,
			providerConfig: mgModel.config,
		});
		return ApiResponse.json({ document });
	} catch (error) {
		const normalized = normalizeMGGenerationError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
