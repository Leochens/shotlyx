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

const requestSchema = z.object({
	analysisType: analysisTypeSchema.optional(),
	prompt: z.string().min(1).max(4000).optional(),
	detail: detailSchema.optional(),
	fps: z.number().min(0.2).max(5).optional(),
	maxLongSidePixel: z.number().int().min(128).max(4096).optional(),
	maxCompletionTokens: z.number().int().min(256).max(8000).optional(),
	stream: z.boolean().optional(),
	media: z.object({
		mediaAssetId: z.string().optional(),
		name: z.string().min(1),
		type: z.enum(["image", "video"]),
		mimeType: z.string().min(1),
		dataUrl: z.string().startsWith("data:"),
		durationSeconds: z.number().optional(),
		width: z.number().optional(),
		height: z.number().optional(),
	}),
});

type VisionAnalyzeRequest = z.infer<typeof requestSchema>;

function buildInstruction({
	analysisType,
	prompt,
	media,
}: Pick<VisionAnalyzeRequest, "prompt" | "media"> & {
	analysisType: z.infer<typeof analysisTypeSchema>;
}): string {
	const mediaFacts = [
		`name: ${media.name}`,
		`type: ${media.type}`,
		media.durationSeconds ? `durationSeconds: ${media.durationSeconds}` : null,
		media.width && media.height ? `resolution: ${media.width}x${media.height}` : null,
	]
		.filter(Boolean)
		.join("\n");
	const typeInstruction =
		analysisType === "visual_summary"
			? "Summarize what is visually happening, including subjects, actions, setting, key moments, and any readable text."
			: analysisType === "quality_check"
				? "Evaluate visual quality, framing, lighting, focus, motion, artifacts, occlusion, and risks that could hurt the final edit."
				: analysisType === "content_verification"
					? "Verify whether the visual content matches the user's stated intent. Call out mismatches, uncertainty, and concrete evidence from the media."
					: "Act as a senior video editor. Analyze the footage and give concrete editing suggestions: strongest moments, weak/repetitive parts, pacing, suggested cuts, B-roll/MG/subtitle opportunities, and any visual issues.";

	return `${typeInstruction}

Return concise, actionable output in the same language as the user's prompt when possible. Use timestamps only when you can infer them from the video confidently; otherwise describe moments by visible action.

Media metadata:
${mediaFacts}

User request:
${prompt || "Analyze this media and provide editing suggestions."}`;
}

function stripThinkTags(value: string): string {
	return value.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();
}

function extensionForName(name: string): string {
	const match = /\.([^.]+)$/.exec(name.trim().toLowerCase());
	return match?.[1] ?? "";
}

function isUsableMimeType({
	type,
	mimeType,
}: {
	type: VisionAnalyzeRequest["media"]["type"];
	mimeType: string | undefined;
}): mimeType is string {
	if (!mimeType) return false;
	const normalized = mimeType.trim().toLowerCase();
	if (!normalized || GENERIC_MIME_TYPES.has(normalized)) return false;
	return type === "video"
		? normalized.startsWith("video/")
		: normalized.startsWith("image/");
}

function inferMediaMimeType(
	media: VisionAnalyzeRequest["media"],
): string {
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
	media: VisionAnalyzeRequest["media"],
): VisionAnalyzeRequest["media"] {
	const mimeType = inferMediaMimeType(media);
	return {
		...media,
		mimeType,
		dataUrl: rewriteDataUrlMimeType({
			dataUrl: media.dataUrl,
			mimeType,
		}),
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

function buildMediaPart({
	media,
	detail,
	fps,
	maxLongSidePixel,
}: {
	media: VisionAnalyzeRequest["media"];
	detail: z.infer<typeof detailSchema>;
	fps: number;
	maxLongSidePixel?: number;
}) {
	const providerMaxLongSidePixel =
		media.type === "video"
			? Math.min(
					maxLongSidePixel ?? MINIMAX_M3_VIDEO_MAX_LONG_SIDE_PIXEL,
					MINIMAX_M3_VIDEO_MAX_LONG_SIDE_PIXEL,
				)
			: maxLongSidePixel;
	const common = {
		url: media.dataUrl,
		detail,
		...(providerMaxLongSidePixel
			? { max_long_side_pixel: providerMaxLongSidePixel }
			: {}),
	};
	if (media.type === "video") {
		return {
			type: "video_url",
			video_url: {
				...common,
				fps,
			},
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
	detail,
	fps,
	stream,
}: {
	data: VisionAnalyzeRequest;
	model: string;
	analysisType: z.infer<typeof analysisTypeSchema>;
	detail: z.infer<typeof detailSchema>;
	fps: number;
	stream: boolean;
}) {
	return {
		model,
		thinking: { type: "disabled" },
		reasoning_split: true,
		max_completion_tokens: data.maxCompletionTokens ?? 2000,
		temperature: 0.3,
		...(stream
			? {
					stream: true,
					stream_options: { include_usage: true },
				}
			: {}),
		messages: [
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
					buildMediaPart({
						media: data.media,
						detail,
						fps,
						maxLongSidePixel: data.maxLongSidePixel,
					}),
				],
			},
		],
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
		throw new Error("provider_error: MiniMax response must be an object");
	}
	const choices = Reflect.get(data, "choices");
	if (!Array.isArray(choices) || choices.length === 0) {
		throw new Error("provider_error: MiniMax response did not include choices");
	}
	const first = choices[0];
	if (typeof first !== "object" || first === null) {
		throw new Error("provider_error: MiniMax choice must be an object");
	}
	const message = Reflect.get(first, "message");
	if (typeof message !== "object" || message === null) {
		throw new Error("provider_error: MiniMax choice did not include a message");
	}
	const content = Reflect.get(message, "content");
	if (typeof content === "string") return stripThinkTags(content);
	if (Array.isArray(content)) {
		return stripThinkTags(
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
	throw new Error("provider_error: MiniMax message content was empty");
}

export async function POST(request: ApiRequest) {
	let body: unknown;

	try {
		body = await request.json();
	} catch {
		return ApiResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return ApiResponse.json(
			{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
			{ status: 400 },
		);
	}

	try {
		const visionConfig = loadLLMConfigFromEnv().vision;
		if (!visionConfig?.apiKey) {
			throw new Error("configuration_error: missing AGENT_VISION_KEY");
		}
		if (visionConfig.provider !== "openai-compatible") {
			throw new Error(
				"configuration_error: AGENT_VISION_PROVIDER must be openai-compatible for MiniMax M3",
			);
		}

		const requestData: VisionAnalyzeRequest = {
			...parsed.data,
			media: normalizeMediaForProvider(parsed.data.media),
		};
		const detail = requestData.detail ?? "default";
		const analysisType = requestData.analysisType ?? "editing_suggestions";
		const fps = requestData.fps ?? 1;
		const url = `${visionConfig.host.replace(/\/+$/, "")}/chat/completions`;
		const response = await fetch(url, {
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
					detail,
					fps,
					stream: requestData.stream ?? false,
				}),
			),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`provider_error: MiniMax M3 vision request failed with ${response.status}: ${errorText.slice(0, 500)}`,
			);
		}

		if (requestData.stream) {
			return createStreamResponse({
				upstream: response,
				model: visionConfig.model,
				analysisType,
				media: requestData.media,
			});
		}

		const data: unknown = await response.json();
		return ApiResponse.json({
			provider: "minimax",
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
