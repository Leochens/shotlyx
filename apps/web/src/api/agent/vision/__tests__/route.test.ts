import { afterEach, describe, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";
import { POST } from "../analyze/route";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
});

describe("vision analysis route", () => {
	test("sends video content parts to MiniMax M3", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://api.minimax.io/v1/chat/completions");
			expect(init?.headers).toMatchObject({
				Authorization: "Bearer minimax-key",
				"Content-Type": "application/json",
			});
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({
				model: "MiniMax-M3",
				reasoning_split: true,
				messages: [
					{ role: "system" },
					{
						role: "user",
						content: [
							{ type: "text" },
							{
								type: "video_url",
								video_url: {
									url: "data:video/mp4;base64,AA==",
									detail: "default",
									fps: 1,
								},
							},
						],
					},
				],
			});
			return Response.json({
				choices: [
					{
						message: {
							content: "这个视频节奏偏慢，建议删除重复动作。",
						},
					},
				],
				usage: { prompt_tokens: 12, completion_tokens: 8 },
			});
		});
		globalThis.fetch = fetchFn as unknown as typeof fetch;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "editing_suggestions",
					prompt: "给出剪辑建议",
					media: {
						mediaAssetId: "media-1",
						name: "demo.mp4",
						type: "video",
						mimeType: "video/mp4",
						dataUrl: "data:video/mp4;base64,AA==",
						durationSeconds: 12,
						width: 1920,
						height: 1080,
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			model: "MiniMax-M3",
			analysis: "这个视频节奏偏慢，建议删除重复动作。",
			media: {
				mediaAssetId: "media-1",
				type: "video",
			},
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("requires a dedicated Vision API key", async () => {
		delete process.env.AGENT_VISION_KEY;
		delete process.env.AGENT_LLM_KEY;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					media: {
						name: "demo.mp4",
						type: "video",
						mimeType: "video/mp4",
						dataUrl: "data:video/mp4;base64,AA==",
					},
				}),
			}),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({
			error: "configuration_error: missing AGENT_VISION_KEY",
		});
	});
});
