/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Route tests pass standard Request objects into a ApiRequest-typed handler. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeDesktopApiConfig } from "@/desktop/config/server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-reveal-"));
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

test("desktop config reveal returns one saved secret on demand", async () => {
	writeDesktopApiConfig({
		AGENT_LLM_KEY: "agent-secret",
		AGENT_LLM_MODEL: "gpt-4o-mini",
	});

	const { POST } = await import("../reveal/route");
	const response = await POST(
		new Request("http://localhost/api/desktop/config/reveal", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key: "AGENT_LLM_KEY" }),
		}) as Parameters<typeof POST>[0],
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		desktop: true,
		key: "AGENT_LLM_KEY",
		configured: true,
		value: "agent-secret",
	});
});

test("desktop config reveal rejects non-secret fields", async () => {
	writeDesktopApiConfig({
		AGENT_LLM_MODEL: "gpt-4o-mini",
	});

	const { POST } = await import("../reveal/route");
	const response = await POST(
		new Request("http://localhost/api/desktop/config/reveal", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key: "AGENT_LLM_MODEL" }),
		}) as Parameters<typeof POST>[0],
	);

	expect(response.status).toBe(400);
});
