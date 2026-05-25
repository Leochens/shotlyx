import { synthesizeVoiceover } from "@/agent/tools/voiceover/providers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	text: z.string().min(1),
	voice: z.string().optional(),
	voiceId: z.string().optional(),
	resourceId: z.string().optional(),
	language: z.string().optional(),
	speed: z.number().min(0.25).max(4).optional(),
	emotion: z.string().optional(),
	provider: z.string().optional(),
	format: z.enum(["mp3", "wav", "ogg"]).optional(),
});

function filenameFor({
	format,
	provider,
}: {
	format: string;
	provider: string;
}): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	return `voiceover-${provider}-${stamp}.${format}`;
}

function normalizeError(error: unknown): { message: string; status: number } {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error"))
		return { message, status: 500 };
	if (message.startsWith("provider_unsupported"))
		return { message, status: 400 };
	if (message.startsWith("provider_error")) return { message, status: 502 };
	return {
		message: "provider_error: voiceover generation failed",
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
		const result = await synthesizeVoiceover({
			input: {
				text: parsed.data.text,
				voice: parsed.data.voice ?? parsed.data.voiceId,
				resourceId: parsed.data.resourceId,
				locale: parsed.data.language,
				speed: parsed.data.speed,
				emotion: parsed.data.emotion,
				provider: parsed.data.provider,
				format: parsed.data.format,
			},
		});
		const filename = filenameFor({
			format: result.format,
			provider: result.provider,
		});
		const audioBuffer = new ArrayBuffer(result.audio.byteLength);
		new Uint8Array(audioBuffer).set(result.audio);
		return new NextResponse(
			new Blob([audioBuffer], { type: result.mimeType }),
			{
				headers: {
					"Content-Type": result.mimeType,
					"Content-Disposition": `attachment; filename="${filename}"`,
					"X-Voiceover-Filename": filename,
					"X-Voiceover-Provider": result.provider,
					"X-Voiceover-Voice": result.voice ?? "",
					"X-Voiceover-Resource-Id": result.resourceId ?? "",
				},
			},
		);
	} catch (error) {
		const normalized = normalizeError(error);
		return NextResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
