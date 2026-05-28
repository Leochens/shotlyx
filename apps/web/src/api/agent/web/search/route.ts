import { searchWeb } from "@/agent/tools/web/provider-registry";
import { WEB_SEARCH_PROVIDERS } from "@/agent/tools/web/types";
import { getRuntimeEnv } from "@/desktop/config/server";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
	query: z.string().min(1),
	count: z.number().int().min(1).max(10).optional(),
	provider: z.enum(WEB_SEARCH_PROVIDERS).optional(),
	includeAnswer: z.boolean().optional(),
	includeImages: z.boolean().optional(),
	includeContent: z.boolean().optional(),
});

function normalizeWebError(error: unknown): {
	message: string;
	status: number;
} {
	const message = error instanceof Error ? error.message : "provider_error";
	if (message.startsWith("configuration_error")) {
		return { message, status: 500 };
	}
	if (
		message.startsWith("param_error") ||
		message.startsWith("provider_unsupported")
	) {
		return { message, status: 400 };
	}
	return { message, status: 502 };
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
		const env = getRuntimeEnv();
		const result = await searchWeb({
			input: parsed.data,
			deps: {
				apiKeys: {
					tavily: env.TAVILY_API_KEY,
					firecrawl: env.FIRECRAWL_API_KEY,
					brave: env.BRAVE_SEARCH_API_KEY,
				},
				env,
			},
		});
		return ApiResponse.json(result);
	} catch (error) {
		const normalized = normalizeWebError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
