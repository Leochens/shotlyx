/* eslint-disable shotlyx/prefer-object-params -- HTTP route handlers follow the request/context contract. */
import { isDesktopMode } from "@/desktop/config/server";
import {
	clearDesktopProjectMediaMetadata,
	deleteDesktopProjectMediaMetadata,
	getDesktopProjectMediaMetadata,
	listDesktopProjectMediaMetadata,
	saveDesktopProjectMediaMetadata,
} from "@/desktop/project-library/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RouteContext = {
	params: Promise<{ projectId: string }>;
};

function disabledResponse() {
	return ApiResponse.json(
		{ error: "desktop_projects_disabled" },
		{ status: 403 },
	);
}

function getAssetId(request: ApiRequest | Request): string | null {
	const url =
		request instanceof ApiRequest ? request.requestUrl : new URL(request.url);
	return url.searchParams.get("id");
}

export async function GET(
	request: ApiRequest | Request,
	context: RouteContext,
) {
	if (!isDesktopMode()) return disabledResponse();
	const { projectId } = await context.params;
	const assetId = getAssetId(request);
	if (assetId) {
		const asset = await getDesktopProjectMediaMetadata({ assetId, projectId });
		return asset
			? ApiResponse.json({ asset })
			: ApiResponse.json({ error: "Media not found" }, { status: 404 });
	}
	return ApiResponse.json({
		assets: await listDesktopProjectMediaMetadata({ projectId }),
	});
}

export async function POST(
	request: ApiRequest | Request,
	context: RouteContext,
) {
	if (!isDesktopMode()) return disabledResponse();
	const { projectId } = await context.params;
	const value = (await request.json()) as unknown;
	if (!isRecord(value)) {
		return ApiResponse.json(
			{ error: "Invalid media metadata" },
			{ status: 400 },
		);
	}
	await saveDesktopProjectMediaMetadata({
		asset: value,
		projectId,
	});
	return ApiResponse.json({ ok: true });
}

export async function DELETE(
	request: ApiRequest | Request,
	context: RouteContext,
) {
	if (!isDesktopMode()) return disabledResponse();
	const { projectId } = await context.params;
	const assetId = getAssetId(request);
	if (assetId) {
		await deleteDesktopProjectMediaMetadata({ assetId, projectId });
	} else {
		await clearDesktopProjectMediaMetadata({ projectId });
	}
	return ApiResponse.json({ ok: true });
}
