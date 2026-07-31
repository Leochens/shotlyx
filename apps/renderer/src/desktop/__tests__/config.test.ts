import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { installTestSafeStorage } from "./safe-storage-test-helper";

const originalEnv = { ...process.env };
let tempDir = "";
let restoreSafeStorage = () => {};

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-config-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
	restoreSafeStorage = installTestSafeStorage({ directory: tempDir });
});

afterEach(() => {
	restoreSafeStorage();
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
	const publicConfig = readFileSync(
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH!,
		"utf8",
	);
	const encryptedSecrets = readFileSync(
		process.env.SHOTLYX_DESKTOP_SECRETS_PATH!,
		"utf8",
	);
	expect(publicConfig).not.toContain("key");
	expect(encryptedSecrets).not.toContain('"key"');
});

test("desktop config migrates legacy plaintext secrets into safe storage", () => {
	writeFileSync(
		process.env.SHOTLYX_DESKTOP_CONFIG_PATH!,
		JSON.stringify({
			version: 1,
			values: {
				AGENT_LLM_KEY: "legacy-secret",
				AGENT_LLM_MODEL: "gpt-4o-mini",
			},
			updatedAt: "2026-07-31T00:00:00.000Z",
		}),
	);

	expect(readDesktopApiConfig().values.AGENT_LLM_KEY).toBe("legacy-secret");
	expect(
		readFileSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH!, "utf8"),
	).not.toContain("legacy-secret");
	expect(
		readFileSync(process.env.SHOTLYX_DESKTOP_SECRETS_PATH!, "utf8"),
	).not.toContain("legacy-secret");
});

test("desktop config never falls back to plaintext when encryption is unavailable", () => {
	const bridge = globalThis.__SHOTLYX_SAFE_STORAGE__;
	globalThis.__SHOTLYX_SAFE_STORAGE__ = {
		isEncryptionAvailable: () => false,
		encryptString: () => {
			throw new Error("unavailable");
		},
		decryptString: () => {
			throw new Error("unavailable");
		},
	};
	try {
		expect(() =>
			writeDesktopApiConfig({ AGENT_LLM_KEY: "must-not-leak" }),
		).toThrow("desktop_safe_storage_unavailable");
		expect(() =>
			readFileSync(process.env.SHOTLYX_DESKTOP_CONFIG_PATH!, "utf8"),
		).toThrow();
	} finally {
		globalThis.__SHOTLYX_SAFE_STORAGE__ = bridge;
	}
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
		AGENT_VISION_PROVIDER: "openai-compatible",
		AGENT_VISION_HOST: "https://api.moonshot.cn/v1",
		AGENT_VISION_MODEL: "kimi-k2.6",
	});
	expect(getRuntimeEnv().AGENT_LLM_KEY).toBe("agent-key");
});

test("desktop config stores and masks the dedicated Vision API key", () => {
	const config = writeDesktopApiConfig({
		AGENT_VISION_KEY: "moonshot-key",
		AGENT_VISION_MODEL: "kimi-k2.6",
	});

	expect(readDesktopApiConfig().values).toMatchObject({
		AGENT_VISION_KEY: "moonshot-key",
		AGENT_VISION_MODEL: "kimi-k2.6",
	});
	expect(getPublicDesktopApiValues(config.values)).toMatchObject({
		AGENT_VISION_KEY: "",
		AGENT_VISION_MODEL: "kimi-k2.6",
	});
	expect(
		getDesktopConfigStatus(config.values).find(
			(group) => group.id === "visual-understanding",
		),
	).toMatchObject({
		configured: true,
		required: false,
	});
});

test("desktop config normalizes Token Plan vision keys away from the legacy host", () => {
	writeDesktopApiConfig({
		AGENT_VISION_KEY: "sk-cp-subscription-key",
		AGENT_VISION_HOST: "https://api.minimax.io/v1",
	});

	expect(readDesktopApiConfig().values).toMatchObject({
		AGENT_VISION_KEY: "sk-cp-subscription-key",
		AGENT_VISION_HOST: "https://api.minimaxi.com/v1",
	});
	expect(desktopValuesToEnv(readDesktopApiConfig().values)).toMatchObject({
		AGENT_VISION_HOST: "https://api.minimaxi.com/v1",
	});
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
