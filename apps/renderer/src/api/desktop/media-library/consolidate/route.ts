import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import { consolidateDesktopMediaAsset } from "@/desktop/media-library/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
	id: z.string().min(1),
	projectId: z.string().min(1),
});

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) {
		return ApiResponse.json(
			{ error: "desktop_media_library_disabled" },
			{ status: 403 },
		);
	}
	const url =
		request instanceof ApiRequest ? request.requestUrl : new URL(request.url);
	const parsed = querySchema.safeParse({
		id: url.searchParams.get("id"),
		projectId: url.searchParams.get("projectId"),
	});
	if (!parsed.success) {
		return ApiResponse.json({ error: "Invalid input" }, { status: 400 });
	}
	return ApiResponse.json(
		await consolidateDesktopMediaAsset({
			assetId: parsed.data.id,
			projectId: parsed.data.projectId,
		}),
	);
}
