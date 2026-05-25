export interface SeedanceCreateVideoTaskInput {
	prompt: string;
	aspectRatio?: string;
	durationSeconds?: number;
	referenceImageUrl?: string;
}

export interface SeedanceCreateVideoTaskResult {
	id: string;
	model: string;
	prompt: string;
	aspectRatio?: string;
	durationSeconds?: number;
}

export interface SeedanceVideoTaskResult {
	id: string;
	model?: string;
	status: string;
	videoUrl?: string;
	lastFrameUrl?: string;
	error?: string;
	createdAt?: number;
	updatedAt?: number;
	aspectRatio?: string;
	durationSeconds?: number;
}

interface SeedanceEnv {
	apiKey: string;
	baseUrl: string;
	model: string;
}

function requireEnvValue({
	names,
	label,
}: {
	names: string[];
	label: string;
}): string {
	for (const name of names) {
		const value = process.env[name];
		if (value) return value;
	}
	throw new Error(`configuration_error: missing ${label}`);
}

function getSeedanceEnv(): SeedanceEnv {
	return {
		apiKey: requireEnvValue({
			names: ["VOLCENGINE_ARK_API_KEY", "ARK_API_KEY", "VOLCENGINE_API_KEY"],
			label: "VOLCENGINE_ARK_API_KEY",
		}),
		baseUrl: (
			process.env.VOLCENGINE_ARK_BASE_URL ??
			"https://ark.cn-beijing.volces.com/api/v3"
		).replace(/\/$/, ""),
		model: requireEnvValue({
			names: ["SEEDANCE_VIDEO_MODEL"],
			label: "SEEDANCE_VIDEO_MODEL",
		}),
	};
}

function appendPromptFlag({
	prompt,
	flag,
	value,
	aliases = [],
}: {
	prompt: string;
	flag: string;
	value?: string | number;
	aliases?: string[];
}): string {
	if (value === undefined) return prompt;
	const markers = [flag, ...aliases];
	if (markers.some((marker) => prompt.includes(marker))) return prompt;
	return `${prompt.trim()} ${flag} ${value}`.trim();
}

function buildSeedancePrompt({
	prompt,
	aspectRatio,
	durationSeconds,
}: SeedanceCreateVideoTaskInput): string {
	let result = prompt.trim();
	result = appendPromptFlag({
		prompt: result,
		flag: "--ratio",
		value: aspectRatio,
	});
	result = appendPromptFlag({
		prompt: result,
		flag: "--duration",
		value: durationSeconds,
		aliases: ["--dur"],
	});
	return result;
}

async function readProviderJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		throw new Error("provider_error: invalid Seedance response");
	}
}

function providerErrorMessage({
	status,
	body,
}: {
	status: number;
	body: unknown;
}): string {
	if (typeof body === "object" && body !== null && "error" in body) {
		const error = Reflect.get(body, "error");
		if (typeof error === "object" && error !== null) {
			const code = Reflect.get(error, "code");
			const message = Reflect.get(error, "message");
			return `provider_error: Seedance failed with ${status}${
				typeof code === "string" ? ` ${code}` : ""
			}${typeof message === "string" ? `: ${message}` : ""}`;
		}
	}
	return `provider_error: Seedance failed with ${status}`;
}

function getStringField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const field = Reflect.get(value, key);
	return typeof field === "string" ? field : undefined;
}

function getNumberField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): number | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const field = Reflect.get(value, key);
	return typeof field === "number" ? field : undefined;
}

export async function createSeedanceVideoTask({
	prompt,
	aspectRatio,
	durationSeconds,
	referenceImageUrl,
}: SeedanceCreateVideoTaskInput): Promise<SeedanceCreateVideoTaskResult> {
	const env = getSeedanceEnv();
	const taskPrompt = buildSeedancePrompt({
		prompt,
		aspectRatio,
		durationSeconds,
	});
	const content: Array<Record<string, unknown>> = [
		{ type: "text", text: taskPrompt },
	];
	if (referenceImageUrl) {
		content.push({
			type: "image_url",
			image_url: { url: referenceImageUrl },
		});
	}

	const response = await fetch(`${env.baseUrl}/contents/generations/tasks`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: env.model,
			content,
		}),
	});
	const body = await readProviderJson(response);
	if (!response.ok) {
		throw new Error(providerErrorMessage({ status: response.status, body }));
	}

	const id = getStringField({ value: body, key: "id" });
	if (!id) {
		throw new Error("provider_error: Seedance create response missing task id");
	}

	return {
		id,
		model: env.model,
		prompt,
		aspectRatio,
		durationSeconds,
	};
}

export async function getSeedanceVideoTask({
	taskId,
}: {
	taskId: string;
}): Promise<SeedanceVideoTaskResult> {
	const env = getSeedanceEnv();
	const response = await fetch(
		`${env.baseUrl}/contents/generations/tasks/${encodeURIComponent(taskId)}`,
		{
			headers: {
				Authorization: `Bearer ${env.apiKey}`,
				"Content-Type": "application/json",
			},
		},
	);
	const body = await readProviderJson(response);
	if (!response.ok) {
		throw new Error(providerErrorMessage({ status: response.status, body }));
	}

	const content =
		typeof body === "object" && body !== null
			? Reflect.get(body, "content")
			: undefined;
	const videoUrl =
		getStringField({ value: content, key: "video_url" }) ??
		getStringField({ value: content, key: "videoUrl" }) ??
		getStringField({ value: content, key: "file_url" });
	const lastFrameUrl =
		getStringField({ value: content, key: "last_frame_url" }) ??
		getStringField({ value: content, key: "lastFrameUrl" });

	return {
		id: getStringField({ value: body, key: "id" }) ?? taskId,
		model: getStringField({ value: body, key: "model" }),
		status: getStringField({ value: body, key: "status" }) ?? "unknown",
		videoUrl,
		lastFrameUrl,
		error: getStringField({ value: body, key: "error" }),
		createdAt: getNumberField({ value: body, key: "created_at" }),
		updatedAt: getNumberField({ value: body, key: "updated_at" }),
		aspectRatio:
			getStringField({ value: body, key: "ratio" }) ??
			getStringField({ value: body, key: "aspect_ratio" }),
		durationSeconds: getNumberField({ value: body, key: "duration" }),
	};
}
