import {
	getShotlyxMGJobStatus,
	subscribeShotlyxMGJob,
} from "@/shotlyx/remotion-components/jobs";
import type { ApiRequest } from "@/platform/http";

export const runtime = "nodejs";

// Next.js route handlers use the framework positional signature.
// eslint-disable-next-line shotlyx/prefer-object-params
export async function GET(
	request: ApiRequest,
	{ params }: { params: Promise<{ jobId: string }> },
) {
	const { jobId } = await params;
	if (!getShotlyxMGJobStatus({ jobId })) {
		return new Response(JSON.stringify({ error: "Shotlyx MG job not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	}

	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;
	let shouldUnsubscribe = false;
	let closed = false;

	const stream = new ReadableStream({
		start(controller) {
			const close = () => {
				if (closed) return;
				closed = true;
				try {
					controller.close();
				} catch {
					// The client may have disconnected first.
				}
				if (unsubscribe) {
					unsubscribe();
				} else {
					shouldUnsubscribe = true;
				}
			};
			const send = (event: unknown) => {
				if (closed) return;
				controller.enqueue(
					encoder.encode(
						`event: job-event\ndata: ${JSON.stringify(event)}\n\n`,
					),
				);
				if (
					typeof event === "object" &&
					event !== null &&
					"type" in event &&
					(event.type === "completed" ||
						event.type === "cancelled" ||
						event.type === "error")
				) {
					close();
				}
			};

			unsubscribe = subscribeShotlyxMGJob({
				jobId,
				onEvent: send,
			});
			if (shouldUnsubscribe) {
				unsubscribe();
			}
			request.signal.addEventListener("abort", close, { once: true });
		},
		cancel() {
			closed = true;
			unsubscribe?.();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
