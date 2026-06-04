import { afterEach, describe, expect, mock, test } from "bun:test";

const generateObject = mock(async () => {
	throw new Error("generateObject should not be used for plain-json providers");
});

const generateText = mock(async () => ({
	text: JSON.stringify({
		translations: [
			{ index: 0, text: "Hello Shotlyx" },
			{ index: 1, text: "Subtitle translation" },
		],
	}),
}));

mock.module("ai", () => ({
	generateObject,
	generateText,
	Output: {
		object: mock(() => ({ type: "object" })),
	},
}));

mock.module("@/agent/ai-sdk/providers", () => ({
	getDefaultModelBundle: () => ({
		config: {
			apiKey: "test-key",
			host: "https://api.example.test/v1",
			model: "compatible-model",
			name: "default",
			provider: "openai-compatible",
		},
		model: "mock-model",
	}),
}));

describe("subtitle translation route", () => {
	afterEach(() => {
		generateObject.mockClear();
		generateText.mockClear();
	});

	test("uses plain JSON generation for OpenAI-compatible providers", async () => {
		const { POST } = await import("../route");

		const response = await POST(
			new Request("http://localhost/api/agent/subtitle-translation", {
				body: JSON.stringify({
					targetLanguage: "en",
					sourceLanguage: "zh",
					cues: [
						{ index: 0, text: "你好 Shotlyx", startTime: 0, duration: 2 },
						{ index: 1, text: "字幕翻译", startTime: 2, duration: 1.5 },
					],
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			provider: "agent-llm",
			targetLanguage: "en",
			translations: [
				{ index: 0, text: "Hello Shotlyx" },
				{ index: 1, text: "Subtitle translation" },
			],
		});
		expect(generateObject).not.toHaveBeenCalled();
		expect(generateText).toHaveBeenCalledTimes(1);
		expect(generateText.mock.calls[0]?.[0]).toMatchObject({
			model: "mock-model",
			system: expect.stringContaining("translate subtitle cues"),
		});
	});
});
