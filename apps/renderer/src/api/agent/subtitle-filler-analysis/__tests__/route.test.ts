import { afterEach, describe, expect, mock, test } from "bun:test";

const generateObject = mock(async () => {
	throw new Error("generateObject should not be used for plain-json providers");
});

const generateText = mock(async () => ({
	text: JSON.stringify({
		cutIds: ["candidate-filler", "missing-id"],
		decisions: [
			{
				id: "candidate-filler",
				shouldCut: true,
				reason: "standalone filler",
			},
			{
				id: "candidate-meaningful",
				shouldCut: false,
				reason: "meaningful phrase",
			},
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

describe("subtitle filler analysis route", () => {
	afterEach(() => {
		generateObject.mockClear();
		generateText.mockClear();
	});

	test("asks the model to decide cut ids and filters unknown ids", async () => {
		const { POST } = await import("../route");

		const response = await POST(
			new Request("http://localhost/api/agent/subtitle-filler-analysis", {
				body: JSON.stringify({
					candidates: [
						{
							id: "candidate-filler",
							text: "嗯",
							cueText: "嗯大家好",
							contextAfter: "大家好",
							startTimeSeconds: 0,
							endTimeSeconds: 0.4,
						},
						{
							id: "candidate-meaningful",
							text: "好啊",
							cueText: "好啊继续",
							contextAfter: "继续",
							startTimeSeconds: 2,
							endTimeSeconds: 2.8,
						},
					],
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			provider: "agent-llm",
			cutIds: ["candidate-filler"],
			decisions: [
				{
					id: "candidate-filler",
					shouldCut: true,
					reason: "standalone filler",
				},
				{
					id: "candidate-meaningful",
					shouldCut: false,
					reason: "meaningful phrase",
				},
			],
		});
		expect(generateObject).not.toHaveBeenCalled();
		expect(generateText).toHaveBeenCalledTimes(1);
		expect(generateText.mock.calls[0]?.[0]).toMatchObject({
			model: "mock-model",
			system: expect.stringContaining("Decide which candidate tokens"),
		});
	});
});
