import { Buffer } from "node:buffer";
import { loadLLMConfigFromEnv } from "@/agent/llm/config";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";

const analysisTypeSchema = z
	.enum([
		"editing_suggestions",
		"visual_summary",
		"quality_check",
		"content_verification",
	])
	.default("editing_suggestions");

const detailSchema = z.enum(["low", "default", "high"]).default("default");
const GENERIC_MIME_TYPES = new Set([
	"application/octet-stream",
	"binary/octet-stream",
	"application/x-binary",
]);
const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
};
const MINIMAX_M3_VIDEO_MAX_LONG_SIDE_PIXEL = 672;

const mediaMetadataSchema = z.object({
	mediaAssetId: z.string().optional(),
	name: z.string().min(1),
	type: z.enum(["image", "video"]),
	mimeType: z.string().min(1),
	durationSeconds: z.number().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
});

const requestBaseSchema = z.object({
	analysisType: analysisTypeSchema.optional(),
	prompt: z.string().min(1).max(4000).optional(),
	detail: detailSchema.optional(),
	fps: z.number().min(0.2).max(5).optional(),
	maxLongSidePixel: z.number().int().min(128).max(4096).optional(),
	maxCompletionTokens: z.number().int().min(256).max(8000).optional(),
	stream: z.boolean().optional(),
});

const requestSchema = requestBaseSchema.extend({
	media: mediaMetadataSchema.extend({
		dataUrl: z.string().startsWith("data:"),
	}),
});

const multipartRequestSchema = requestBaseSchema.extend({
	media: mediaMetadataSchema,
});

type VisionAnalyzeRequest = z.infer<typeof requestSchema>;
type VisionMediaMetadata = z.infer<typeof mediaMetadataSchema>;
type VisionAnalyzeData = Omit<VisionAnalyzeRequest, "media"> & {
	media: VisionMediaMetadata & {
		dataUrl?: string;
		file?: Blob;
	};
};
type MiniMaxThinkingType = "adaptive" | "disabled";
type VisionProviderFlavor = "minimax" | "moonshot" | "deepseek";

function buildInstruction({
	analysisType,
	prompt,
	media,
}: Pick<VisionAnalyzeData, "prompt" | "media"> & {
	analysisType: z.infer<typeof analysisTypeSchema>;
}): string {
	const isImage = media.type === "image";
	const mediaFacts = [
		`name: ${media.name}`,
		`type: ${media.type}`,
		media.durationSeconds ? `durationSeconds: ${media.durationSeconds}` : null,
		media.width && media.height
			? `resolution: ${media.width}x${media.height}`
			: null,
	]
		.filter(Boolean)
		.join("\n");
	const typeInstruction =
		analysisType === "visual_summary"
			? isImage
				? "Summarize what is visible in this still image, including subjects, composition, setting, visual hierarchy, and any readable text."
				: "Summarize what is visually happening, including subjects, actions, setting, key moments, and any readable text."
			: analysisType === "quality_check"
				? isImage
					? "Evaluate image quality, framing, lighting, focus, artifacts, occlusion, readability, and risks that could hurt the final edit or cover."
					: "Evaluate visual quality, framing, lighting, focus, motion, artifacts, occlusion, and risks that could hurt the final edit."
				: analysisType === "content_verification"
					? "Verify whether the visual content matches the user's stated intent. Call out mismatches, uncertainty, and concrete evidence from the media."
					: isImage
						? "Act as a senior visual editor. Analyze this still image and give concrete editing suggestions: strongest visual elements, weak or distracting areas, crop/layout opportunities, cover/B-roll/MG usage, readable text, and any visual issues."
						: "Act as a senior video editor. Analyze the footage and give concrete editing suggestions: strongest moments, weak/repetitive parts, pacing, suggested cuts, B-roll/MG/subtitle opportunities, and any visual issues.";

	return `${typeInstruction}

Return concise, actionable output in the same language as the user's prompt when possible. ${
		isImage
			? "Do not invent timestamps for a still image."
			: "Use timestamps only when you can infer them from the video confidently; otherwise describe moments by visible action."
	}

Media metadata:
${mediaFacts}

User request:
${prompt || "Analyze this media and provide editing suggestions."}`;
}

function stripThinkTags(value: string): string {
	return value.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
}

