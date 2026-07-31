import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import { writeWebStreamToFile } from "@/desktop/media-library/server";
import {
	resolveFfmpegPaths,
	runFfprobeJson,
	selectBrowserVideoTranscodePlan,
	transcodeToBrowserVideo,
} from "@/desktop/media/ffmpeg";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DESKTOP_PREPARE_VIDEO_BYTES = 512 * 1024 * 1024;

const querySchema = z.object({
	name: z.string().min(1),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_video_prepare_disabled",
			message: "Video preparation is only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

function getRequestUrl(request: ApiRequest | Request): URL {
	return request instanceof ApiRequest
		? request.requestUrl
		: new URL(request.url);
}

function parseQuery(request: ApiRequest | Request) {
	const url = getRequestUrl(request);
	const parsed = querySchema.safeParse({
		name: url.searchParams.get("name") ?? undefined,
	});
	if (!parsed.success) {
		return {
			error: ApiResponse.json(
				{ error: "Invalid input", details: parsed.error.flatten().fieldErrors },
				{ status: 400 },
			),
			value: null,
		};
	}
	return { error: null, value: parsed.data };
}

function safeExtension({ name }: { name: string }): string {
	const extension = path
		.extname(name)
		.toLowerCase()
		.replace(/[^a-z0-9.]/g, "");
	return extension || ".mov";
}

function buildPreparedVideoName({
	extension,
	name,
}: {
	extension: ".mp4" | ".webm";
	name: string;
}): string {
	const parsed = path.parse(name);
	const baseName = parsed.name.trim() || "video";
	return `${baseName}${extension}`;
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const query = parseQuery(request);
	if (query.error) return query.error;
	if (!query.value) {
		return ApiResponse.json({ error: "Invalid input" }, { status: 400 });
	}

	if (!request.body) {
		return ApiResponse.json({ error: "Video file is empty" }, { status: 400 });
	}
	const contentLength = Number(request.headers.get("Content-Length") ?? "0");
	if (contentLength > MAX_DESKTOP_PREPARE_VIDEO_BYTES) {
		return ApiResponse.json(
			{
				error: "desktop_video_prepare_too_large",
				message:
					"Video is too large for desktop preview preparation. Importing the original file instead.",
			},
			{ status: 413 },
		);
	}

	const tempDirectory = await fs.mkdtemp(
		path.join(tmpdir(), "shotlyx-video-prepare-"),
	);
	try {
		const inputPath = path.join(
			tempDirectory,
			`input${safeExtension({ name: query.value.name })}`,
		);
		await writeWebStreamToFile({ filePath: inputPath, stream: request.body });
		const inputStat = await fs.stat(inputPath);
		if (inputStat.size <= 0) {
			await fs.rm(tempDirectory, { recursive: true, force: true });
			return ApiResponse.json({ error: "Video file is empty" }, { status: 400 });
		}
		if (inputStat.size > MAX_DESKTOP_PREPARE_VIDEO_BYTES) {
			await fs.rm(tempDirectory, { recursive: true, force: true });
			return ApiResponse.json(
				{
					error: "desktop_video_prepare_too_large",
					message:
						"Video is too large for desktop preview preparation. Importing the original file instead.",
				},
				{ status: 413 },
			);
		}
		const ffmpegPaths = resolveFfmpegPaths();
		const plan = selectBrowserVideoTranscodePlan({
			probe: await runFfprobeJson({
				filePath: inputPath,
				ffprobePath: ffmpegPaths.ffprobePath,
			}),
		});
		const outputName = buildPreparedVideoName({
			extension: plan.extension,
			name: query.value.name,
		});
		const outputPath = path.join(tempDirectory, outputName);
		await transcodeToBrowserVideo({
			ffmpegPath: ffmpegPaths.ffmpegPath,
			inputPath,
			outputPath,
			target: plan.target,
		});
		const outputStat = await fs.stat(outputPath);
		const outputStream = createReadStream(outputPath);
		outputStream.on("close", () => {
			fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
		});
		return new Response(Readable.toWeb(outputStream), {
			headers: {
				"Content-Disposition": `inline; filename="${encodeURIComponent(outputName)}"`,
				"Content-Length": String(outputStat.size),
				"Content-Type": plan.contentType,
				"X-Shotlyx-Filename": encodeURIComponent(outputName),
			},
		});
	} catch (error) {
		await fs.rm(tempDirectory, { recursive: true, force: true });
		throw error;
	}
}
