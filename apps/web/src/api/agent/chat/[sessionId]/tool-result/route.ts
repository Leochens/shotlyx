import { type ApiRequest, ApiResponse } from "@/platform/http";
import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import { resolveToolCall } from "../../resolve";

export const runtime = "nodejs";

// Next route handlers require this positional signature.
// eslint-disable-next-line shotlyx/prefer-object-params
export async function POST(
	request: ApiRequest,
	{ params }: { params: Promise<{ sessionId: string }> },
) {
	const { sessionId } = await params;

	let body: { callId?: string; result?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	if (!body.callId) {
		return ApiResponse.json({ error: "Missing callId" }, { status: 400 });
	}

	const toolName = body.callId.replace(/_\d+_[a-z0-9]+$/, "");
	const resolution = resolveToolCall({
		sessionId,
		callId: body.callId,
		result: sanitizeToolResultForModel({
			toolName,
			result: body.result,
		}),
	});

	if (resolution.status === "queued") {
		console.warn(
			`[agent] tool-result queued before pending registration session=${sessionId} callId=${body.callId}`,
		);
		return ApiResponse.json({ ok: true, queued: true }, { status: 202 });
	}

	return ApiResponse.json({ ok: true });
}
