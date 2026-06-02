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

const requestSchema = z.object({
	analysisType: analysisTypeSchema.optional(),
	prompt: z.string().min(1).max(4000).optional(),
	detail: detailSchema.optional(),
	fps: z.number().min(0.2).max(5).optional(),
	maxLongSidePixel: z.number().int().min(128).max(4096).optional(),
	maxCompletionTokens: z.number().int().min(256).max(8000).optional(),
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
	const common = {
		url: media.dataUrl,
		detail,
		...(maxLongSidePixel ? { max_long_side_pixel: maxLongSidePixel } : {}),
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

		const detail = parsed.data.detail ?? "default";
		const analysisType = parsed.data.analysisType ?? "editing_suggestions";
		const fps = parsed.data.fps ?? 1;
		const url = `${visionConfig.host.replace(/\/+$/, "")}/chat/completions`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${visionConfig.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: visionConfig.model,
				reasoning_split: true,
				max_completion_tokens: parsed.data.maxCompletionTokens ?? 2000,
				temperature: 0.3,
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
									prompt: parsed.data.prompt,
									media: parsed.data.media,
								}),
							},
							buildMediaPart({
								media: parsed.data.media,
								detail,
								fps,
								maxLongSidePixel: parsed.data.maxLongSidePixel,
							}),
						],
					},
				],
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`provider_error: MiniMax M3 vision request failed with ${response.status}: ${errorText.slice(0, 500)}`,
			);
		}

		const data: unknown = await response.json();
		return ApiResponse.json({
			provider: "minimax",
			model: visionConfig.model,
			analysisType,
			analysis: extractMessageContent(data),
			media: {
				mediaAssetId: parsed.data.media.mediaAssetId,
				name: parsed.data.media.name,
				type: parsed.data.media.type,
				durationSeconds: parsed.data.media.durationSeconds,
				width: parsed.data.media.width,
				height: parsed.data.media.height,
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
