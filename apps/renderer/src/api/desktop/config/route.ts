import { DESKTOP_API_GROUPS } from "@/desktop/config/catalog";
import {
	applyDesktopConfigToProcessEnv,
	getDesktopConfigPath,
	getDesktopConfigStatus,
	getPublicDesktopApiValues,
	isDesktopMode,
	mergeDesktopApiConfig,
	readDesktopApiConfig,
	type DesktopApiValues,
} from "@/desktop/config/server";
import { type ApiRequest, ApiResponse } from "@/platform/http";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
	values: z.record(z.string(), z.string()).default({}),
	clear: z.array(z.string()).optional().default([]),
});

function disabledResponse() {
	return ApiResponse.json(
		{
			error:
				"desktop_config_disabled: start Shotlyx with SHOTLYX_DESKTOP=1 to use local API configuration",
		},
		{ status: 404 },
	);
}

function responseFor({
	values,
	updatedAt,
}: {
	values: DesktopApiValues;
	updatedAt: string;
}) {
	return ApiResponse.json({
		desktop: true,
		configPath: getDesktopConfigPath(),
		updatedAt,
		groups: DESKTOP_API_GROUPS,
		values: getPublicDesktopApiValues(values),
		status: getDesktopConfigStatus(values),
	});
}

export async function GET() {
	if (!isDesktopMode()) return disabledResponse();
	applyDesktopConfigToProcessEnv();
	const config = readDesktopApiConfig();
	return responseFor({ values: config.values, updatedAt: config.updatedAt });
}

export async function POST(request: ApiRequest) {
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

	const config = mergeDesktopApiConfig({
		values: parsed.data.values,
		clear: parsed.data.clear,
	});
	applyDesktopConfigToProcessEnv();
	return responseFor({ values: config.values, updatedAt: config.updatedAt });
}
