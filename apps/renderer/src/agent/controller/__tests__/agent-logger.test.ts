import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveAgentLogDirectory } from "../agent-logger";

describe("AgentLogger desktop paths", () => {
	test("stores packaged desktop logs beside the desktop configuration", () => {
		expect(
			resolveAgentLogDirectory({
				env: {
					SHOTLYX_DESKTOP: "1",
					SHOTLYX_DESKTOP_CONFIG_PATH:
						"/Users/test/Library/Application Support/Shotlyx Desktop/desktop-api-config.json",
				},
				cwd: "/",
			}),
		).toBe(
			"/Users/test/Library/Application Support/Shotlyx Desktop/logs/agent",
		);
	});

	test("keeps development logs inside the working tree", () => {
		expect(
			resolveAgentLogDirectory({ env: {}, cwd: "/workspace/shotlyx" }),
		).toBe(path.join("/workspace/shotlyx", "agent-dev", "logs"));
	});
});
