import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = join(process.cwd(), "agent-dev", "logs");

function ensureDir() {
	try {
		mkdirSync(LOG_DIR, { recursive: true });
	} catch {
		// directory already exists
	}
}

export interface LogEntry {
	ts: string;
	sessionId: string;
	type: string;
	direction: "in" | "out" | "internal";
	payload: unknown;
	elapsedMs?: number;
}

export class AgentLogger {
	private sessionId: string;
	private filePath: string;
	private startTime: number;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
		this.startTime = Date.now();
		const date = new Date().toISOString().slice(0, 10);
		ensureDir();
		this.filePath = join(LOG_DIR, `agent-${date}.log`);
	}

	request(body: unknown) {
		this.write({ type: "request", direction: "in", payload: body });
	}

	textDelta(text: string) {
		this.write({
			type: "text-delta",
			direction: "out",
			payload: { text },
		});
	}

	reasoningDelta(text: string) {
		this.write({
			type: "reasoning-delta",
			direction: "out",
			payload: { text },
		});
	}

	toolCall(callId: string, tool: string, params: unknown) {
		this.write({
			type: "tool-call",
			direction: "out",
			payload: { callId, tool, params },
		});
	}

	toolResult(callId: string, result: unknown) {
		this.write({
			type: "tool-result",
			direction: "in",
			payload: { callId, result },
			elapsedMs: Date.now() - this.startTime,
		});
	}

	plan(planData: unknown) {
		this.write({
			type: "plan",
			direction: "out",
			payload: planData,
		});
	}

	done() {
		this.write({
			type: "done",
			direction: "out",
			payload: {},
			elapsedMs: Date.now() - this.startTime,
		});
	}

	error(error: unknown) {
		this.write({
			type: "error",
			direction: "internal",
			payload: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
		});
	}

	private write(entry: Omit<LogEntry, "ts" | "sessionId">) {
		const line: LogEntry = {
			ts: new Date().toISOString(),
			sessionId: this.sessionId,
			...entry,
		};
		try {
			appendFileSync(this.filePath, `${JSON.stringify(line)}\n`);
		} catch {
			// fail silently — logging is best-effort
		}
	}
}
