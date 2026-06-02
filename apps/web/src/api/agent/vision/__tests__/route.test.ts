import { afterEach, describe, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";
import { POST } from "../analyze/route";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
	process.env = { ...originalEnv };
	globalThis.fetch = originalFetch;
});

function getHeaderValue({
	headers,
	key,
}: {
	headers: RequestInit["headers"];
	key: string;
}): string | null {
	if (!headers) return null;
	if (headers instanceof Headers) return headers.get(key);
	if (Array.isArray(headers)) {
		return headers.find(([name]) => name === key)?.[1] ?? null;
	}
	return headers[key] ?? null;
}

function expectMiniMaxVideoUpload({
	init,
	fileName = "demo.mp4",
	mimeType = "video/mp4",
}: {
	init: RequestInit | undefined;
	fileName?: string;
	mimeType?: string;
}) {
	expect(init?.headers).toMatchObject({
		Authorization: "Bearer minimax-key",
	});
	expect(
		getHeaderValue({ headers: init?.headers, key: "Content-Type" }),
	).toBeNull();
	expect(init?.body).toBeInstanceOf(FormData);
	if (!(init?.body instanceof FormData)) {
		throw new Error("Expected MiniMax upload body to be FormData");
	}
	const formData = init.body;
	expect(formData.get("purpose")).toBe("video_understanding");
	const file = formData.get("file");
	expect(file).toBeInstanceOf(File);
	if (!(file instanceof File)) {
		throw new Error("Expected MiniMax upload file to be a File");
	}
	expect(file.name).toBe(fileName);
	expect(file.type).toBe(mimeType);
}

function miniMaxUploadResponse({
	fileId = "file-1",
}: { fileId?: string } = {}) {
	return Response.json({
		file: {
			file_id: fileId,
			bytes: 4,
			filename: "demo.mp4",
			purpose: "video_understanding",
		},
		base_resp: { status_code: 0, status_msg: "success" },
	});
}

describe("vision analysis route", () => {
	test("uploads video files to MiniMax before sending video content parts to M3", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const calls: string[] = [];
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				calls.push(String(input));
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "file-1" });
				}
				expect(String(input)).toBe(
					"https://api.minimaxi.com/v1/chat/completions",
				);
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
										url: "mm_file://file-1",
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
			},
		);
		globalThis.fetch = fetchFn;

		const formData = new FormData();
		formData.set(
			"payload",
			JSON.stringify({
				analysisType: "editing_suggestions",
				prompt: "给出剪辑建议",
				media: {
					mediaAssetId: "media-1",
					name: "demo.mp4",
					type: "video",
					mimeType: "video/mp4",
					durationSeconds: 12,
					width: 1920,
					height: 1080,
				},
			}),
		);
		formData.set("file", new File(["demo"], "demo.mp4", { type: "video/mp4" }));

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: formData,
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
		expect(calls).toEqual([
			"https://api.minimaxi.com/v1/files/upload",
			"https://api.minimaxi.com/v1/chat/completions",
		]);
	});

	test("streams MiniMax M3 reasoning and content chunks when requested", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const upstream = [
			'data: {"choices":[{"delta":{"reasoning_details":[{"text":"先看主体"}]}}]}',
			'data: {"choices":[{"delta":{"content":"建议保留开场"}}]}',
			"data: [DONE]",
		].join("\n\n");
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "stream-file" });
				}
				const body = JSON.parse(String(init?.body));
				expect(body).toMatchObject({
					model: "MiniMax-M3",
					stream: true,
					stream_options: { include_usage: true },
				});
				expect(body.messages[1].content[1]).toMatchObject({
					type: "video_url",
					video_url: { url: "mm_file://stream-file" },
				});
				return new Response(upstream, {
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "editing_suggestions",
					stream: true,
					media: {
						mediaAssetId: "media-1",
						name: "demo.mp4",
						type: "video",
						mimeType: "video/mp4",
						dataUrl: "data:video/mp4;base64,AA==",
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/event-stream");
		expect(await response.text()).toBe(
			[
				'data: {"type":"reasoning_delta","text":"先看主体"}',
				'data: {"type":"content_delta","text":"建议保留开场"}',
				`data: {"type":"done","provider":"minimax","model":"MiniMax-M3","analysisType":"editing_suggestions","analysis":"建议保留开场","media":{"mediaAssetId":"media-1","name":"demo.mp4","type":"video"}}`,
				"data: [DONE]",
			].join("\n\n") + "\n\n",
		);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test("normalizes octet-stream video data URLs before sending to MiniMax", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init, mimeType: "video/mp4" });
					return miniMaxUploadResponse({ fileId: "normalized-file" });
				}
				const body = JSON.parse(String(init?.body));
				expect(body.messages[1].content[1]).toMatchObject({
					type: "video_url",
					video_url: {
						url: "mm_file://normalized-file",
					},
				});
				return Response.json({
					choices: [
						{
							message: {
								content: "视频 MIME 已被规范化。",
							},
						},
					],
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "editing_suggestions",
					media: {
						mediaAssetId: "media-1",
						name: "demo.mp4",
						type: "video",
						mimeType: "application/octet-stream",
						dataUrl: "data:application/octet-stream;base64,AA==",
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test("caps video frame long side and disables thinking for stable MiniMax video analysis", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "capped-file" });
				}
				const body = JSON.parse(String(init?.body));
				expect(body).toMatchObject({
					thinking: { type: "disabled" },
					messages: [
						{ role: "system" },
						{
							role: "user",
							content: [
								{ type: "text" },
								{
									type: "video_url",
									video_url: {
										url: "mm_file://capped-file",
										max_long_side_pixel: 672,
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
								content: "视频分析内容已稳定返回。",
							},
						},
					],
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "visual_summary",
					maxLongSidePixel: 1024,
					media: {
						mediaAssetId: "media-1",
						name: "demo.mp4",
						type: "video",
						mimeType: "video/mp4",
						dataUrl: "data:video/mp4;base64,AA==",
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(fetchFn).toHaveBeenCalledTimes(2);
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
