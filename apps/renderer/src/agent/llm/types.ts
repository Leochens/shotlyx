export type LLMProviderId =
	| "openai-compatible"
	| "openai"
	| "google"
	| "anthropic";

export type LLMStructuredOutputMode = "auto" | "native" | "plain-json";

export interface LLMProviderConfig {
	name: string;
	provider: LLMProviderId;
	host: string;
	apiKey: string;
	model: string;
	maxTokens?: number;
	temperature?: number;
	structuredOutputMode?: LLMStructuredOutputMode;
}
