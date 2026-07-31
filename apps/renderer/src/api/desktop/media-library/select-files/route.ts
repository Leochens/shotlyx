import { isDesktopMode } from "@/desktop/config/server";
import { selectDesktopMediaFiles } from "@/desktop/media-library/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
	if (!isDesktopMode()) {
		return ApiResponse.json(
			{ error: "desktop_media_library_disabled" },
			{ status: 403 },
		);
	}
	return ApiResponse.json(await selectDesktopMediaFiles());
}
