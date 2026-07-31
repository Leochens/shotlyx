import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeDesktopApiConfig } from "@/desktop/config/server";
import { installTestSafeStorage } from "@/desktop/__tests__/safe-storage-test-helper";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let tempDir = "";
let fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
let restoreSafeStorage = () => {};

function mockFetchJson(data: unknown) {
	globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
		const [input, init] = args;
		fetchCalls.push({ input, init });
		return Promise.resolve(
			new Response(JSON.stringify(data), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as typeof fetch;
}

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-models-"));
	fetchCalls = [];
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
	restoreSafeStorage = installTestSafeStorage({ directory: tempDir });
	globalThis.fetch = originalFetch;
});

afterEach(() => {
	restoreSafeStorage();
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop models route lists OpenAI-compatible model ids", async () => {
	mockFetchJson({
		data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
	});

	const { POST } = await import("../route");
	const response = await POST(
		new Request("http://localhost/api/desktop/models", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "openai-compatible",
				baseUrl: "https://api.deepseek.com",
				apiKey: "deepseek-key",
			}),
		}),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		models: ["deepseek-chat", "deepseek-reasoner"],
	});
	expect(String(fetchCalls[0]?.input)).toBe("https://api.deepseek.com/models");
	expect(fetchCalls[0]?.init?.headers).toMatchObject({
		Authorization: "Bearer deepseek-key",
	});
});

test("desktop models route lists Google models and strips models prefix", async () => {
	mockFetchJson({
		models: [
			{ name: "models/gemini-2.5-flash" },
			{ name: "models/gemini-2.5-pro" },
		],
	});

	const { POST } = await import("../route");
	const response = await POST(
		new Request("http://localhost/api/desktop/models", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "google",
				baseUrl: "https://generativelanguage.googleapis.com/v1beta",
				apiKey: "google-key",
			}),
		}),
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		models: ["gemini-2.5-flash", "gemini-2.5-pro"],
	});
	expect(String(fetchCalls[0]?.input)).toBe(
		"https://generativelanguage.googleapis.com/v1beta/models?key=google-key",
	);
});

test("desktop models route can reuse a saved secret for the selected config key", async () => {
	writeDesktopApiConfig({
		IMAGE_GENERATION_API_KEY: "saved-image-key",
	});
	mockFetchJson({
		data: [{ id: "gpt-image-1" }],
	});

	const { POST } = await import("../route");
	const response = await POST(
		new Request("http://localhost/api/desktop/models", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				provider: "openai",
				baseUrl: "https://api.openai.com/v1",
				apiKeyConfigKey: "IMAGE_GENERATION_API_KEY",
			}),
		}),
	);

	expect(response.status).toBe(200);
	expect(fetchCalls[0]?.init?.headers).toMatchObject({
		Authorization: "Bearer saved-image-key",
	});
});