function assertNonEmptyAnalysis(value: string): string {
	const analysis = stripThinkTags(value);
	if (!analysis) {
		throw new Error(
			"provider_error: MiniMax response did not include analysis content",
		);
	}
	return analysis;
}

function extensionForName(name: string): string {
	const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
	return match?.[1] ?? "";
}

function isUsableMimeType({
	type,
	mimeType,
}: {
	type: VisionAnalyzeData["media"]["type"];
	mimeType: string | undefined;
}): mimeType is string {
	if (!mimeType) return false;
	const normalized = mimeType.trim().toLowerCase();
	if (!normalized || GENERIC_MIME_TYPES.has(normalized)) return false;
	return type === "video"
		? normalized.startsWith("video/")
		: normalized.startsWith("image/");
}

function inferMediaMimeType(media: VisionAnalyzeData["media"]): string {
	if (isUsableMimeType({ type: media.type, mimeType: media.mimeType })) {
		return media.mimeType.trim().toLowerCase();
	}
	const extension = extensionForName(media.name);
	if (media.type === "video" && VIDEO_MIME_BY_EXTENSION[extension]) {
		return VIDEO_MIME_BY_EXTENSION[extension];
	}
	if (media.type === "image" && IMAGE_MIME_BY_EXTENSION[extension]) {
		return IMAGE_MIME_BY_EXTENSION[extension];
	}
	return media.type === "video" ? "video/mp4" : "image/png";
}

function rewriteDataUrlMimeType({
	dataUrl,
	mimeType,
}: {
	dataUrl: string;
	mimeType: string;
}): string {
	if (!dataUrl.startsWith("data:")) return dataUrl;
	const commaIndex = dataUrl.indexOf(",");
	if (commaIndex < 0) return dataUrl;
	const metadata = dataUrl.slice(5, commaIndex);
	const suffixIndex = metadata.indexOf(";");
	const suffix = suffixIndex >= 0 ? metadata.slice(suffixIndex) : "";
	return `data:${mimeType}${suffix},${dataUrl.slice(commaIndex + 1)}`;
}

function normalizeMediaForProvider(
	media: VisionAnalyzeData["media"],
): VisionAnalyzeData["media"] {
	const mimeType = inferMediaMimeType(media);
	return {
		...media,
		mimeType,
		...(media.dataUrl
			? {
					dataUrl: rewriteDataUrlMimeType({
						dataUrl: media.dataUrl,
						mimeType,
					}),
				}
			: {}),
	};
}

function normalizeVisionError(error: unknown): {
	message: string;
	status: number;
} {
	const rawMessage = error instanceof Error ? error.message : "";
	if (rawMessage.startsWith("configuration_error")) {
		return { message: rawMessage, status: 500 };
	}
	if (rawMessage.startsWith("provider_error")) {
		return { message: rawMessage, status: 502 };
	}
	return {
		message: rawMessage || "provider_error: vision analysis failed",
		status: 502,
	};
}

