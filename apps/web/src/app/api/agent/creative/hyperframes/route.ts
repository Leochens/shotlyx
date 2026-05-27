import { generateShotlyxHyperFramesDocument } from "@/shotlyx/hyperframes/generator";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	prompt: z.string().min(1),
	durationSeconds: z.number().positive().max(30).optional(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
	templateId: z
		.enum([
			"swiss-pulse-explainer",
			"kinetic-launch-type",
			"data-drift-ai",
			"editorial-spotlight",
		])
		.optional(),
	transparentBackground: z.boolean().optional(),
});

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
		const document = await generateShotlyxHyperFramesDocument(parsed.data);
		return NextResponse.json({ document });
	} catch (error) {
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "provider_error: HyperFrames generation failed",
			},
			{ status: 502 },
		);
	}
}
