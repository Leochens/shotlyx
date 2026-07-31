import fs from "node:fs/promises";
import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import * as mediaAnalysis from "@/desktop/media/analyze";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const analysisLevelSchema = z
	.enum(["basic", "standard", "deep"])
	.default("basic");

const jsonRequestSchema = z.object({
	videoId: z.string().min(1).optional(),
	filePath: z.string().min(1),
	analysisLevel: analysisLevelSchema.optional(),
	sceneThreshold: z.number().min(0.05).max(0.9).optional(),
});

const uploadPayloadSchema = z.object({
	videoId: z.string().min(1).optional(),
	name: z.string().min(1).default("shotlyx-video.mp4"),
	analysisLevel: analysisLevelSchema.optional(),
	sceneThreshold: z.number().min(0.05).max(0.9).optional(),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_media_analysis_disabled",
			message:
				"Video asset analysis is only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

function invalidInputResponse(details: unknown) {
	return ApiResponse.json(
		{
			error: "Invalid input",
			details,
		},
		{ status: 400 },
	);
}

async function analyzeJsonRequest(request: ApiRequest | Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return invalidInputResponse({ body: ["Invalid JSON"] });
	}

	const parsed = jsonRequestSchema.safeParse(body);
	if (!parsed.success) {
		return invalidInputResponse(parsed.error.flatten().fieldErrors);
	}

	const result = await mediaAnalysis.analyzeVideoAsset({
		videoId: parsed.data.videoId,
		filePath: parsed.data.filePath,
		analysisLevel: parsed.data.analysisLevel,
		sceneThreshold: parsed.data.sceneThreshold,
	});
	return ApiResponse.json(result);
}

async function analyzeUploadRequest({
	payloadParam,
	request,
}: {
	payloadParam: string;
	request: ApiRequest | Request;
}) {
	let payload: unknown;
	try {
		payload = JSON.parse(payloadParam);
	} catch {
		return invalidInputResponse({ payload: ["Invalid JSON"] });
	}

	const parsed = uploadPayloadSchema.safeParse(payload);
	if (!parsed.success) {
		return invalidInputResponse(parsed.error.flatten().fieldErrors);
	}

	let filePath: string | null = null;
	try {
		const blob = await request.blob();
		if (blob.size <= 0) {
			return invalidInputResponse({ media: ["Uploaded video is empty"] });
		}
		filePath = await mediaAnalysis.writeUploadedVideoToTemp({
			blob,
			name: parsed.data.name,
		});
		const result = await mediaAnalysis.analyzeVideoAsset({
			videoId: parsed.data.videoId,
			filePath,
			analysisLevel: parsed.data.analysisLevel,
			sceneThreshold: parsed.data.sceneThreshold,
		});
		return ApiResponse.json(result);
	} finally {
		if (filePath) {
			await fs.rm(filePath, { force: true }).catch(() => {});
		}
	}
}

function getRequestUrl(request: ApiRequest | Request): URL {
	return request instanceof ApiRequest
		? request.requestUrl
		: new URL(request.url);
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();

	const payloadParam = getRequestUrl(request).searchParams.get("payload");
	if (payloadParam !== null) {
		return analyzeUploadRequest({ payloadParam, request });
	}

	return analyzeJsonRequest(request);
}
