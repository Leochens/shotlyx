import { generateShotlyxMGComponentDocument } from "@/shotlyx/remotion-components/generator";
import { resolveShotlyxMGGenerationRuntime } from "@/shotlyx/remotion-components/generation-runtime";
import { createShotlyxMGJob } from "@/shotlyx/remotion-components/jobs";
import {
	SHOTLYX_MG_TEMPLATE_IDS,
	normalizeShotlyxMGTemplateSelection,
} from "@/shotlyx/remotion-components/template-registry";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

export const shotlyxMGJobRequestSchema = z.object({
	prompt: z.string().min(1),
	durationSeconds: z.number().positive().max(120).optional(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
	styleGuide: z.string().optional(),
	transparentBackground: z.boolean().optional(),
	componentCount: z.number().int().min(1).optional(),
	templateMode: z.enum(["off", "auto", "force"]).optional(),
	templateId: z.enum(SHOTLYX_MG_TEMPLATE_IDS).optional(),
	repairAttempts: z.number().int().min(0).max(2).optional(),
	maxOutputTokens: z.number().int().min(512).max(12_000).optional(),
});

export async function POST(request: ApiRequest) {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return ApiResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = shotlyxMGJobRequestSchema.safeParse(body);
	if (!parsed.success) {
		return ApiResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const templateSelection = normalizeShotlyxMGTemplateSelection({
		templateMode: parsed.data.templateMode,
		templateId: parsed.data.templateId,
		defaultTemplateMode: "off",
	});
	const job = createShotlyxMGJob({
		input: {
			...parsed.data,
			...templateSelection,
		},
		generateDocumentFn: (args) => {
			const generationRuntime = resolveShotlyxMGGenerationRuntime();
			return generateShotlyxMGComponentDocument({
				...args,
				...generationRuntime,
			});
		},
	});

	return ApiResponse.json(job);
}