async function parseRequestData(
	request: ApiRequest,
): Promise<VisionAnalyzeData | { error: Response }> {
	const payloadParam = request.requestUrl.searchParams.get("payload");
	if (payloadParam !== null) {
		let data: unknown;
		try {
			data = JSON.parse(payloadParam);
		} catch {
			return {
				error: ApiResponse.json({ error: "Invalid JSON" }, { status: 400 }),
			};
		}
		const parsed = multipartRequestSchema.safeParse(data);
		if (!parsed.success) {
			return {
				error: ApiResponse.json(
					{
						error: "Invalid input",
						details: parsed.error.flatten().fieldErrors,
					},
					{ status: 400 },
				),
			};
		}
		if (parsed.data.media.type !== "video") {
			return {
				error: ApiResponse.json(
					{
						error: "Invalid input",
						details: {
							media: ["Binary media uploads are only supported for video"],
						},
					},
					{ status: 400 },
				),
			};
		}
		let file: Blob;
		try {
			file = await request.blob();
		} catch {
			return {
				error: ApiResponse.json(
					{ error: "Invalid binary media" },
					{ status: 400 },
				),
			};
		}
		return {
			...parsed.data,
			media: {
				...parsed.data.media,
				file: file.type
					? file
					: new Blob([file], { type: parsed.data.media.mimeType }),
			},
		};
	}

	const contentType = (request.headers.get("Content-Type") ?? "").toLowerCase();
	if (contentType.includes("multipart/form-data")) {
		let formData: FormData;
		try {
			formData = await request.formData();
		} catch {
			return {
				error: ApiResponse.json(
					{ error: "Invalid form data" },
					{ status: 400 },
				),
			};
		}
		const payload = formData.get("payload");
		if (typeof payload !== "string") {
			return {
				error: ApiResponse.json(
					{ error: "Invalid input", details: { payload: ["Required"] } },
					{ status: 400 },
				),
			};
		}
		let data: unknown;
		try {
			data = JSON.parse(payload);
		} catch {
			return {
				error: ApiResponse.json({ error: "Invalid JSON" }, { status: 400 }),
			};
		}
		const parsed = multipartRequestSchema.safeParse(data);
		if (!parsed.success) {
			return {
				error: ApiResponse.json(
					{
						error: "Invalid input",
						details: parsed.error.flatten().fieldErrors,
					},
					{ status: 400 },
				),
			};
		}
		const file = formData.get("file");
		if (parsed.data.media.type === "video" && !(file instanceof Blob)) {
			return {
				error: ApiResponse.json(
					{ error: "Invalid input", details: { file: ["Required"] } },
					{ status: 400 },
				),
			};
		}
		return {
			...parsed.data,
			media: {
				...parsed.data.media,
				...(file instanceof Blob ? { file } : {}),
			},
		};
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return {
			error: ApiResponse.json({ error: "Invalid JSON" }, { status: 400 }),
		};
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return {
			error: ApiResponse.json(
				{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
				{ status: 400 },
			),
		};
	}
	return parsed.data;
}

function isParseError(
	value: VisionAnalyzeData | { error: Response },
): value is { error: Response } {
	return "error" in value;
}

function blobFromDataUrl({
	dataUrl,
	mimeType,
}: {
	dataUrl: string;
	mimeType: string;
}): Blob {
	const commaIndex = dataUrl.indexOf(",");
	if (commaIndex < 0) {
		throw new Error("provider_error: invalid media data URL");
	}
	const metadata = dataUrl.slice(5, commaIndex).toLowerCase();
	const payload = dataUrl.slice(commaIndex + 1);
	const bytes = metadata.includes(";base64")
		? Buffer.from(payload, "base64")
		: Buffer.from(decodeURIComponent(payload), "utf8");
	return new Blob([bytes], { type: mimeType });
}

function extractUploadedFileId(data: unknown): string {
	const record = getRecord(data);
	const baseResp = getRecord(record?.base_resp);
	const statusCode = baseResp?.status_code;
	if (
		(typeof statusCode === "number" && statusCode !== 0) ||
		(typeof statusCode === "string" && statusCode !== "0")
	) {
		const statusMsg =
			typeof baseResp?.status_msg === "string" && baseResp.status_msg.trim()
				? baseResp.status_msg.trim()
				: "unknown upload error";
		throw new Error(
			`provider_error: MiniMax video upload failed: ${statusMsg} (${statusCode})`,
		);
	}
	const file = getRecord(record?.file);
	const fileId = file?.file_id;
	if (typeof fileId === "string" && fileId.trim()) return fileId.trim();
	if (typeof fileId === "number" && Number.isFinite(fileId))
		return String(fileId);
	throw new Error("provider_error: MiniMax file upload did not return file_id");
}

async function uploadMiniMaxVideo({
	host,
	apiKey,
	media,
}: {
	host: string;
	apiKey: string;
	media: VisionAnalyzeData["media"];
}): Promise<string> {
	const file =
		media.file ??
		(media.dataUrl
			? blobFromDataUrl({
					dataUrl: media.dataUrl,
					mimeType: media.mimeType,
				})
			: null);
	if (!file) {
		throw new Error("provider_error: missing video file for MiniMax upload");
	}

	const formData = new FormData();
	formData.set("purpose", "video_understanding");
	formData.set("file", file, media.name);

	const response = await fetch(`${host.replace(/\/+$/, "")}/files/upload`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`provider_error: MiniMax video upload failed with ${response.status}: ${errorText.slice(0, 500)}`,
		);
	}
	const data: unknown = await response.json();
	return `mm_file://${extractUploadedFileId(data)}`;
}

function extractMoonshotFileId(data: unknown): string {
	const record = getRecord(data);
	const id = record?.id;
	if (typeof id === "string" && id.trim()) return id.trim();
	if (typeof id === "number" && Number.isFinite(id)) return String(id);
	throw new Error("provider_error: Moonshot file upload did not return id");
}

