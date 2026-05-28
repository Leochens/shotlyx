import { describe, expect, test } from "bun:test";
import {
	isStructuredOutputSchemaError,
	isStructuredOutputValueError,
	resolveStructuredGenerationMode,
} from "@/agent/ai-sdk/request-builder";
import type { LLMProviderConfig } from "@/agent/llm/types";

function config(provider: LLMProviderConfig["provider"]): LLMProviderConfig {
	return {
		name: "mg",
		provider,
		host: "https://example.com",
		apiKey: "key",
		model: "model",
	};
}

describe("AI request builder", () => {
	test("uses plain JSON for Google structured generation by default", () => {
		expect(
			resolveStructuredGenerationMode({ config: config("google") }),
		).toBe("plain-json");
	});

	test("uses plain JSON for OpenAI-compatible providers by default", () => {
		expect(
			resolveStructuredGenerationMode({
				config: config("openai-compatible"),
			}),
		).toBe("plain-json");
	});

	test("allows native structured output when explicitly requested", () => {
		expect(
			resolveStructuredGenerationMode({
				config: {
					...config("openai-compatible"),
					structuredOutputMode: "native",
				},
			}),
		).toBe("native");
	});

	test("detects Gemini response schema incompatibility errors", () => {
		expect(
			isStructuredOutputSchemaError(
				new Error(
					`Invalid JSON payload received. Unknown name "exclusiveMinimum" at 'generation_config.response_schema.properties[2].value.any_of[0]': Cannot find field.`,
				),
			),
		).toBe(true);
		expect(
			isStructuredOutputSchemaError(
				new Error(
					`Invalid JSON payload received. Unknown name "additionalProperties" at 'generation_config.response_schema.properties[6].value.items': Cannot find field.`,
				),
			),
		).toBe(true);
	});

	test("detects AI SDK structured output value errors", () => {
		expect(
			isStructuredOutputValueError(
				new Error("No object generated: response did not match schema."),
			),
		).toBe(true);
		expect(
			isStructuredOutputValueError(
				new Error("No object generated: could not parse the response."),
			),
		).toBe(true);
	});
});
