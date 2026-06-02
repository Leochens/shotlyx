import type { LLMProviderConfig } from "./types";
import type { LLMProviderId, LLMStructuredOutputMode } from "./types";
import { getRuntimeEnv } from "@/desktop/config/server";

type LLMConfigName = "default" | "mg" | "asr" | "vision";

function normalizeProvider(
	value: string | undefined,
): LLMProviderId | undefined {
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
	fallback,
}: {
	explicit?: string;
	host?: string;
	model?: string;
	fallback?: LLMProviderId;
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
	return fallback ?? "openai-compatible";
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
	const env = getRuntimeEnv();
	if (name === "default") {
		return {
			provider: env.AGENT_LLM_PROVIDER,
			host: env.AGENT_LLM_HOST,
			apiKey: env.AGENT_LLM_KEY,
			model: env.AGENT_LLM_MODEL,
			structuredOutputMode: env.AGENT_LLM_STRUCTURED_OUTPUT_MODE,
		};
	}
	if (name === "vision") {
		return {
			provider: env.AGENT_VISION_PROVIDER,
			host: env.AGENT_VISION_HOST,
			apiKey: env.AGENT_VISION_KEY,
			model: env.AGENT_VISION_MODEL,
			structuredOutputMode: env.AGENT_VISION_STRUCTURED_OUTPUT_MODE,
		};
	}
	const prefix = `AGENT_${name.toUpperCase()}`;
	return {
		provider: env[`${prefix}_PROVIDER`] ?? env.AGENT_LLM_PROVIDER,
		host: env[`${prefix}_HOST`] ?? env.AGENT_LLM_HOST,
		apiKey: env[`${prefix}_KEY`] ?? env.AGENT_LLM_KEY,
		model: env[`${prefix}_MODEL`] ?? env.AGENT_LLM_MODEL,
		structuredOutputMode:
			env[`${prefix}_STRUCTURED_OUTPUT_MODE`] ??
			env.AGENT_LLM_STRUCTURED_OUTPUT_MODE,
	};
}

function defaultProviderForName(name: LLMConfigName): LLMProviderId | undefined {
	if (name === "vision") return "openai-compatible";
	return undefined;
}

function defaultHostForName({
	name,
	provider,
}: {
	name: LLMConfigName;
	provider: LLMProviderId;
}): string {
	if (name === "vision") return "https://api.minimax.io/v1";
	return defaultHostForProvider(provider);
}

function defaultModelForName(name: LLMConfigName): string {
	if (name === "asr") return "gpt-4o-mini";
	if (name === "vision") return "MiniMax-M3";
	return "gpt-4o";
}

function buildConfig(name: LLMConfigName): LLMProviderConfig {
	const env = getScopedEnv(name);
	const provider = inferProvider({
		explicit: env.provider,
		host: env.host,
		model: env.model,
		fallback: defaultProviderForName(name),
	});
	return {
		name,
		provider,
		host: env.host ?? defaultHostForName({ name, provider }),
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