async function uploadMoonshotVisionFile({
	host,
	apiKey,
	media,
}: {
	host: string;
	apiKey: string;
	media: VisionAnalyzeData["media"];
}): Promise<string> {
	const file =
		media.file ??
		(media.dataUrl
			? blobFromDataUrl({
					dataUrl: media.dataUrl,
					mimeType: media.mimeType,
				})
			: null);
	if (!file) {
		throw new Error("provider_error: missing media file for Moonshot upload");
	}

	const formData = new FormData();
	formData.set("purpose", media.type);
	formData.set("file", file, media.name);

	const response = await fetch(`${host.replace(/\/+$/, "")}/files`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: formData,
	});
	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`provider_error: Moonshot vision upload failed with ${response.status}: ${errorText.slice(0, 500)}`,
		);
	}
	const data: unknown = await response.json();
	return `ms://${extractMoonshotFileId(data)}`;
}

function buildMediaPart({
	media,
	url,
	detail,
	fps,
	maxLongSidePixel,
	includeVideoOptions = true,
	providerFlavor,
}: {
	media: VisionAnalyzeData["media"];
	url: string;
	detail: z.infer<typeof detailSchema>;
	fps: number;
	maxLongSidePixel?: number;
	includeVideoOptions?: boolean;
	providerFlavor: Exclude<VisionProviderFlavor, "deepseek">;
}) {
	if (providerFlavor === "moonshot") {
		if (media.type === "video") {
			return {
				type: "video_url",
				video_url: { url },
			};
		}
		return {
			type: "image_url",
			image_url: { url },
		};
	}

	const providerMaxLongSidePixel =
		media.type === "video"
			? Math.min(
					maxLongSidePixel ?? MINIMAX_M3_VIDEO_MAX_LONG_SIDE_PIXEL,
					MINIMAX_M3_VIDEO_MAX_LONG_SIDE_PIXEL,
				)
			: maxLongSidePixel;
	const common = {
		url,
		detail,
		...(providerMaxLongSidePixel
			? { max_long_side_pixel: providerMaxLongSidePixel }
			: {}),
	};
	if (media.type === "video") {
		return {
			type: "video_url",
			video_url: includeVideoOptions ? { ...common, fps } : { url },
		};
	}
	return {
		type: "image_url",
		image_url: common,
	};
}

function buildProviderRequestBody({
	data,
	model,
	analysisType,
	mediaPart,
	stream,
	thinkingType = "adaptive",
	providerFlavor,
}: {
	data: VisionAnalyzeData;
	model: string;
	analysisType: z.infer<typeof analysisTypeSchema>;
	mediaPart: ReturnType<typeof buildMediaPart>;
	stream: boolean;
	thinkingType?: MiniMaxThinkingType;
	providerFlavor: Exclude<VisionProviderFlavor, "deepseek">;
}) {
	const isVideoRequest = mediaPart.type === "video_url";
	const messages = [
		{
			role: "system",
			content:
				"You are Shotlyx's visual analysis agent for a video editor. Focus on observable visual evidence and practical editing decisions.",
		},
		{
			role: "user",
			content: [
				{
					type: "text",
					text: buildInstruction({
						analysisType,
						prompt: data.prompt,
						media: data.media,
					}),
				},
				mediaPart,
			],
		},
	];
	if (providerFlavor === "moonshot") {
		return {
			model,
			thinking: { type: "disabled" },
			max_tokens: data.maxCompletionTokens ?? 2000,
			...(stream
				? {
						stream: true,
						stream_options: { include_usage: true },
					}
				: {}),
			messages,
		};
	}

	return {
		model,
		thinking: { type: thinkingType },
		max_completion_tokens: data.maxCompletionTokens ?? 2000,
		...(isVideoRequest ? {} : { temperature: 0.3 }),
		...(stream
			? {
					reasoning_split: true,
					stream: true,
					stream_options: { include_usage: true },
				}
			: {}),
		messages,
	};
}

function getRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value;
}

function getFirstChoiceDelta(data: unknown): Record<string, unknown> | null {
	const record = getRecord(data);
	if (!record) return null;
	const choices = record.choices;
	if (!Array.isArray(choices)) return null;
	const firstChoice = getRecord(choices[0]);
	if (!firstChoice) return null;
	return getRecord(firstChoice.delta);
}

