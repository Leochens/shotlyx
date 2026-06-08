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
					thinking: { type: "adaptive" },
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
				expect(body).not.toHaveProperty("reasoning_split");
				expect(body).not.toHaveProperty("stream");
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

	test("accepts binary video bodies with payload query instead of parsing JSON", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({
						init,
						fileName: "binary-demo.mp4",
						mimeType: "video/mp4",
					});
					return miniMaxUploadResponse({ fileId: "binary-file" });
				}
				const body = JSON.parse(String(init?.body));
				expect(body.messages[1].content[1]).toMatchObject({
					type: "video_url",
					video_url: { url: "mm_file://binary-file" },
				});
				return Response.json({
					choices: [{ message: { content: "二进制视频已分析。" } }],
				});
			},
		);
		globalThis.fetch = fetchFn;
		const payload = encodeURIComponent(
			JSON.stringify({
				analysisType: "visual_summary",
				prompt: "分析视频",
				media: {
					mediaAssetId: "media-1",
					name: "binary-demo.mp4",
					type: "video",
					mimeType: "video/mp4",
				},
			}),
		);

		const response = await POST(
			new ApiRequest(
				`http://localhost/api/agent/vision/analyze?payload=${payload}`,
				{
					method: "POST",
					headers: { "Content-Type": "video/mp4" },
					body: new Blob(["demo"], { type: "video/mp4" }),
				},
			),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			analysisType: "visual_summary",
			analysis: "二进制视频已分析。",
			media: {
				mediaAssetId: "media-1",
				name: "binary-demo.mp4",
				type: "video",
			},
		});
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test("rejects empty MiniMax video analysis content instead of returning a blank success", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init, fileName: "empty-demo.mp4" });
					return miniMaxUploadResponse({ fileId: "empty-file" });
				}
				return Response.json({
					choices: [{ message: { content: "   " } }],
				});
			},
		);
		globalThis.fetch = fetchFn;
		const payload = encodeURIComponent(
			JSON.stringify({
				analysisType: "visual_summary",
				prompt: "分析视频",
				media: {
					mediaAssetId: "media-1",
					name: "empty-demo.mp4",
					type: "video",
					mimeType: "video/mp4",
				},
			}),
		);

		const response = await POST(
			new ApiRequest(
				`http://localhost/api/agent/vision/analyze?payload=${payload}`,
				{
					method: "POST",
					headers: { "Content-Type": "video/mp4" },
					body: new Blob(["demo"], { type: "video/mp4" }),
				},
			),
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error:
				"provider_error: MiniMax response did not include analysis content",
		});
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	test("streams MiniMax M3 reasoning and content chunks for image requests", async () => {
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
				expect(String(input)).toBe(
					"https://api.minimaxi.com/v1/chat/completions",
				);
				const body = JSON.parse(String(init?.body));
				expect(body).toMatchObject({
					model: "MiniMax-M3",
					stream: true,
					stream_options: { include_usage: true },
				});
				expect(body.messages[1].content[1]).toMatchObject({
					type: "image_url",
					image_url: { url: "data:image/png;base64,AA==" },
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
						name: "demo.png",
						type: "image",
						mimeType: "image/png",
						dataUrl: "data:image/png;base64,AA==",
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
				`data: {"type":"done","provider":"minimax","model":"MiniMax-M3","analysisType":"editing_suggestions","analysis":"建议保留开场","media":{"mediaAssetId":"media-1","name":"demo.png","type":"image"}}`,
				"data: [DONE]",
			].join("\n\n") + "\n\n",
		);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	test("retries MiniMax image analysis without streaming when provider returns a 500", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const chatBodies: unknown[] = [];
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://api.minimaxi.com/v1/chat/completions",
				);
				const body = JSON.parse(String(init?.body));
				chatBodies.push(body);
				if (chatBodies.length === 1) {
					expect(body).toMatchObject({
						model: "MiniMax-M3",
						thinking: { type: "adaptive" },
						stream: true,
						reasoning_split: true,
						stream_options: { include_usage: true },
					});
					expect(body.messages[1].content[1]).toMatchObject({
						type: "image_url",
						image_url: { url: "data:image/png;base64,AA==" },
					});
					return Response.json(
						{
							type: "error",
							error: {
								type: "server_error",
								message: "unknown error, 500 (1000)",
								http_code: "500",
							},
							request_id: "06759bd12d3c181c1ffbd55827453bb6",
						},
						{ status: 500 },
					);
				}
				expect(body).toMatchObject({
					model: "MiniMax-M3",
					thinking: { type: "disabled" },
				});
				expect(body).not.toHaveProperty("stream");
				expect(body).not.toHaveProperty("reasoning_split");
				expect(body).not.toHaveProperty("stream_options");
				expect(body.messages[1].content[1]).toMatchObject({
					type: "image_url",
					image_url: { url: "data:image/png;base64,AA==" },
				});
				return Response.json({
					choices: [{ message: { content: "图片分析已稳定返回。" } }],
					usage: { prompt_tokens: 10, completion_tokens: 6 },
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "visual_summary",
					stream: true,
					media: {
						mediaAssetId: "media-1",
						name: "demo.png",
						type: "image",
						mimeType: "image/png",
						dataUrl: "data:image/png;base64,AA==",
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).not.toContain(
			"text/event-stream",
		);
		expect(await response.json()).toMatchObject({
			analysis: "图片分析已稳定返回。",
			media: {
				mediaAssetId: "media-1",
				type: "image",
			},
		});
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(chatBodies).toHaveLength(2);
	});

	test("does not request provider streaming for video even when progress stream is requested", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "non-stream-video" });
				}
				const body = JSON.parse(String(init?.body));
				expect(body).not.toHaveProperty("stream");
				expect(body).not.toHaveProperty("reasoning_split");
				expect(body.messages[1].content[1]).toMatchObject({
					type: "video_url",
					video_url: { url: "mm_file://non-stream-video" },
				});
				return Response.json({
					choices: [{ message: { content: "视频非流式返回。" } }],
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "visual_summary",
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
		expect(response.headers.get("Content-Type")).not.toContain(
			"text/event-stream",
		);
		expect(await response.json()).toMatchObject({
			analysis: "视频非流式返回。",
		});
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

	test("surfaces MiniMax upload base_resp errors from 200 responses", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const fetchFn: typeof fetch = mock(async () =>
			Response.json({
				base_resp: { status_code: 2049, status_msg: "invalid api key" },
			}),
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "visual_summary",
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

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error:
				"provider_error: MiniMax video upload failed: invalid api key (2049)",
		});
	});

	test("retries MiniMax video analysis with the documented minimal video request on provider 500", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const chatBodies: unknown[] = [];
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "capped-file" });
				}
				const body = JSON.parse(String(init?.body));
				chatBodies.push(body);
				if (chatBodies.length === 1) {
					expect(body).toMatchObject({
						thinking: { type: "adaptive" },
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
											detail: "high",
											fps: 0.5,
											max_long_side_pixel: 672,
										},
									},
								],
							},
						],
					});
					return Response.json(
						{
							type: "error",
							error: {
								type: "server_error",
								message: "unknown error, 999 (1000)",
								http_code: "500",
							},
						},
						{ status: 500 },
					);
				}
				expect(body).toMatchObject({
					model: "MiniMax-M3",
					thinking: { type: "adaptive" },
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
									},
								},
							],
						},
					],
				});
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"detail",
				);
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"fps",
				);
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"max_long_side_pixel",
				);
				expect(body).not.toHaveProperty("stream");
				expect(body).not.toHaveProperty("reasoning_split");
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
					detail: "high",
					fps: 0.5,
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
		expect(await response.json()).toMatchObject({
			analysis: "视频分析内容已稳定返回。",
		});
		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(chatBodies).toHaveLength(2);
	});

	test("retries MiniMax video analysis with the minimal request on provider invalid params", async () => {
		process.env.AGENT_VISION_KEY = "minimax-key";
		delete process.env.AGENT_VISION_PROVIDER;
		delete process.env.AGENT_VISION_HOST;
		delete process.env.AGENT_VISION_MODEL;
		const chatBodies: unknown[] = [];
		const fetchFn: typeof fetch = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				if (String(input).endsWith("/files/upload")) {
					expectMiniMaxVideoUpload({ init });
					return miniMaxUploadResponse({ fileId: "invalid-param-file" });
				}
				const body = JSON.parse(String(init?.body));
				chatBodies.push(body);
				if (chatBodies.length === 1) {
					expect(body.messages[1].content[1]).toMatchObject({
						type: "video_url",
						video_url: {
							url: "mm_file://invalid-param-file",
							detail: "default",
							fps: 0.5,
							max_long_side_pixel: 672,
						},
					});
					return Response.json(
						{
							type: "error",
							error: {
								type: "bad_request_error",
								message: "invalid params, 400 (2013)",
								http_code: "400",
							},
						},
						{ status: 400 },
					);
				}
				expect(body.messages[1].content[1]).toMatchObject({
					type: "video_url",
					video_url: {
						url: "mm_file://invalid-param-file",
					},
				});
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"detail",
				);
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"fps",
				);
				expect(body.messages[1].content[1].video_url).not.toHaveProperty(
					"max_long_side_pixel",
				);
				return Response.json({
					choices: [{ message: { content: "最小视频请求已返回。" } }],
				});
			},
		);
		globalThis.fetch = fetchFn;

		const response = await POST(
			new ApiRequest("http://localhost/api/agent/vision/analyze", {
				method: "POST",
				body: JSON.stringify({
					analysisType: "visual_summary",
					fps: 0.5,
					maxLongSidePixel: 672,
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
		expect(await response.json()).toMatchObject({
			analysis: "最小视频请求已返回。",
		});
		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(chatBodies).toHaveLength(2);
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
