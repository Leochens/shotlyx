import { z } from "zod";
import { readMediaAnalysisImageAsDataUrl } from "@/desktop/media/analyze";
import { isDesktopMode } from "@/desktop/config/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({
	imagePath: z.string().min(1),
	name: z.string().min(1).optional(),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_media_keyframe_disabled",
			message:
				"Keyframe image reads are only available in Shotlyx desktop mode.",
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

export async function GET(request: ApiRequest | Request) {
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

	const image = await readMediaAnalysisImageAsDataUrl({
		imagePath: parsed.data.imagePath,
	});
	return ApiResponse.json({
		...image,
		name: parsed.data.name ?? image.name,
	});
}
