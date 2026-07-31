/* eslint-disable shotlyx/prefer-object-params -- HTTP route handlers follow the request/context contract. */
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { isDesktopMode } from "@/desktop/config/server";
import { getSelectedDesktopMediaFile } from "@/desktop/media-library/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	if (!isDesktopMode()) {
		return ApiResponse.json(
			{ error: "desktop_media_library_disabled" },
			{ status: 403 },
		);
	}
	const { id } = await context.params;
	const file = await getSelectedDesktopMediaFile({ id });
	if (!file) {
		return ApiResponse.json(
			{ error: "Selected file expired" },
			{ status: 404 },
		);
	}
	return new Response(Readable.toWeb(createReadStream(file.filePath)), {
		headers: {
			"Content-Length": String(file.size),
			"Content-Type": file.type,
			"X-Shotlyx-Filename": encodeURIComponent(file.name),
			"X-Shotlyx-Source-Path": encodeURIComponent(file.filePath),
		},
	});
}