function getReasoningText(delta: Record<string, unknown>): string {
	const details = delta.reasoning_details;
	if (!Array.isArray(details)) return "";
	return details
		.map((detail) => {
			const record = getRecord(detail);
			return typeof record?.text === "string" ? record.text : "";
		})
		.join("");
}

function getContentText(delta: Record<string, unknown>): string {
	return typeof delta.content === "string" ? delta.content : "";
}

function appendMiniMaxStreamText({
	buffer,
	text,
}: {
	buffer: string;
	text: string;
}): { buffer: string; delta: string } {
	if (!text) return { buffer, delta: "" };
	if (text.startsWith(buffer)) {
		const delta = text.slice(buffer.length);
		return { buffer: text, delta };
	}
	return { buffer: buffer + text, delta: text };
}

function encodeSseEvent(data: unknown): Uint8Array {
	return new TextEncoder().encode(
		`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`,
	);
}

function getSseData(frame: string): string | null {
	const dataLines = frame
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trimStart());
	if (dataLines.length === 0) return null;
	return dataLines.join("\n");
}

function splitSseFrames(input: string): { frames: string[]; rest: string } {
	const normalized = input.replace(/\r\n/g, "\n");
	const parts = normalized.split("\n\n");
	return {
		frames: parts.slice(0, -1),
		rest: parts.at(-1) ?? "",
	};
}

function createStreamResponse({
	upstream,
	model,
	analysisType,
	media,
}: {
	upstream: Response;
	model: string;
	analysisType: z.infer<typeof analysisTypeSchema>;
	media: VisionAnalyzeRequest["media"];
}): Response {
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const reader = upstream.body?.getReader();
			if (!reader) {
				controller.enqueue(
					encodeSseEvent({
						type: "error",
						error: "provider_error: MiniMax stream response was empty",
					}),
				);
				controller.close();
				return;
			}

			const decoder = new TextDecoder();
			let pending = "";
			let reasoningBuffer = "";
			let contentBuffer = "";
			let usage: unknown;

			const processFrame = (frame: string) => {
				const dataText = getSseData(frame);
				if (!dataText) return false;
				if (dataText === "[DONE]") return true;
				let data: unknown;
				try {
					data = JSON.parse(dataText);
				} catch {
					return false;
				}
				const record = getRecord(data);
				if (record && "usage" in record) {
					usage = record.usage;
				}
				const delta = getFirstChoiceDelta(data);
				if (!delta) return false;

				const reasoning = appendMiniMaxStreamText({
					buffer: reasoningBuffer,
					text: getReasoningText(delta),
				});
				reasoningBuffer = reasoning.buffer;
				if (reasoning.delta) {
					controller.enqueue(
						encodeSseEvent({ type: "reasoning_delta", text: reasoning.delta }),
					);
				}

				const content = appendMiniMaxStreamText({
					buffer: contentBuffer,
					text: getContentText(delta),
				});
				contentBuffer = content.buffer;
				if (content.delta) {
					controller.enqueue(
						encodeSseEvent({ type: "content_delta", text: content.delta }),
					);
				}
				return false;
			};

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					pending += decoder.decode(value, { stream: true });
					const { frames, rest } = splitSseFrames(pending);
					pending = rest;
					let shouldStop = false;
					for (const frame of frames) {
						shouldStop = processFrame(frame);
						if (shouldStop) break;
					}
					if (shouldStop) break;
				}
				if (pending.trim()) {
					processFrame(pending);
				}
				controller.enqueue(
					encodeSseEvent({
						type: "done",
						provider: "minimax",
						model,
						analysisType,
						analysis: stripThinkTags(contentBuffer),
						media: {
							mediaAssetId: media.mediaAssetId,
							name: media.name,
							type: media.type,
							durationSeconds: media.durationSeconds,
							width: media.width,
							height: media.height,
						},
						usage,
					}),
				);
				controller.enqueue(encodeSseEvent("[DONE]"));
				controller.close();
			} catch (error) {
				controller.enqueue(
					encodeSseEvent({
						type: "error",
						error:
							error instanceof Error
								? error.message
								: "provider_error: MiniMax stream failed",
					}),
				);
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
		},
	});
}

