export class AgentSessionManager {
	private sessions: Map<string, string[]> = new Map();
	private activeSessionId: string | null = null;

	startSession(id?: string): string {
		const sessionId =
			id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
		this.sessions.set(sessionId, []);
		this.activeSessionId = sessionId;
		return sessionId;
	}

	endSession(sessionId?: string): void {
		const target = sessionId ?? this.activeSessionId;
		if (target === null) {
			return;
		}
		this.sessions.delete(target);
		if (this.activeSessionId === target) {
			this.activeSessionId = null;
		}
	}

	switchSession(sessionId: string): void {
		if (!this.sessions.has(sessionId)) {
			throw new Error(`Session ${sessionId} does not exist`);
		}
		this.activeSessionId = sessionId;
	}

	getCurrentSession(): string | null {
		return this.activeSessionId;
	}

	isInSession(): boolean {
		return this.activeSessionId !== null;
	}

	getAllSessions(): string[] {
		return Array.from(this.sessions.keys());
	}

	recordCommand(sessionId: string, commandId: string): void {
		const commands = this.sessions.get(sessionId);
		if (commands === undefined) {
			throw new Error(`Session ${sessionId} does not exist`);
		}
		commands.push(commandId);
	}

	getSessionCommands(sessionId: string): string[] {
		const commands = this.sessions.get(sessionId);
		if (commands === undefined) {
			throw new Error(`Session ${sessionId} does not exist`);
		}
		return commands;
	}
}
