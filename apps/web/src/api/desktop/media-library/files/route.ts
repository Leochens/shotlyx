import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import {
	clearDesktopProjectMediaFiles,
	deleteDesktopMediaAssetFile,
	findDesktopMediaAssetFile,
	saveDesktopMediaAssetFile,
} from "@/desktop/media-library/server";
import { ApiRequest, ApiResponse } from "@/platform/http";
import fs from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
	id: z.string().min(1).optional(),
	name: z.string().min(1).optional(),
	projectId: z.string().min(1),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_media_library_disabled",
			message: "Media library folders are only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

function getRequestUrl(request: ApiRequest | Request): URL {
	return request instanceof ApiRequest ? request.requestUrl : new URL(request.url);
}

function parseQuery(request: ApiRequest | Request) {
	const url = getRequestUrl(request);
	const parsed = querySchema.safeParse({
		id: url.searchParams.get("id") ?? undefined,
		name: url.searchParams.get("name") ?? undefined,
		projectId: url.searchParams.get("projectId") ?? undefined,
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

export async function GET(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const query = parseQuery(request);
	if (query.error) return query.error;
	if (!query.value?.id) {
		return ApiResponse.json({ error: "Missing media id" }, { status: 400 });
	}

	const file = await findDesktopMediaAssetFile({
		assetId: query.value.id,
		projectId: query.value.projectId,
	});
	if (!file) {
		return ApiResponse.json({ error: "Media file not found" }, { status: 404 });
	}

	const bytes = await fs.readFile(file.filePath);
	return new Response(bytes, {
		headers: {
			"Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
			"Content-Length": String(file.size),
			"Content-Type": file.type,
			"X-Shotlyx-Filename": encodeURIComponent(file.name),
		},
	});
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const query = parseQuery(request);
	if (query.error) return query.error;
	if (!query.value?.id) {
		return ApiResponse.json({ error: "Missing media id" }, { status: 400 });
	}
	if (!query.value.name) {
		return ApiResponse.json({ error: "Missing media name" }, { status: 400 });
	}

	const blob = await request.blob();
	if (blob.size <= 0) {
		return ApiResponse.json({ error: "Media file is empty" }, { status: 400 });
	}
	const saved = await saveDesktopMediaAssetFile({
		assetId: query.value.id,
		blob,
		name: query.value.name,
		projectId: query.value.projectId,
	});
	return ApiResponse.json({
		id: query.value.id,
		...saved,
	});
}

export async function DELETE(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const query = parseQuery(request);
	if (query.error) return query.error;
	if (query.value?.id) {
		await deleteDesktopMediaAssetFile({
			assetId: query.value.id,
			projectId: query.value.projectId,
		});
		return ApiResponse.json({ ok: true });
	}

	await clearDesktopProjectMediaFiles({ projectId: query.value.projectId });
	return ApiResponse.json({ ok: true });
}
