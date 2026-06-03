import { describe, expect, test } from "bun:test";
import { parseSSEStream, type SSEEvent } from "./sse-parser";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

describe("parseSSEStream", () => {
	test("preserves event names when a frame is split across chunks", async () => {
		const events: SSEEvent[] = [];

		await new Promise<void>((resolve, reject) => {
			parseSSEStream({
				stream: streamFromChunks([
					"event: init\n",
					'data: {"sessionId":"s1"}\n\n',
					"event: tool-call\n",
					'data: {"callId":"c1","tool":"topic_set_candidates"}\n\n',
				]),
				onEvent: (event) => events.push(event),
				onComplete: resolve,
				onError: reject,
			});
		});

		expect(events).toEqual([
			{ event: "init", data: '{"sessionId":"s1"}' },
			{
				event: "tool-call",
				data: '{"callId":"c1","tool":"topic_set_candidates"}',
			},
		]);
	});
});
