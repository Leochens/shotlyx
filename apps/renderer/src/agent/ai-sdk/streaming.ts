import type { StreamTextResult, Tool } from "ai";
import type { StreamingOptions } from "./types";

export async function consumeTextStream(
	result: StreamTextResult<Record<string, Tool>, never>,
	options?: StreamingOptions,
): Promise<string> {
	let fullText = "";
	try {
		for await (const chunk of result.textStream) {
			fullText += chunk;
			options?.onChunk?.(chunk);
		}
		options?.onFinish?.(fullText);
		return fullText;
	} catch (error) {
		options?.onError?.(error as Error);
		throw error;
	}
}

export async function consumeFullStream(
	result: StreamTextResult<Record<string, Tool>, never>,
	options?: {
		onText?: (text: string) => void;
		onToolCall?: (toolCall: unknown) => void;
		onFinish?: () => void;
		onError?: (error: Error) => void;
	},
): Promise<void> {
	try {
		for await (const part of result.fullStream) {
			if (part.type === "text-delta") {
				options?.onText?.(part.text);
			} else if (part.type === "tool-call") {
				options?.onToolCall?.(part);
			}
		}
		options?.onFinish?.();
	} catch (error) {
		options?.onError?.(error as Error);
		throw error;
	}
}
