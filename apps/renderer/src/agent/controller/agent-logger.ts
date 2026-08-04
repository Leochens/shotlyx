/* eslint-disable shotlyx/prefer-object-params -- Logger methods mirror compact event fields at call sites. */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function resolveAgentLogDirectory({
	env = process.env,
	cwd = process.cwd(),
}: {
	env?: Record<string, string | undefined>;
	cwd?: string;
} = {}): string {
	const explicitDirectory = env.SHOTLYX_AGENT_LOG_DIR?.trim();
	if (explicitDirectory) return explicitDirectory;
	const desktopConfigPath = env.SHOTLYX_DESKTOP_CONFIG_PATH?.trim();
	if (desktopConfigPath) {
		return join(dirname(desktopConfigPath), "logs", "agent");
	}
	if (env.SHOTLYX_DESKTOP === "1" || env.VITE_SHOTLYX_DESKTOP === "1") {
		return join(env.HOME ?? homedir(), ".shotlyx", "logs", "agent");
	}
	return join(cwd, "agent-dev", "logs");
}

function ensureDir(logDirectory: string) {
	try {
		mkdirSync(logDirectory, { recursive: true });
	} catch {
		// Logging remains best-effort when the directory is unavailable.
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
		const logDirectory = resolveAgentLogDirectory();
		ensureDir(logDirectory);
		this.filePath = join(logDirectory, `agent-${date}.log`);
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

	tokenUsage(usage: unknown) {
		this.write({
			type: "token-usage",
			direction: "internal",
			payload: usage,
			elapsedMs: Date.now() - this.startTime,
		});
	}

	stateTransition(transition: unknown) {
		this.write({
			type: "state-transition",
			direction: "internal",
			payload: transition,
			elapsedMs: Date.now() - this.startTime,
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
