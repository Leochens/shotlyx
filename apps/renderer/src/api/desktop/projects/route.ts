import { isDesktopMode } from "@/desktop/config/server";
import {
	listDesktopProjects,
	saveDesktopProject,
} from "@/desktop/project-library/server";
import { ApiRequest, ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function disabledResponse() {
	return ApiResponse.json(
		{ error: "desktop_projects_disabled" },
		{ status: 403 },
	);
}

export async function GET() {
	if (!isDesktopMode()) return disabledResponse();
	const documents = await listDesktopProjects();
	return ApiResponse.json({
		projects: documents.map((document) => document.project),
	});
}

export async function POST(request: ApiRequest | Request) {
	if (!isDesktopMode()) return disabledResponse();
	const value = (await request.json()) as unknown;
	if (!isRecord(value)) {
		return ApiResponse.json({ error: "Invalid project" }, { status: 400 });
	}
	const document = await saveDesktopProject({ project: value });
	return ApiResponse.json({ project: document.project });
}
