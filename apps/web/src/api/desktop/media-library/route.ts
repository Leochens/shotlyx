import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import {
	changeDesktopMediaLibraryDirectory,
	getDesktopMediaLibraryStatus,
} from "@/desktop/media-library/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	directory: z.string().min(1),
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

export async function GET(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const projectId = getRequestUrl(request).searchParams.get("projectId") ?? undefined;
	const status = await getDesktopMediaLibraryStatus({ projectId });
	return ApiResponse.json({
		desktop: true,
		...status,
	});
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
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

	await changeDesktopMediaLibraryDirectory({ directory: parsed.data.directory });
	const status = await getDesktopMediaLibraryStatus();
	return ApiResponse.json({
		desktop: true,
		...status,
	});
}
