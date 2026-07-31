import {
	cancelShotlyxMGJob,
	getShotlyxMGJobStatus,
} from "@/shotlyx/remotion-components/jobs";
import type { ApiRequest } from "@/platform/http";

export const runtime = "nodejs";

// Next.js route handlers use the framework positional signature.
// eslint-disable-next-line shotlyx/prefer-object-params
export async function DELETE(
	_request: ApiRequest,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	const status = getShotlyxMGJobStatus({ jobId });
	if (!status) {
		return new Response(JSON.stringify({ error: "Shotlyx MG job not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	cancelShotlyxMGJob({ jobId });

	return Response.json({
		jobId,
		status: getShotlyxMGJobStatus({ jobId }) ?? status,
	});
}
