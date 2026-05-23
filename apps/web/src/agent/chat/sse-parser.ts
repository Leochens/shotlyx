export interface SSEEvent {
	event: string;
	data: string;
}

export type SSECallback = (event: SSEEvent) => void;

export function parseSSEStream({
	stream,
	onEvent,
	onComplete,
	onError,
}: {
	stream: ReadableStream<Uint8Array>;
	onEvent: SSECallback;
	onComplete?: () => void;
	onError?: (error: Error) => void;
}): AbortController {
	const abort = new AbortController();
	const decoder = new TextDecoder();
	let buffer = "";

	(async () => {
		try {
			const reader = stream.getReader();
			abort.signal.addEventListener(
				"abort",
				() => {
					void reader.cancel();
				},
				{ once: true },
			);
			while (!abort.signal.aborted) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				let currentEvent = "";
				let currentData = "";

				for (const line of lines) {
					if (line.startsWith("event: ")) {
						currentEvent = line.slice(7).trim();
					} else if (line.startsWith("data: ")) {
						currentData = line.slice(6);
					} else if (line === "" && currentData) {
						onEvent({
							event: currentEvent || "message",
							data: currentData,
						});
						currentEvent = "";
						currentData = "";
					}
				}
			}
			onComplete?.();
		} catch (err) {
			if (!abort.signal.aborted) {
				onError?.(err instanceof Error ? err : new Error(String(err)));
			}
		}
	})();

	return abort;
}
