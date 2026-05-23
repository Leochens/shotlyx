import { describe, expect, test } from "bun:test";
import { AgentSessionManager } from "@/core/managers/agent-session-manager";

describe("Batch undo", () => {
	test("session manager starts and ends sessions", () => {
		const manager = new AgentSessionManager();
		expect(manager.isInSession()).toBe(false);

		const sessionId = manager.startSession();
		expect(sessionId).toBeTruthy();
		expect(manager.isInSession()).toBe(true);
		expect(manager.getCurrentSession()).toBe(sessionId);

		manager.endSession();
		expect(manager.isInSession()).toBe(false);
		expect(manager.getCurrentSession()).toBeNull();
	});

	test("each session gets a unique id", () => {
		const manager = new AgentSessionManager();
		const id1 = manager.startSession();
		manager.endSession();
		const id2 = manager.startSession();
		expect(id1).not.toBe(id2);
	});

	test("supports multiple sessions", () => {
		const manager = new AgentSessionManager();
		const id1 = manager.startSession();
		const id2 = manager.startSession();

		expect(manager.getAllSessions()).toContain(id1);
		expect(manager.getAllSessions()).toContain(id2);
		expect(manager.getAllSessions().length).toBe(2);
	});

	test("switches between sessions", () => {
		const manager = new AgentSessionManager();
		const id1 = manager.startSession();
		const id2 = manager.startSession();

		expect(manager.getCurrentSession()).toBe(id2);

		manager.switchSession(id1);
		expect(manager.getCurrentSession()).toBe(id1);

		manager.switchSession(id2);
		expect(manager.getCurrentSession()).toBe(id2);
	});

	test("ends a specific session", () => {
		const manager = new AgentSessionManager();
		const id1 = manager.startSession();
		const id2 = manager.startSession();

		expect(manager.getAllSessions().length).toBe(2);

		manager.endSession(id1);
		expect(manager.getAllSessions()).not.toContain(id1);
		expect(manager.getAllSessions()).toContain(id2);
	});

	test("ends active session when no id given", () => {
		const manager = new AgentSessionManager();
		const id1 = manager.startSession();
		manager.endSession();
		const id2 = manager.startSession();

		expect(manager.getCurrentSession()).toBe(id2);

		manager.endSession();
		expect(manager.getCurrentSession()).toBeNull();
		expect(manager.isInSession()).toBe(false);
	});

	test("records commands to a session", () => {
		const manager = new AgentSessionManager();
		const id = manager.startSession();
		manager.recordCommand(id, "cmd-1");
		manager.recordCommand(id, "cmd-2");
		expect(manager.getSessionCommands(id)).toEqual(["cmd-1", "cmd-2"]);
	});
});
