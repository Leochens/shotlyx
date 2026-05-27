import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	applyDesktopConfigToProcessEnv,
	desktopValuesToEnv,
	getDesktopConfigStatus,
	getPublicDesktopApiValues,
	getRuntimeEnv,
	mergeDesktopApiConfig,
	readDesktopApiConfig,
	writeDesktopApiConfig,
} from "../config/server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-config-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	if (tempDir) {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("desktop config stores only known non-empty API fields", () => {
	writeDesktopApiConfig({
		AGENT_LLM_KEY: " key ",
		AGENT_LLM_MODEL: " gpt-4o ",
		UNKNOWN_FIELD: "ignored",
		TAVILY_API_KEY: "",
	});

	expect(readDesktopApiConfig().values).toEqual({
		AGENT_LLM_KEY: "key",
		AGENT_LLM_MODEL: "gpt-4o",
	});
});

test("public config masks secret values", () => {
	const config = writeDesktopApiConfig({
		AGENT_LLM_KEY: "secret",
		AGENT_LLM_MODEL: "gpt-4o",
	});

	expect(getPublicDesktopApiValues(config.values)).toMatchObject({
		AGENT_LLM_KEY: "",
		AGENT_LLM_MODEL: "gpt-4o",
	});
});

test("desktop config applies provider defaults and runtime env overrides", () => {
	writeDesktopApiConfig({
		AGENT_LLM_KEY: "agent-key",
	});

	expect(desktopValuesToEnv(readDesktopApiConfig().values)).toMatchObject({
		AGENT_LLM_KEY: "agent-key",
		AGENT_LLM_PROVIDER: "openai",
		AGENT_LLM_MODEL: "gpt-4o",
		IMAGE_GENERATION_BASE_URL: "https://api.openai.com/v1",
	});
	expect(getRuntimeEnv().AGENT_LLM_KEY).toBe("agent-key");
});

test("mergeDesktopApiConfig supports replacing and clearing values", () => {
	writeDesktopApiConfig({
		AGENT_LLM_KEY: "old",
		TAVILY_API_KEY: "tavily",
	});

	const config = mergeDesktopApiConfig({
		values: { AGENT_LLM_KEY: "new" },
		clear: ["TAVILY_API_KEY"],
	});

	expect(config.values).toEqual({
		AGENT_LLM_KEY: "new",
	});
});

test("desktop status requires the Agent LLM key", () => {
	expect(
		getDesktopConfigStatus({}).find((group) => group.id === "agent-llm"),
	).toMatchObject({
		configured: false,
		required: true,
	});

	expect(
		getDesktopConfigStatus({ AGENT_LLM_KEY: "key" }).find(
			(group) => group.id === "agent-llm",
		),
	).toMatchObject({
		configured: true,
		required: true,
	});
});

test("applyDesktopConfigToProcessEnv updates provider env in the server process", () => {
	writeDesktopApiConfig({
		AGENT_LLM_KEY: "agent-key",
		VOICEOVER_PROVIDER: "edge-tts",
	});

	applyDesktopConfigToProcessEnv();

	expect(process.env.AGENT_LLM_KEY).toBe("agent-key");
	expect(process.env.VOICEOVER_PROVIDER).toBe("edge-tts");
});
