import type { ModelMessage, Tool } from "ai";

export type { ModelMessage, Tool };

export interface StreamingOptions {
	onChunk?: (chunk: string) => void;
	onFinish?: (fullText: string) => void;
	onError?: (error: Error) => void;
}
