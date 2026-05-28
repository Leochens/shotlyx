interface PendingCall {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface QueuedToolResult {
	result: unknown;
	timer: ReturnType<typeof setTimeout>;
}

interface PendingToolCallRegistry {
	pendingCalls: Map<string, PendingCall>;
	queuedResults: Map<string, QueuedToolResult>;
}

declare global {
	var __shotlyxAgentPendingToolCalls: PendingToolCallRegistry | undefined;
}

const QUEUED_RESULT_TTL_MS = 30000;

function getRegistry(): PendingToolCallRegistry {
	if (!globalThis.__shotlyxAgentPendingToolCalls) {
		globalThis.__shotlyxAgentPendingToolCalls = {
			pendingCalls: new Map(),
			queuedResults: new Map(),
		};
	}
	return globalThis.__shotlyxAgentPendingToolCalls;
}

function getPendingCallKey({
	sessionId,
	callId,
}: {
	sessionId: string;
	callId: string;
}): string {
	return `${sessionId}:${callId}`;
}

export function registerPendingCall({
	sessionId,
	callId,
	timeoutMs,
}: {
	sessionId: string;
	callId: string;
	timeoutMs: number;
}): Promise<unknown> {
	const key = getPendingCallKey({ sessionId, callId });
	const registry = getRegistry();
	const queued = registry.queuedResults.get(key);
	if (queued) {
		clearTimeout(queued.timer);
		registry.queuedResults.delete(key);
		return Promise.resolve(queued.result);
	}

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			registry.pendingCalls.delete(key);
			reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		registry.pendingCalls.set(key, { resolve, reject, timer });
	});
}

export type ResolveToolCallStatus = "resolved" | "queued";

export function resolveToolCall({
	sessionId,
	callId,
	result,
}: {
	sessionId: string;
	callId: string;
	result: unknown;
}): { status: ResolveToolCallStatus } {
	const key = getPendingCallKey({ sessionId, callId });
	const registry = getRegistry();
	const pending = registry.pendingCalls.get(key);
	if (!pending) {
		const existing = registry.queuedResults.get(key);
		if (existing) {
			clearTimeout(existing.timer);
		}
		const timer = setTimeout(() => {
			registry.queuedResults.delete(key);
		}, QUEUED_RESULT_TTL_MS);
		registry.queuedResults.set(key, { result, timer });
		return { status: "queued" };
	}
	clearTimeout(pending.timer);
	pending.resolve(result);
	registry.pendingCalls.delete(key);
	return { status: "resolved" };
}

export function clearPendingToolCallsForTests(): void {
	const registry = getRegistry();
	for (const pending of registry.pendingCalls.values()) {
		clearTimeout(pending.timer);
	}
	for (const queued of registry.queuedResults.values()) {
		clearTimeout(queued.timer);
	}
	registry.pendingCalls.clear();
	registry.queuedResults.clear();
}
