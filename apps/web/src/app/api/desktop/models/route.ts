import { isSecretDesktopApiField } from "@/desktop/config/catalog";
import { isDesktopMode, readDesktopApiConfig } from "@/desktop/config/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	provider: z.enum(["openai", "openai-compatible", "anthropic", "google"]),
	baseUrl: z.string().url().optional(),
	apiKey: z.string().optional(),
	apiKeyConfigKey: z.string().optional(),
});

const DEFAULT_BASE_URLS = {
	openai: "https://api.openai.com/v1",
	"openai-compatible": "https://api.openai.com/v1",
	anthropic: "https://api.anthropic.com/v1",
	google: "https://generativelanguage.googleapis.com/v1beta",
} satisfies Record<z.infer<typeof requestSchema>["provider"], string>;

function disabledResponse() {
	return NextResponse.json(
		{
			error:
				"desktop_models_disabled: start Shotlyx with SHOTLYX_DESKTOP=1 to list provider models",
		},
		{ status: 404 },
	);
}

function buildModelsUrl({
	provider,
	baseUrl,
	apiKey,
}: {
	provider: z.infer<typeof requestSchema>["provider"];
	baseUrl: string;
	apiKey: string;
}) {
	const normalizedBase = baseUrl.replace(/\/+$/, "");
	if (provider === "google") {
		const url = new URL(`${normalizedBase}/models`);
		url.searchParams.set("key", apiKey);
		return url.toString();
	}
	return `${normalizedBase}/models`;
}

function getHeaders({
	provider,
	apiKey,
}: {
	provider: z.infer<typeof requestSchema>["provider"];
	apiKey: string;
}): Record<string, string> {
	if (provider === "google") return {};
	if (provider === "anthropic") {
		return {
			"anthropic-version": "2023-06-01",
			"x-api-key": apiKey,
		};
	}
	return {
		Authorization: `Bearer ${apiKey}`,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeModelId(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const model = value.startsWith("models/")
		? value.slice("models/".length)
		: value;
	return model.trim() || null;
}

function extractModels({
	provider,
	data,
}: {
	provider: z.infer<typeof requestSchema>["provider"];
	data: unknown;
}) {
	const models = isRecord(data)
		? provider === "google" && Array.isArray(data.models)
			? data.models
			: Array.isArray(data.data)
				? data.data
				: []
		: [];

	return Array.from(
		new Set(
			models
				.map((item) => {
					if (!isRecord(item)) return null;
					return normalizeModelId(item.id ?? item.name);
				})
				.filter((model): model is string => Boolean(model)),
		),
	).sort((a, b) => a.localeCompare(b));
}

export async function POST(request: Request) {
	if (!isDesktopMode()) return disabledResponse();

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

	const savedValues = readDesktopApiConfig().values;
	const savedKey = parsed.data.apiKeyConfigKey
		? isSecretDesktopApiField(parsed.data.apiKeyConfigKey)
			? savedValues[parsed.data.apiKeyConfigKey]
			: ""
		: savedValues.AGENT_LLM_KEY;
	const apiKey = parsed.data.apiKey?.trim() || savedKey || "";
	if (!apiKey) {
		return NextResponse.json(
			{ error: "Missing API key for model list" },
			{ status: 400 },
		);
	}

	const baseUrl =
		parsed.data.baseUrl?.trim() || DEFAULT_BASE_URLS[parsed.data.provider];
	const url = buildModelsUrl({
		provider: parsed.data.provider,
		baseUrl,
		apiKey,
	});

	const response = await fetch(url, {
		headers: getHeaders({ provider: parsed.data.provider, apiKey }),
		cache: "no-store",
	});
	const data: unknown = await response.json().catch(() => ({}));
	if (!response.ok) {
		return NextResponse.json(
			{
				error: "Failed to fetch models",
				status: response.status,
				details: data,
			},
			{ status: response.status },
		);
	}

	return NextResponse.json({
		desktop: true,
		provider: parsed.data.provider,
		baseUrl,
		models: extractModels({ provider: parsed.data.provider, data }),
	});
}
