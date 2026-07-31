import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import { selectDesktopExportTarget } from "@/desktop/export/server";
import { EXPORT_FORMAT_VALUES } from "@/export";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	format: z.enum(EXPORT_FORMAT_VALUES),
	suggestedName: z.string().min(1),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error: "desktop_export_disabled",
			message: "Desktop export targets are only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

export async function POST(request: Request) {
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

	const selection = await selectDesktopExportTarget(parsed.data);
	return ApiResponse.json({
		desktop: true,
		...selection,
	});
}
