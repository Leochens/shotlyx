import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	desktopValuesToEnv,
	getDesktopConfigStatus,
	hasRequiredDesktopConfig,
	mergeDesktopApiConfig,
	readDesktopApiConfig,
	writeDesktopApiConfig,
} from "@/desktop/config/server";

const originalEnv = { ...process.env };
let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-cli-config-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop config can select local CLI runtime without requiring an API key", () => {
	writeDesktopApiConfig({
		AGENT_RUNTIME: "local-cli",
		AGENT_CLI_ID: "claude",
		AGENT_CLI_MODEL: "sonnet",
		AGENT_LLM_KEY: "should-not-be-required",
	});

	const values = readDesktopApiConfig().values;
	expect(desktopValuesToEnv(values)).toMatchObject({
		AGENT_RUNTIME: "local-cli",
		AGENT_CLI_ID: "claude",
		AGENT_CLI_MODEL: "sonnet",
	});

	writeDesktopApiConfig({
		AGENT_RUNTIME: "local-cli",
		AGENT_CLI_ID: "codex",
	});

	const status = getDesktopConfigStatus(readDesktopApiConfig().values);
	expect(hasRequiredDesktopConfig(readDesktopApiConfig().values)).toBe(true);
	expect(status.find((group) => group.id === "agent-runtime")).toMatchObject({
		configured: true,
		required: true,
	});
	expect(status.find((group) => group.id === "agent-llm")).toMatchObject({
		configured: false,
		required: false,
	});
});

test("desktop config preserves API keys when switching to and from local CLI", () => {
	writeDesktopApiConfig({
		AGENT_LLM_PROVIDER: "openai",
		AGENT_LLM_KEY: "api-key",
		AGENT_LLM_MODEL: "gpt-4o-mini",
	});

	mergeDesktopApiConfig({
		values: {
			AGENT_RUNTIME: "local-cli",
			AGENT_CLI_ID: "claude",
			AGENT_CLI_MODEL: "sonnet",
		},
	});

	expect(readDesktopApiConfig().values).toMatchObject({
		AGENT_LLM_KEY: "api-key",
		AGENT_LLM_MODEL: "gpt-4o-mini",
		AGENT_RUNTIME: "local-cli",
		AGENT_CLI_ID: "claude",
	});

	mergeDesktopApiConfig({
		values: {
			AGENT_RUNTIME: "api",
		},
	});

	const values = readDesktopApiConfig().values;
	expect(values).toMatchObject({
		AGENT_LLM_KEY: "api-key",
		AGENT_CLI_ID: "claude",
		AGENT_RUNTIME: "api",
	});
	expect(desktopValuesToEnv(values)).toMatchObject({
		AGENT_LLM_KEY: "api-key",
		AGENT_CLI_ID: "claude",
		AGENT_RUNTIME: "api",
	});
	expect(getDesktopConfigStatus(values)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: "agent-llm",
				configured: true,
				required: true,
			}),
			expect.objectContaining({
				id: "agent-runtime",
				configured: true,
				required: true,
			}),
		]),
	);
	expect(hasRequiredDesktopConfig(values)).toBe(true);
});

test("desktop launch gate stays on setup until API mode has its required key", () => {
	expect(hasRequiredDesktopConfig({})).toBe(false);
	expect(
		hasRequiredDesktopConfig({
			AGENT_RUNTIME: "api",
			AGENT_LLM_KEY: "api-key",
		}),
	).toBe(true);
});
