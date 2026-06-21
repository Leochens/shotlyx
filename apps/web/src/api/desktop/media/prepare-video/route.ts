import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import {
	resolveFfmpegPaths,
	runFfprobeJson,
	selectBrowserVideoTranscodePlan,
	transcodeToBrowserVideo,
} from "@/desktop/media/ffmpeg";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

	const blob = await request.blob();
	if (blob.size <= 0) {
		return ApiResponse.json({ error: "Video file is empty" }, { status: 400 });
	}

	const tempDirectory = await fs.mkdtemp(
		path.join(tmpdir(), "shotlyx-video-prepare-"),
	);
	try {
		const inputPath = path.join(
			tempDirectory,
			`input${safeExtension({ name: query.value.name })}`,
		);
		await fs.writeFile(inputPath, Buffer.from(await blob.arrayBuffer()));
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
		const bytes = await fs.readFile(outputPath);
		return new Response(bytes, {
			headers: {
				"Content-Disposition": `inline; filename="${encodeURIComponent(outputName)}"`,
				"Content-Length": String(bytes.byteLength),
				"Content-Type": plan.contentType,
				"X-Shotlyx-Filename": encodeURIComponent(outputName),
			},
		});
	} finally {
		await fs.rm(tempDirectory, { recursive: true, force: true });
	}
}
