import { searchStockMedia } from "@/agent/tools/stock-media/provider-registry";
import {
	LICENSE_POLICIES,
	STOCK_MEDIA_PROVIDERS,
	STOCK_MEDIA_TYPES,
	STOCK_ORIENTATIONS,
	STOCK_RESOLUTIONS,
} from "@/agent/tools/stock-media/types";
import { getRuntimeEnv } from "@/desktop/config/server";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	query: z.string().min(1),
	type: z.enum(STOCK_MEDIA_TYPES).default("video"),
	orientation: z.enum(STOCK_ORIENTATIONS).optional(),
	durationSeconds: z
		.object({
			min: z.number().nonnegative().optional(),
			max: z.number().positive().optional(),
		})
		.optional(),
	resolution: z.enum(STOCK_RESOLUTIONS).optional(),
	locale: z.string().min(2).optional(),
	count: z.number().int().min(1).max(20).optional(),
	page: z.number().int().min(1).optional(),
	licensePolicy: z.enum(LICENSE_POLICIES).default("safe-commercial"),
	providers: z.array(z.enum(STOCK_MEDIA_PROVIDERS)).min(1).optional(),
});

function normalizeStockError(error: unknown): {
	message: string;
	status: number;
} {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error")) {
		return { message, status: 500 };
	}
	return { message, status: 502 };
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
		const env = getRuntimeEnv();
		const result = await searchStockMedia({
			input: parsed.data,
			deps: {
				apiKeys: {
					pexels: env.PEXELS_API_KEY,
					pixabay: env.PIXABAY_API_KEY,
					freesound: env.FREESOUND_API_KEY,
				},
			},
		});
		return NextResponse.json(result);
	} catch (error) {
		const normalized = normalizeStockError(error);
		return NextResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
