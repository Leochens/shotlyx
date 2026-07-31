/* eslint-disable shotlyx/prefer-object-params -- HTTP route handlers follow the request/context contract. */
import { isDesktopMode } from "@/desktop/config/server";
import {
	deleteDesktopProject,
	loadDesktopProject,
} from "@/desktop/project-library/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
	params: Promise<{ projectId: string }>;
};

function disabledResponse() {
	return ApiResponse.json(
		{ error: "desktop_projects_disabled" },
		{ status: 403 },
	);
}

export async function GET(_request: Request, context: RouteContext) {
	if (!isDesktopMode()) return disabledResponse();
	const { projectId } = await context.params;
	const document = await loadDesktopProject({ projectId });
	if (!document) {
		return ApiResponse.json({ error: "Project not found" }, { status: 404 });
	}
	return ApiResponse.json({ project: document.project });
}

export async function DELETE(_request: Request, context: RouteContext) {
	if (!isDesktopMode()) return disabledResponse();
	const { projectId } = await context.params;
	await deleteDesktopProject({ projectId });
	return ApiResponse.json({ ok: true });
}
