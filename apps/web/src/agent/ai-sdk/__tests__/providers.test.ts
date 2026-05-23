import { afterEach, describe, expect, test } from "bun:test";
import {
	getDefaultModel,
	getASRModel,
	getVisionModel,
} from "@/agent/ai-sdk/providers";

const originalEnv = { ...process.env };

afterEach(() => {
	process.env = { ...originalEnv };
});

describe("ai-sdk providers", () => {
	test("getDefaultModel returns a model", () => {
		process.env.AGENT_LLM_KEY = "test-key";
		const model = getDefaultModel();
		expect(model).toBeDefined();
	});

	test("getASRModel returns a model", () => {
		process.env.AGENT_LLM_KEY = "test-key";
		const model = getASRModel();
		expect(model).toBeDefined();
	});

	test("getVisionModel returns a model", () => {
		process.env.AGENT_LLM_KEY = "test-key";
		const model = getVisionModel();
		expect(model).toBeDefined();
	});
});
