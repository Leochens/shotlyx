import { isDesktopMode } from "@/desktop/config/server";
import { writeDesktopExportTargetChunk } from "@/desktop/export/server";
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

function errorStatus({ error }: { error: unknown }): number {
	if (!(error instanceof Error)) return 500;
	if (error.message === "desktop_export_target_not_found") return 404;
	if (
		error.message === "desktop_export_invalid_position" ||
		error.message === "desktop_export_empty_chunk"
	) {
		return 400;
	}
	return 500;
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

	const rawPosition = request.headers.get("X-Shotlyx-Export-Position");
	const position = rawPosition === null ? NaN : Number(rawPosition);

	try {
		const chunk = await request.arrayBuffer();
		const result = await writeDesktopExportTargetChunk({
			chunk,
			position,
			targetId,
		});
		return ApiResponse.json({
			desktop: true,
			...result,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown export error";
		return ApiResponse.json(
			{
				error: message,
				message,
			},
			{ status: errorStatus({ error }) },
		);
	}
}
