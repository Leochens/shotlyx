import { abortDesktopExportTarget } from "@/desktop/export/server";
import { isDesktopMode } from "@/desktop/config/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_export_disabled",
			message: "Desktop export files are only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

export async function POST(request: Request) {
	if (!isDesktopMode()) return disabledResponse();

	const targetId = request.headers.get("X-Shotlyx-Export-Target");
	if (!targetId) {
		return ApiResponse.json(
			{ error: "desktop_export_missing_target" },
			{ status: 400 },
		);
	}

	await abortDesktopExportTarget({ targetId });
	return ApiResponse.json({ desktop: true, aborted: true });
}
