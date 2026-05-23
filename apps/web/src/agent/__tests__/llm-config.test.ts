import { afterEach, describe, expect, test } from "bun:test";
import { loadLLMConfigFromEnv } from "@/agent/llm/config";

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("loadLLMConfigFromEnv", () => {
	test("MG config falls back to the default Agent LLM config", () => {
		process.env.AGENT_LLM_HOST = "https://llm.example.com/v1";
		process.env.AGENT_LLM_KEY = "agent-key";
		process.env.AGENT_LLM_MODEL = "agent-model";
		delete process.env.AGENT_MG_HOST;
		delete process.env.AGENT_MG_KEY;
		delete process.env.AGENT_MG_MODEL;
		delete process.env.AGENT_LLM_PROVIDER;
		delete process.env.AGENT_MG_PROVIDER;
		delete process.env.AGENT_LLM_STRUCTURED_OUTPUT_MODE;
		delete process.env.AGENT_MG_STRUCTURED_OUTPUT_MODE;

		const config = loadLLMConfigFromEnv();

		expect(config.mg).toEqual({
			name: "mg",
			provider: "openai-compatible",
			host: "https://llm.example.com/v1",
			apiKey: "agent-key",
			model: "agent-model",
			structuredOutputMode: undefined,
		});
	});

	test("MG config can use a dedicated provider", () => {
		process.env.AGENT_LLM_HOST = "https://llm.example.com/v1";
		process.env.AGENT_LLM_KEY = "agent-key";
		process.env.AGENT_LLM_MODEL = "agent-model";
		process.env.AGENT_MG_HOST = "https://mg.example.com/v1";
		process.env.AGENT_MG_KEY = "mg-key";
		process.env.AGENT_MG_MODEL = "mg-model";
		delete process.env.AGENT_LLM_PROVIDER;
		delete process.env.AGENT_MG_PROVIDER;
		delete process.env.AGENT_LLM_STRUCTURED_OUTPUT_MODE;
		delete process.env.AGENT_MG_STRUCTURED_OUTPUT_MODE;

		const config = loadLLMConfigFromEnv();

		expect(config.mg).toEqual({
			name: "mg",
			provider: "openai-compatible",
			host: "https://mg.example.com/v1",
			apiKey: "mg-key",
			model: "mg-model",
			structuredOutputMode: undefined,
		});
	});

	test("MG config can target Gemini with provider-specific structured output mode", () => {
		process.env.AGENT_MG_PROVIDER = "gemini";
		process.env.AGENT_MG_KEY = "google-key";
		process.env.AGENT_MG_MODEL = "gemini-2.5-flash";
		process.env.AGENT_MG_STRUCTURED_OUTPUT_MODE = "plain-json";
		delete process.env.AGENT_MG_HOST;

		const config = loadLLMConfigFromEnv();

		expect(config.mg).toEqual({
			name: "mg",
			provider: "google",
			host: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "google-key",
			model: "gemini-2.5-flash",
			structuredOutputMode: "plain-json",
		});
	});
});
