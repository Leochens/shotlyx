import { STOCK_MEDIA_PROVIDERS } from "@/agent/tools/stock-media/types";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const candidateSchema = z.object({
	id: z.string().optional(),
	provider: z.enum(STOCK_MEDIA_PROVIDERS),
	providerAssetId: z.string().min(1),
	title: z.string().min(1),
	downloadUrl: z.string().url().optional(),
	previewUrl: z.string().url(),
	sourceUrl: z.string().url(),
});

const requestSchema = z.object({
	candidate: candidateSchema,
});

function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
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

	const downloadUrl =
		parsed.data.candidate.downloadUrl ?? parsed.data.candidate.previewUrl;
	if (!isHttpsUrl(downloadUrl)) {
		return NextResponse.json(
			{ error: "Invalid download URL" },
			{ status: 400 },
		);
	}

	let upstream: Response;
	try {
		upstream = await fetch(downloadUrl, { method: "GET" });
	} catch {
		return NextResponse.json(
			{ error: "provider_error: stock media download failed" },
			{ status: 502 },
		);
	}

	if (!upstream.ok) {
		return NextResponse.json(
			{
				error: `provider_error: stock media download failed (${upstream.status})`,
			},
			{ status: 502 },
		);
	}

	const headers = new Headers();
	const contentType = upstream.headers.get("Content-Type");
	const contentLength = upstream.headers.get("Content-Length");
	if (contentType) headers.set("Content-Type", contentType);
	if (contentLength) headers.set("Content-Length", contentLength);
	headers.set("Cache-Control", "no-store");

	return new Response(upstream.body, {
		status: 200,
		headers,
	});
}
