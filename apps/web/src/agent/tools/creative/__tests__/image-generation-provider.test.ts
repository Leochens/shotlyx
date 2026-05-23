import { afterEach, describe, expect, mock, test } from "bun:test";
import { generateImageWithOpenAICompatibleProvider } from "@/agent/tools/creative/image-generation-provider";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
	mock.restore();
});

describe("generateImageWithOpenAICompatibleProvider", () => {
	test("throws configuration_error when API key is missing", async () => {
		process.env.IMAGE_GENERATION_BASE_URL = "https://image.example.com/v1";
		delete process.env.IMAGE_GENERATION_API_KEY;
		process.env.IMAGE_GENERATION_MODEL = "test-image-model";

		await expect(
			generateImageWithOpenAICompatibleProvider({
				prompt: "AI video editor",
				size: "1024x1024",
				count: 1,
			}),
		).rejects.toThrow("configuration_error");
	});

	test("calls OpenAI-compatible image generation endpoint", async () => {
		process.env.IMAGE_GENERATION_BASE_URL = "https://image.example.com/v1";
		process.env.IMAGE_GENERATION_API_KEY = "test-key";
		process.env.IMAGE_GENERATION_MODEL = "test-image-model";

		const fetchMock = mock(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response(
					JSON.stringify({
						data: [{ url: "https://cdn.example.com/generated.png" }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);
		globalThis.fetch = fetchMock;

		const result = await generateImageWithOpenAICompatibleProvider({
			prompt: "AI video editor",
			size: "1024x1024",
			count: 1,
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe("https://image.example.com/v1/images/generations");
		expect(init?.headers).toEqual({
			Authorization: "Bearer test-key",
			"Content-Type": "application/json",
		});
		if (typeof init?.body !== "string") {
			throw new Error("Expected image generation request body to be a string");
		}
		expect(JSON.parse(init.body)).toEqual({
			model: "test-image-model",
			prompt: "AI video editor",
			size: "1024x1024",
			n: 1,
		});
		expect(result.images[0]?.url).toBe("https://cdn.example.com/generated.png");
	});

	test("throws provider_error when fetch rejects", async () => {
		process.env.IMAGE_GENERATION_BASE_URL = "https://image.example.com/v1";
		process.env.IMAGE_GENERATION_API_KEY = "test-key";
		process.env.IMAGE_GENERATION_MODEL = "test-image-model";

		const fetchMock = mock(
			async (_input: RequestInfo | URL, _init?: RequestInit) => {
				throw new Error("fetch failed");
			},
		);
		globalThis.fetch = fetchMock;

		await expect(
			generateImageWithOpenAICompatibleProvider({
				prompt: "AI video editor",
				size: "1024x1024",
				count: 1,
			}),
		).rejects.toThrow("provider_error");
	});

	test("throws provider_error when provider returns non-JSON", async () => {
		process.env.IMAGE_GENERATION_BASE_URL = "https://image.example.com/v1";
		process.env.IMAGE_GENERATION_API_KEY = "test-key";
		process.env.IMAGE_GENERATION_MODEL = "test-image-model";

		const fetchMock = mock(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response("not-json", {
					status: 200,
					headers: { "Content-Type": "text/plain" },
				}),
		);
		globalThis.fetch = fetchMock;

		await expect(
			generateImageWithOpenAICompatibleProvider({
				prompt: "AI video editor",
				size: "1024x1024",
				count: 1,
			}),
		).rejects.toThrow("provider_error");
	});
});
