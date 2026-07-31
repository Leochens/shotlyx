import { Output, type generateText } from "ai";
import type { LLMProviderConfig } from "@/agent/llm/types";
import type { ZodType } from "zod";

export type StructuredGenerationMode = "native" | "plain-json";
export type GenerateTextRequest = Parameters<typeof generateText>[0];
type GenerateTextProviderOptions = GenerateTextRequest["providerOptions"];

export function resolveStructuredGenerationMode({
	config,
	preferPlainJson,
}: {
	config?: LLMProviderConfig;
	preferPlainJson?: boolean;
}): StructuredGenerationMode {
	if (preferPlainJson) return "plain-json";
	if (config?.structuredOutputMode === "native") return "native";
	if (config?.structuredOutputMode === "plain-json") return "plain-json";
	if (config?.provider === "google") return "plain-json";
	if (config?.provider === "openai-compatible") return "plain-json";
	return "native";
}

export function buildStructuredProviderOptions({
	config,
}: {
	config?: LLMProviderConfig;
}): GenerateTextProviderOptions {
	if (!config || config.provider === "openai" || config.provider === "openai-compatible") {
		return { openai: { strictJsonSchema: true } };
	}
	if (config.provider === "google") {
		return { google: { structuredOutputs: true } };
	}
	return undefined;
}

export function buildStructuredGenerateTextRequest<TSchema extends ZodType>({
	baseRequest,
	config,
	outputName,
	outputDescription,
	schema,
	preferPlainJson,
}: {
	baseRequest: GenerateTextRequest;
	config?: LLMProviderConfig;
	outputName: string;
	outputDescription: string;
	schema: TSchema;
	preferPlainJson?: boolean;
}): {
	mode: StructuredGenerationMode;
	request: GenerateTextRequest;
} {
	const mode = resolveStructuredGenerationMode({ config, preferPlainJson });
	if (mode === "plain-json") {
		return { mode, request: baseRequest };
	}
	return {
		mode,
		request: {
			...baseRequest,
			output: Output.object({
				name: outputName,
				description: outputDescription,
				schema,
			}),
			providerOptions: buildStructuredProviderOptions({ config }),
		},
	};
}

export function isStructuredOutputSchemaError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const lower = message.toLowerCase();
	if (lower.includes("response_format") && lower.includes("schema")) {
		return true;
	}
	if (lower.includes("generation_config.response_schema")) {
		return true;
	}
	if (
		lower.includes("invalid json payload") &&
		lower.includes("unknown name") &&
		lower.includes("response_schema")
	) {
		return true;
	}
	return (
		lower.includes("exclusiveminimum") ||
		lower.includes("additionalproperties")
	);
}

export function isStructuredOutputValueError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	const lower = message.toLowerCase();
	return (
		lower.includes("no object generated") &&
		(lower.includes("response did not match schema") ||
			lower.includes("could not parse") ||
			lower.includes("invalid json"))
	);
}
