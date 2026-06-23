import { getDefaultModelBundle } from "@/agent/ai-sdk/providers";
import { resolveStructuredGenerationMode } from "@/agent/ai-sdk/request-builder";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const candidateSchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	cueText: z.string().optional(),
	contextBefore: z.string().optional(),
	contextAfter: z.string().optional(),
	trackLabel: z.string().optional(),
	startTimeSeconds: z.number().optional(),
	endTimeSeconds: z.number().optional(),
	durationSeconds: z.number().optional(),
});

const requestSchema = z.object({
	instructions: z.string().optional(),
	candidates: z.array(candidateSchema).min(1).max(1500),
});

const fillerAnalysisResponseSchema = z.object({
	cutIds: z.array(z.string()),
	decisions: z
		.array(
			z.object({
				id: z.string(),
				shouldCut: z.boolean(),
				reason: z.string().optional(),
			}),
		)
		.optional(),
});

type FillerAnalysisResponse = z.infer<typeof fillerAnalysisResponseSchema>;

const FILLER_ANALYSIS_SYSTEM_PROMPT =
	'You are a video transcript cleanup editor. Decide which candidate tokens are redundant filler or breath-opening utterances that should be cut from the source video. Cut only standalone redundant tokens such as "嗯", "啊", "呃", "额", "uh", "um", or similar hesitation sounds when removing them does not harm meaning. Do not cut meaningful particles or words inside phrases, for example "好啊", "是吗", "哦这样", names, numbers, or content words. Use cueText plus contextBefore/contextAfter to judge intent. Return only valid JSON in this exact shape: {"cutIds":["candidate-id"],"decisions":[{"id":"candidate-id","shouldCut":true,"reason":"short reason"}]}. Include only ids from the input.';

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.toLowerCase().includes("api key") ||
		message.toLowerCase().includes("configuration")
	) {
		return {
			message:
				"configuration_error: subtitle filler analysis model is not configured",
			status: 500,
		};
	}
	return {
		message: "provider_error: subtitle filler analysis failed",
		status: 502,
	};
}

function extractJsonObjectText(text: string): string {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	const candidate = (fenced?.[1] ?? trimmed).trim();
	if (candidate.startsWith("{") && candidate.endsWith("}")) {
		return candidate;
	}

	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start >= 0 && end > start) {
		return candidate.slice(start, end + 1);
	}
	return candidate;
}

function parsePlainJsonFillerAnalysisResponse(
	text: string,
): FillerAnalysisResponse {
	const parsed: unknown = JSON.parse(extractJsonObjectText(text));
	return fillerAnalysisResponseSchema.parse(parsed);
}

async function analyzeWithPlainJson({
	model,
	prompt,
}: {
	model: LanguageModel;
	prompt: string;
}): Promise<FillerAnalysisResponse> {
	const result = await generateText({
		model,
		system: FILLER_ANALYSIS_SYSTEM_PROMPT,
		prompt,
	});
	return parsePlainJsonFillerAnalysisResponse(result.text);
}

async function analyzeWithNativeObject({
	model,
	prompt,
}: {
	model: LanguageModel;
	prompt: string;
}): Promise<FillerAnalysisResponse> {
	const result = await generateObject({
		model,
		schema: fillerAnalysisResponseSchema,
		system: FILLER_ANALYSIS_SYSTEM_PROMPT,
		prompt,
	});
	return result.object;
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
		const { config, model } = getDefaultModelBundle();
		const prompt = JSON.stringify({
			instructions: parsed.data.instructions ?? "",
			candidates: parsed.data.candidates,
		});
		const response =
			resolveStructuredGenerationMode({ config }) === "plain-json"
				? await analyzeWithPlainJson({ model, prompt })
				: await analyzeWithNativeObject({ model, prompt });

		const inputIds = new Set(
			parsed.data.candidates.map((candidate) => candidate.id),
		);
		const cutIds = response.cutIds.filter((id) => inputIds.has(id));
		const decisions = response.decisions
			?.filter((decision) => inputIds.has(decision.id))
			.map((decision) => ({
				id: decision.id,
				shouldCut: decision.shouldCut,
				...(decision.reason ? { reason: decision.reason } : {}),
			}));

		return ApiResponse.json({
			provider: "agent-llm",
			cutIds,
			...(decisions ? { decisions } : {}),
		});
	} catch (error) {
		const normalized = normalizeError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
