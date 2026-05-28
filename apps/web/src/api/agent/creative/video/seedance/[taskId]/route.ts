import { getSeedanceVideoTask } from "@/agent/tools/creative/seedance-video-provider";
import { ApiResponse } from "@/platform/http";

export const runtime = "nodejs";

// eslint-disable-next-line shotlyx/prefer-object-params
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ taskId: string }> },
) {
	const { taskId } = await params;
	if (!taskId) {
		return ApiResponse.json({ error: "Missing taskId" }, { status: 400 });
	}

	try {
		const result = await getSeedanceVideoTask({ taskId });
		return ApiResponse.json(result);
	} catch (error) {
		const message =
			error instanceof Error &&
			(error.message.startsWith("configuration_error") ||
				error.message.startsWith("provider_error"))
				? error.message
				: "provider_error";
		const status = message.startsWith("configuration_error") ? 500 : 502;
		return ApiResponse.json({ error: message }, { status });
	}
}
