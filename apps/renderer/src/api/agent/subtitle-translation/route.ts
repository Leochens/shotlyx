import { getDefaultModelBundle } from "@/agent/ai-sdk/providers";
import { resolveStructuredGenerationMode } from "@/agent/ai-sdk/request-builder";
import { generateObject, generateText, type LanguageModel } from "ai";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cueSchema = z.object({
	index: z.number().int().nonnegative(),
	text: z.string().min(1),
	startTime: z.number().optional(),
	duration: z.number().optional(),
});

const requestSchema = z.object({
	targetLanguage: z.string().min(1),
	sourceLanguage: z.string().optional(),
	cues: z.array(cueSchema).min(1),
});

const translationResponseSchema = z.object({
	translations: z.array(
		z.object({
			index: z.number().int().nonnegative(),
			text: z.string().min(1),
		}),
	),
});

type TranslationResponse = z.infer<typeof translationResponseSchema>;

const TRANSLATION_SYSTEM_PROMPT =
	'You translate subtitle cues for a video editor. Return only valid JSON in this exact shape: {"translations":[{"index":0,"text":"translated subtitle"}]}. Translate each cue independently, preserve cue indices exactly, keep the number/order aligned with the input, and keep text concise for subtitle display. Do not add timestamps, speaker labels, markdown, explanations, or extra cues.';

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : String(error);
	if (
		message.toLowerCase().includes("api key") ||
		message.toLowerCase().includes("configuration")
	) {
		return {
			message: "configuration_error: subtitle translation model is not configured",
			status: 500,
		};
	}
	return {
		message: "provider_error: subtitle translation failed",
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

function parsePlainJsonTranslationResponse(text: string): TranslationResponse {
	const parsed: unknown = JSON.parse(extractJsonObjectText(text));
	return translationResponseSchema.parse(parsed);
}

async function translateWithPlainJson({
	model,
	prompt,
}: {
	model: LanguageModel;
	prompt: string;
}): Promise<TranslationResponse> {
	const result = await generateText({
		model,
		system: TRANSLATION_SYSTEM_PROMPT,
		prompt,
	});
	return parsePlainJsonTranslationResponse(result.text);
}

async function translateWithNativeObject({
	model,
	prompt,
}: {
	model: LanguageModel;
	prompt: string;
}): Promise<TranslationResponse> {
	const result = await generateObject({
		model,
		schema: translationResponseSchema,
		system: TRANSLATION_SYSTEM_PROMPT,
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
			targetLanguage: parsed.data.targetLanguage,
			sourceLanguage: parsed.data.sourceLanguage ?? "auto",
			cues: parsed.data.cues,
		});
		const response =
			resolveStructuredGenerationMode({ config }) === "plain-json"
				? await translateWithPlainJson({ model, prompt })
				: await translateWithNativeObject({ model, prompt });

		const translationsByIndex = new Map(
			response.translations.map((translation) => [
				translation.index,
				translation.text.trim(),
			]),
		);
		const translations = parsed.data.cues.flatMap((cue) => {
			const text = translationsByIndex.get(cue.index);
			return text ? [{ index: cue.index, text }] : [];
		});

		return ApiResponse.json({
			provider: "agent-llm",
			targetLanguage: parsed.data.targetLanguage,
			translations,
		});
	} catch (error) {
		const normalized = normalizeError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
