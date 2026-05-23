interface GenerateImageInput {
	prompt: string;
	size?: string;
	count?: number;
}

interface ProviderImage {
	url?: string;
	b64_json?: string;
}

interface ProviderResponse {
	data?: ProviderImage[];
}

export interface GenerateImageResult {
	images: Array<{
		url: string;
		model: string;
		prompt: string;
		provider: "openai-compatible";
	}>;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`configuration_error: missing ${name}`);
	}
	return value;
}

function normalizeBaseUrl(value: string): string {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isProviderImage(value: unknown): value is ProviderImage {
	return typeof value === "object" && value !== null;
}

function readProviderResponse(value: unknown): ProviderResponse {
	if (typeof value !== "object" || value === null || !("data" in value)) {
		return {};
	}

	const data = value.data;
	if (!Array.isArray(data)) {
		return {};
	}

	return { data: data.filter(isProviderImage) };
}

async function postImageGenerationRequest({
	baseUrl,
	apiKey,
	model,
	prompt,
	size,
	count,
}: {
	baseUrl: string;
	apiKey: string;
	model: string;
	prompt: string;
	size: string;
	count: number;
}): Promise<Response> {
	try {
		return await fetch(`${baseUrl}/images/generations`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model,
				prompt,
				size,
				n: count,
			}),
		});
	} catch {
		throw new Error("provider_error: image generation request failed");
	}
}

async function parseProviderResponse(response: Response): Promise<ProviderResponse> {
	try {
		return readProviderResponse(await response.json());
	} catch {
		throw new Error("provider_error: invalid image generation response");
	}
}

export async function generateImageWithOpenAICompatibleProvider({
	prompt,
	size = "1024x1024",
	count = 1,
}: GenerateImageInput): Promise<GenerateImageResult> {
	const baseUrl = normalizeBaseUrl(requireEnv("IMAGE_GENERATION_BASE_URL"));
	const apiKey = requireEnv("IMAGE_GENERATION_API_KEY");
	const model = requireEnv("IMAGE_GENERATION_MODEL");

	const response = await postImageGenerationRequest({
		baseUrl,
		apiKey,
		model,
		prompt,
		size,
		count,
	});

	if (!response.ok) {
		throw new Error(
			`provider_error: image generation failed with ${response.status}`,
		);
	}

	const json = await parseProviderResponse(response);
	const images = (json.data ?? []).map((item) => {
		const url =
			item.url ??
			(item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
		if (!url) {
			throw new Error("provider_error: image response missing url or b64_json");
		}

		return {
			url,
			model,
			prompt,
			provider: "openai-compatible" as const,
		};
	});

	if (images.length === 0) {
		throw new Error("provider_error: no images returned");
	}

	return { images };
}