function extractMessageContent(data: unknown): string {
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new Error("provider_error: vision provider response must be an object");
	}
	const choices = Reflect.get(data, "choices");
	if (!Array.isArray(choices) || choices.length === 0) {
		throw new Error(
			"provider_error: vision provider response did not include choices",
		);
	}
	const first = choices[0];
	if (typeof first !== "object" || first === null) {
		throw new Error("provider_error: vision provider choice must be an object");
	}
	const message = Reflect.get(first, "message");
	if (typeof message !== "object" || message === null) {
		throw new Error(
			"provider_error: vision provider choice did not include a message",
		);
	}
	const content = Reflect.get(message, "content");
	if (typeof content === "string") return assertNonEmptyAnalysis(content);
	if (Array.isArray(content)) {
		return assertNonEmptyAnalysis(
			content
				.map((part) => {
					if (typeof part === "string") return part;
					if (
						typeof part === "object" &&
						part !== null &&
						typeof Reflect.get(part, "text") === "string"
					) {
						return Reflect.get(part, "text");
					}
					return "";
				})
				.join(""),
		);
	}
	throw new Error("provider_error: vision provider message content was empty");
}

function formatMiniMaxVisionRequestError({
	status,
	errorText,
}: {
	status: number;
	errorText: string;
}): string {
	return `provider_error: MiniMax M3 vision request failed with ${status}: ${errorText.slice(0, 500)}`;
}

function formatVisionRequestError({
	errorText,
	providerFlavor,
	status,
}: {
	errorText: string;
	providerFlavor: Exclude<VisionProviderFlavor, "deepseek">;
	status: number;
}): string {
	if (providerFlavor === "minimax") {
		return formatMiniMaxVisionRequestError({ status, errorText });
	}
	return `provider_error: Moonshot/Kimi vision request failed with ${status}: ${errorText.slice(0, 500)}`;
}

function getVisionProviderFlavor({
	host,
	model,
}: {
	host: string;
	model: string;
}): VisionProviderFlavor {
	const normalizedHost = host.toLowerCase();
	const normalizedModel = model.toLowerCase();
	if (
		normalizedHost.includes("deepseek.com") ||
		normalizedModel.startsWith("deepseek")
	) {
		return "deepseek";
	}
	if (
		normalizedHost.includes("moonshot.") ||
		normalizedHost.includes("kimi.") ||
		normalizedModel.startsWith("kimi-") ||
		normalizedModel.startsWith("moonshot-v1")
	) {
		return "moonshot";
	}
	return "minimax";
}

function shouldRetryWithMinimalVideoRequest({
	errorText,
	media,
	status,
}: {
	errorText: string;
	media: VisionAnalyzeData["media"];
	status: number;
}): boolean {
	if (media.type !== "video") return false;
	if (status >= 500) return true;
	return status === 400 && /invalid\s+params?/i.test(errorText);
}

function shouldRetryWithNonStreamingImageRequest({
	errorText,
	media,
	status,
	stream,
}: {
	errorText: string;
	media: VisionAnalyzeData["media"];
	status: number;
	stream: boolean;
}): boolean {
	if (media.type !== "image" || !stream) return false;
	if (status >= 500) return true;
	return status === 400 && /invalid\s+params?/i.test(errorText);
}

