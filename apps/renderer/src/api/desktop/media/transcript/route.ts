import fs from "node:fs/promises";
import { z } from "zod";
import { transcribeAudio } from "@/agent/tools/transcription/providers";
import {
	extractVideoAudioForAsr,
	writeUploadedVideoToTemp,
} from "@/desktop/media/analyze";
import { isDesktopMode } from "@/desktop/config/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
	language: z.string().min(1).optional(),
	model: z.string().min(1).optional(),
	name: z.string().min(1).default("shotlyx-video.mp4"),
	provider: z.string().min(1).optional(),
	videoId: z.string().min(1).optional(),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_media_transcript_disabled",
			message:
				"Video ASR transcription is only available in Shotlyx desktop mode.",
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

function getRequestUrl(request: ApiRequest | Request): URL {
	return request instanceof ApiRequest
		? request.requestUrl
		: new URL(request.url);
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();

	const payloadParam = getRequestUrl(request).searchParams.get("payload");
	if (payloadParam === null) {
		return invalidInputResponse({ payload: ["Missing payload"] });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(payloadParam);
	} catch {
		return invalidInputResponse({ payload: ["Invalid JSON"] });
	}

	const parsed = payloadSchema.safeParse(payload);
	if (!parsed.success) {
		return invalidInputResponse(parsed.error.flatten().fieldErrors);
	}

	let filePath: string | null = null;
	try {
		const blob = await request.blob();
		if (blob.size <= 0) {
			return invalidInputResponse({ media: ["Uploaded video is empty"] });
		}
		filePath = await writeUploadedVideoToTemp({
			blob,
			name: parsed.data.name,
		});
		const audio = await extractVideoAudioForAsr({ filePath });
		const result = await transcribeAudio({
			input: {
				audio,
				language: parsed.data.language,
				model: parsed.data.model,
				provider: parsed.data.provider,
			},
		});
		return ApiResponse.json({
			language: result.language,
			metadata: result.metadata,
			model: result.model,
			modelUsed: [result.provider, result.model].filter(Boolean).join(":"),
			provider: result.provider,
			text: result.text,
			transcript: result.cues.map((cue) => ({
				end: cue.startTimeSeconds + cue.durationSeconds,
				start: cue.startTimeSeconds,
				text: cue.text,
			})),
			videoId: parsed.data.videoId,
		});
	} finally {
		if (filePath) {
			await fs.rm(filePath, { force: true }).catch(() => {});
		}
	}
}
