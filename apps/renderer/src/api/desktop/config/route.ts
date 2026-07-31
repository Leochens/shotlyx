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
import { isDesktopSecretStorageAvailable } from "@/desktop/config/safe-storage";

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
		secretStorage: {
			available: isDesktopSecretStorageAvailable(),
			provider: "electron-safe-storage",
		},
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

	let config: ReturnType<typeof mergeDesktopApiConfig>;
	try {
		config = mergeDesktopApiConfig({
			values: parsed.data.values,
			clear: parsed.data.clear,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "desktop_safe_storage_unavailable"
		) {
			return ApiResponse.json(
				{
					error:
						"Secure credential storage is unavailable on this operating system.",
				},
				{ status: 503 },
			);
		}
		throw error;
	}
	applyDesktopConfigToProcessEnv();
	return responseFor({ values: config.values, updatedAt: config.updatedAt });
}
