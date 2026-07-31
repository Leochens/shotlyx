import { detectLocalCliAgents } from "@/agent/local-cli/runtime";
import { applyDesktopConfigToProcessEnv, isDesktopMode } from "@/desktop/config/server";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse() {
	return ApiResponse.json(
		{
			error:
				"desktop_agents_disabled: start Shotlyx with SHOTLYX_DESKTOP=1 to scan local CLIs",
		},
		{ status: 404 },
	);
}

export async function GET() {
	if (!isDesktopMode()) return disabledResponse();
	applyDesktopConfigToProcessEnv();
	const agents = await detectLocalCliAgents();
	return ApiResponse.json({
		desktop: true,
		agents,
	});
}
