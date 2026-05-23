import type { LLMProviderConfig } from "./types";
import type { LLMProviderId, LLMStructuredOutputMode } from "./types";

type LLMConfigName = "default" | "mg" | "asr" | "vision";

function normalizeProvider(value: string | undefined): LLMProviderId | undefined {
	if (!value) return undefined;
	const normalized = value.toLowerCase().trim();
	switch (normalized) {
		case "gemini":
		case "google-generative-ai":
		case "google":
			return "google";
		case "claude":
		case "anthropic":
			return "anthropic";
		case "openai":
			return "openai";
		case "openai-compatible":
		case "openai_compatible":
			return "openai-compatible";
		default:
			return undefined;
	}
}

function inferProvider({
	explicit,
	host,
	model,
}: {
	explicit?: string;
	host?: string;
	model?: string;
}): LLMProviderId {
	const provider = normalizeProvider(explicit);
	if (provider) return provider;

	const normalizedHost = host?.toLowerCase() ?? "";
	const normalizedModel = model?.toLowerCase() ?? "";
	if (
		normalizedHost.includes("generativelanguage.googleapis.com") ||
		normalizedModel.includes("gemini")
	) {
		return "google";
	}
	if (
		normalizedHost.includes("anthropic.com") ||
		normalizedModel.includes("claude")
	) {
		return "anthropic";
	}
	if (normalizedHost.includes("api.openai.com")) {
		return "openai";
	}
	return "openai-compatible";
}

function defaultHostForProvider(provider: LLMProviderId): string {
	if (provider === "google") {
		return "https://generativelanguage.googleapis.com/v1beta";
	}
	if (provider === "anthropic") {
		return "https://api.anthropic.com/v1";
	}
	return "https://api.openai.com/v1";
}

function normalizeStructuredOutputMode(
	value: string | undefined,
): LLMStructuredOutputMode | undefined {
	if (!value) return undefined;
	const normalized = value.toLowerCase().trim();
	switch (normalized) {
		case "auto":
		case "native":
		case "plain-json":
			return normalized;
		default:
			return undefined;
	}
}

function getScopedEnv(name: LLMConfigName) {
	if (name === "default") {
		return {
			provider: process.env.AGENT_LLM_PROVIDER,
			host: process.env.AGENT_LLM_HOST,
			apiKey: process.env.AGENT_LLM_KEY,
			model: process.env.AGENT_LLM_MODEL,
			structuredOutputMode: process.env.AGENT_LLM_STRUCTURED_OUTPUT_MODE,
		};
	}
	const prefix = `AGENT_${name.toUpperCase()}`;
	return {
		provider:
			process.env[`${prefix}_PROVIDER`] ?? process.env.AGENT_LLM_PROVIDER,
		host: process.env[`${prefix}_HOST`] ?? process.env.AGENT_LLM_HOST,
		apiKey: process.env[`${prefix}_KEY`] ?? process.env.AGENT_LLM_KEY,
		model: process.env[`${prefix}_MODEL`] ?? process.env.AGENT_LLM_MODEL,
		structuredOutputMode:
			process.env[`${prefix}_STRUCTURED_OUTPUT_MODE`] ??
			process.env.AGENT_LLM_STRUCTURED_OUTPUT_MODE,
	};
}

function defaultModelForName(name: LLMConfigName): string {
	if (name === "asr") return "gpt-4o-mini";
	return "gpt-4o";
}

function buildConfig(name: LLMConfigName): LLMProviderConfig {
	const env = getScopedEnv(name);
	const provider = inferProvider({
		explicit: env.provider,
		host: env.host,
		model: env.model,
	});
	return {
		name,
		provider,
		host: env.host ?? defaultHostForProvider(provider),
		apiKey: env.apiKey ?? "",
		model: env.model ?? defaultModelForName(name),
		structuredOutputMode: normalizeStructuredOutputMode(
			env.structuredOutputMode,
		),
	};
}

export function loadLLMConfigFromEnv(): Record<string, LLMProviderConfig> {
	return {
		default: buildConfig("default"),
		mg: buildConfig("mg"),
		asr: buildConfig("asr"),
		vision: buildConfig("vision"),
	};
}
