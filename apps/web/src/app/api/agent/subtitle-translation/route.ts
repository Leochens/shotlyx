import { getDefaultModel } from "@/agent/ai-sdk/providers";
import { generateObject } from "ai";
import { type NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		const model = getDefaultModel();
		const result = await generateObject({
			model,
			schema: translationResponseSchema,
			system:
				"You translate subtitle cues for a video editor. Return only valid JSON matching the schema. Translate each cue independently, preserve cue indices exactly, keep the number/order aligned with the input, and keep text concise for subtitle display. Do not add timestamps, speaker labels, markdown, explanations, or extra cues.",
			prompt: JSON.stringify({
				targetLanguage: parsed.data.targetLanguage,
				sourceLanguage: parsed.data.sourceLanguage ?? "auto",
				cues: parsed.data.cues,
			}),
		});

		const translationsByIndex = new Map(
			result.object.translations.map((translation) => [
				translation.index,
				translation.text.trim(),
			]),
		);
		const translations = parsed.data.cues.flatMap((cue) => {
			const text = translationsByIndex.get(cue.index);
			return text ? [{ index: cue.index, text }] : [];
		});

		return NextResponse.json({
			provider: "agent-llm",
			targetLanguage: parsed.data.targetLanguage,
			translations,
		});
	} catch (error) {
		const normalized = normalizeError(error);
		return NextResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