export async function POST(request: ApiRequest) {
	const parsed = await parseRequestData(request);
	if (isParseError(parsed)) return parsed.error;

	try {
		const visionConfig = loadLLMConfigFromEnv().vision;
		if (!visionConfig?.apiKey) {
			throw new Error("configuration_error: missing AGENT_VISION_KEY");
		}
		if (visionConfig.provider !== "openai-compatible") {
			throw new Error(
				"configuration_error: AGENT_VISION_PROVIDER must be openai-compatible for visual understanding",
			);
		}

		const requestData: VisionAnalyzeData = {
			...parsed,
			media: normalizeMediaForProvider(parsed.media),
		};
		const detail = requestData.detail ?? "default";
		const analysisType = requestData.analysisType ?? "editing_suggestions";
		const fps = requestData.fps ?? 1;
		const host = visionConfig.host.replace(/\/+$/, "");
		const providerFlavor = getVisionProviderFlavor({
			host,
			model: visionConfig.model,
		});
		if (providerFlavor === "deepseek") {
			throw new Error(
				"configuration_error: DeepSeek V4 API does not expose image or video input for visual understanding. Use Kimi K2.6/Moonshot or another vision-capable provider.",
			);
		}
		const mediaUrl =
			requestData.media.type === "video"
				? providerFlavor === "moonshot"
					? await uploadMoonshotVisionFile({
							host,
							apiKey: visionConfig.apiKey,
							media: requestData.media,
						})
					: await uploadMiniMaxVideo({
							host,
							apiKey: visionConfig.apiKey,
							media: requestData.media,
						})
				: requestData.media.dataUrl;
		if (!mediaUrl) {
			throw new Error("provider_error: missing media URL for vision analysis");
		}
		const mediaPart = buildMediaPart({
			media: requestData.media,
			url: mediaUrl,
			detail,
			fps,
			maxLongSidePixel: requestData.maxLongSidePixel,
			providerFlavor,
		});
		const url = `${host}/chat/completions`;
		const shouldUseProviderStream =
			providerFlavor === "minimax" &&
			Boolean(requestData.stream) &&
			requestData.media.type !== "video";
		let responseUsesProviderStream = shouldUseProviderStream;
		const buildFetchInit = ({
			mediaPart,
			stream,
			thinkingType,
		}: {
			mediaPart: ReturnType<typeof buildMediaPart>;
			stream: boolean;
			thinkingType?: MiniMaxThinkingType;
		}): RequestInit => ({
			method: "POST",
			headers: {
				Authorization: `Bearer ${visionConfig.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(
				buildProviderRequestBody({
					data: requestData,
					model: visionConfig.model,
					analysisType,
					mediaPart,
					stream,
					thinkingType,
					providerFlavor,
				}),
			),
		});

		let response = await fetch(
			url,
			buildFetchInit({
				mediaPart,
				stream: shouldUseProviderStream,
			}),
		);

		if (!response.ok) {
			const errorText = await response.text();
			if (
				shouldRetryWithNonStreamingImageRequest({
					errorText,
					media: requestData.media,
					status: response.status,
					stream: shouldUseProviderStream,
				})
			) {
				response = await fetch(
					url,
					buildFetchInit({
						mediaPart,
						stream: false,
						thinkingType: "disabled",
					}),
				);
				responseUsesProviderStream = false;
				if (!response.ok) {
					const fallbackErrorText = await response.text();
					throw new Error(
						`${formatMiniMaxVisionRequestError({
							status: response.status,
							errorText: fallbackErrorText,
						})}; first streaming attempt failed with ${errorText.slice(0, 500)}`,
					);
				}
			} else if (
				providerFlavor === "minimax" &&
				shouldRetryWithMinimalVideoRequest({
					errorText,
					media: requestData.media,
					status: response.status,
				})
			) {
				const minimalVideoPart = buildMediaPart({
					media: requestData.media,
					url: mediaUrl,
					detail,
					fps,
					maxLongSidePixel: requestData.maxLongSidePixel,
					includeVideoOptions: false,
					providerFlavor,
				});
				response = await fetch(
					url,
					buildFetchInit({
						mediaPart: minimalVideoPart,
						stream: false,
					}),
				);
				responseUsesProviderStream = false;
				if (!response.ok) {
					const fallbackErrorText = await response.text();
					throw new Error(
						`${formatMiniMaxVisionRequestError({
							status: response.status,
							errorText: fallbackErrorText,
						})}; first attempt failed with ${errorText.slice(0, 500)}`,
					);
				}
			} else {
				throw new Error(
					formatVisionRequestError({
						status: response.status,
						errorText,
						providerFlavor,
					}),
				);
			}
		}

		if (responseUsesProviderStream) {
			return createStreamResponse({
				upstream: response,
				model: visionConfig.model,
				analysisType,
				media: requestData.media,
			});
		}

		const data: unknown = await response.json();
		return ApiResponse.json({
			provider: providerFlavor,
			model: visionConfig.model,
			analysisType,
			analysis: extractMessageContent(data),
			media: {
				mediaAssetId: requestData.media.mediaAssetId,
				name: requestData.media.name,
				type: requestData.media.type,
				durationSeconds: requestData.media.durationSeconds,
				width: requestData.media.width,
				height: requestData.media.height,
			},
			usage:
				typeof data === "object" && data !== null && !Array.isArray(data)
					? Reflect.get(data, "usage")
					: undefined,
		});
	} catch (error) {
		const normalized = normalizeVisionError(error);
		return ApiResponse.json(
			{ error: normalized.message },
			{ status: normalized.status },
		);
	}
}
