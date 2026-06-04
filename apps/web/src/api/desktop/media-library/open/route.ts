import { isDesktopMode } from "@/desktop/config/server";
import { openDesktopMediaLibraryDirectory } from "@/desktop/media-library/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_media_library_disabled",
			message: "Media library folders are only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

export async function POST() {
	if (!isDesktopMode()) return disabledResponse();
	const result = await openDesktopMediaLibraryDirectory();
	return ApiResponse.json({
		desktop: true,
		...result,
	});
}
