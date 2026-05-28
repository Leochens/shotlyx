import { getMGModelBundle } from "@/agent/ai-sdk/providers";
import { generateShotlyxMGComponentDocument } from "@/shotlyx/remotion-components/generator";
import { createShotlyxMGJob } from "@/shotlyx/remotion-components/jobs";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

export const shotlyxMGJobRequestSchema = z.object({
	prompt: z.string().min(1),
	durationSeconds: z.number().positive().max(120).optional(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
	styleGuide: z.string().optional(),
	transparentBackground: z.boolean().optional(),
	componentCount: z.number().int().min(1).optional(),
	repairAttempts: z.number().int().min(0).max(3).optional(),
	preferPlainJson: z.boolean().optional(),
	maxOutputTokens: z.number().int().min(512).max(8000).optional(),
});

export async function POST(request: NextRequest) {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = shotlyxMGJobRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	const mgModel = getMGModelBundle();
	const job = createShotlyxMGJob({
		input: parsed.data,
		generateDocumentFn: (args) =>
			generateShotlyxMGComponentDocument({
				...args,
				model: mgModel.model,
				providerConfig: mgModel.config,
			}),
	});

	return NextResponse.json(job);
}
