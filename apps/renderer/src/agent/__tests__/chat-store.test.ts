import { describe, expect, test, beforeEach } from "bun:test";
import { useChatStore } from "@/agent/chat/store";

describe("Chat store", () => {
	beforeEach(() => {
		useChatStore.setState(useChatStore.getState().clearAll());
	});

	test("adds messages to active session", () => {
		useChatStore.getState().addMessage({
			id: "1",
			role: "user",
			content: "hello",
			timestamp: Date.now(),
		});
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
	});

	test("changes mode", () => {
		useChatStore.getState().setMode("auto");
		expect(useChatStore.getState().mode).toBe("auto");
	});

	test("clears messages in active session", () => {
		useChatStore
			.getState()
			.addMessage({ id: "1", role: "user", content: "x", timestamp: 0 });
		useChatStore.getState().clearSessionMessages();
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(0);
	});

	test("removes a message by id from active session", () => {
		useChatStore
			.getState()
			.addMessage({ id: "1", role: "user", content: "a", timestamp: 1 });
		useChatStore
			.getState()
			.addMessage({ id: "2", role: "user", content: "b", timestamp: 2 });
		useChatStore.getState().removeMessage("1");
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].id).toBe("2");
	});

	test("updates message content in active session", () => {
		useChatStore
			.getState()
			.addMessage({ id: "1", role: "assistant", content: "", timestamp: 1 });
		useChatStore
			.getState()
			.updateMessageContent({ id: "1", content: "updated" });
		const msg = useChatStore
			.getState()
			.getActiveMessages()
			.find((m) => m.id === "1");
		expect(msg?.content).toBe("updated");
	});

	test("updates message actions in active session", () => {
		useChatStore
			.getState()
			.addMessage({ id: "1", role: "assistant", content: "", timestamp: 1 });
		useChatStore.getState().updateMessageActions({
			id: "1",
			actions: [
				{
					id: "option-layout-dense",
					label: "信息密集",
					variant: "primary",
					isOption: true,
				},
			],
		});
		const msg = useChatStore
			.getState()
			.getActiveMessages()
			.find((m) => m.id === "1");
		expect(msg?.actions?.[0]?.label).toBe("信息密集");
	});

	test("updates message clarification in active session", () => {
		useChatStore
			.getState()
			.addMessage({ id: "1", role: "assistant", content: "", timestamp: 1 });
		useChatStore.getState().updateMessageClarification({
			id: "1",
			clarification: {
				id: "agent-video-angle",
				title: "确认呈现角度",
				question: "这条 AI agent 视频更想强调哪一层？",
				targetSlot: "video.angle",
				blocking: true,
				allowOther: true,
				options: [],
			},
		});
		const msg = useChatStore
			.getState()
			.getActiveMessages()
			.find((m) => m.id === "1");
		expect(msg?.clarification?.id).toBe("agent-video-angle");
	});

	test("sets streaming message id", () => {
		useChatStore.getState().setStreamingMessageId("stream-1");
		expect(useChatStore.getState().streamingMessageId).toBe("stream-1");
	});

	test("keeps loading and streaming state isolated per session", () => {
		const state = useChatStore.getState();
		const firstSessionId = state.activeSessionId;
		if (firstSessionId === null) throw new Error("firstSessionId is null");
		state.createSession("Second Session");
		const secondSessionId = useChatStore.getState().activeSessionId;
		if (secondSessionId === null) throw new Error("secondSessionId is null");

		useChatStore.getState().switchSession(firstSessionId);
		useChatStore.getState().setLoading(true, firstSessionId);
		useChatStore.getState().setStreamingMessageId("stream-first", firstSessionId);

		useChatStore.getState().switchSession(secondSessionId);
		expect(useChatStore.getState().isLoading).toBe(false);
		expect(useChatStore.getState().streamingMessageId).toBeNull();

		useChatStore.getState().switchSession(firstSessionId);
		expect(useChatStore.getState().isLoading).toBe(true);
		expect(useChatStore.getState().streamingMessageId).toBe("stream-first");
	});

	test("restores legacy project chat when entering a scoped workbench session", () => {
		useChatStore.getState().setActiveProject("project-a");
		useChatStore.getState().addMessage({
			id: "legacy-message",
			role: "user",
			content: "旧项目聊天",
			timestamp: 1,
		});
		const legacySessionId = useChatStore.getState().activeSessionId;
		if (legacySessionId === null) throw new Error("legacySessionId is null");

		useChatStore.getState().setActiveProject("project-a::topic");

		const scopedState = useChatStore.getState();
		expect(scopedState.getActiveSession()?.projectId).toBe("project-a::topic");
		expect(scopedState.getActiveMessages()[0]?.content).toBe("旧项目聊天");
		expect(
			scopedState.sessions.some(
				(session) =>
					session.id === legacySessionId && session.projectId === "project-a",
			),
		).toBe(true);

		const scopedSessionCount = scopedState.sessions.filter(
			(session) => session.projectId === "project-a::topic",
		).length;
		useChatStore.getState().setActiveProject("project-a::topic");
		expect(
			useChatStore
				.getState()
				.sessions.filter((session) => session.projectId === "project-a::topic"),
		).toHaveLength(scopedSessionCount);
	});

	test("replaces an empty scoped session with restored legacy chat", () => {
		useChatStore.setState({
			sessions: [
				{
					id: "legacy-session",
					projectId: "project-b",
					name: "旧会话",
					createdAt: 1,
					updatedAt: 2,
					messages: [
						{
							id: "legacy-message",
							role: "assistant",
							content: "重启前的回答",
							timestamp: 2,
						},
					],
				},
				{
					id: "empty-scoped-session",
					projectId: "project-b::topic",
					name: "新会话",
					createdAt: 3,
					updatedAt: 3,
					messages: [],
				},
			],
			activeProjectId: "project-b::topic",
			activeSessionId: "empty-scoped-session",
			isHydrated: true,
		});

		useChatStore.getState().setActiveProject("project-b::topic");

		const state = useChatStore.getState();
		expect(state.getActiveMessages()[0]?.content).toBe("重启前的回答");
		expect(
			state.sessions.some((session) => session.id === "empty-scoped-session"),
		).toBe(false);
	});

	test("creates a new session and switches to it", () => {
		const state = useChatStore.getState();
		const initialSessionId = state.activeSessionId;
		state.createSession("Test Session");
		const newState = useChatStore.getState();
		expect(newState.sessions).toHaveLength(2);
		expect(newState.activeSessionId).not.toBe(initialSessionId);
		expect(newState.getActiveSession()?.name).toBe("Test Session");
	});

	test("switches between sessions", () => {
		const state = useChatStore.getState();
		state.createSession("Session A");
		const sessionAId = useChatStore.getState().activeSessionId;
		state.createSession("Session B");
		const sessionBId = useChatStore.getState().activeSessionId;

		if (sessionAId === null) throw new Error("sessionAId is null");
		if (sessionBId === null) throw new Error("sessionBId is null");

		useChatStore.getState().switchSession(sessionAId);
		expect(useChatStore.getState().activeSessionId).toBe(sessionAId);

		useChatStore.getState().switchSession(sessionBId);
		expect(useChatStore.getState().activeSessionId).toBe(sessionBId);
	});

	test("isolates messages between sessions", () => {
		const state = useChatStore.getState();
		state.addMessage({
			id: "1",
			role: "user",
			content: "in default",
			timestamp: 1,
		});
		state.createSession("New Session");
		state.addMessage({
			id: "2",
			role: "user",
			content: "in new",
			timestamp: 2,
		});

		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].content).toBe(
			"in new",
		);

		const defaultSession = useChatStore.getState().sessions[0];
		useChatStore.getState().switchSession(defaultSession.id);
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].content).toBe(
			"in default",
		);
	});

	test("deletes a session and switches to remaining session", () => {
		const state = useChatStore.getState();
		state.createSession("Session A");
		const sessionAId = useChatStore.getState().activeSessionId;
		state.createSession("Session B");
		const sessionBId = useChatStore.getState().activeSessionId;

		if (sessionBId === null) throw new Error("sessionBId is null");

		useChatStore.getState().deleteSession(sessionBId);
		const newState = useChatStore.getState();
		// clearAll creates a default session, so we have default + Session A = 2
		expect(newState.sessions).toHaveLength(2);
		expect(newState.activeSessionId).toBe(sessionAId);
	});

	test("renames a session", () => {
		const state = useChatStore.getState();
		state.createSession("Old Name");
		const sessionId = useChatStore.getState().activeSessionId;
		if (sessionId === null) throw new Error("sessionId is null");
		useChatStore.getState().renameSession(sessionId, "New Name");
		expect(useChatStore.getState().getActiveSession()?.name).toBe("New Name");
	});

	test("clears messages for a specific session", () => {
		const state = useChatStore.getState();
		state.addMessage({ id: "1", role: "user", content: "msg", timestamp: 1 });
		state.createSession("Other");
		const otherSessionId = useChatStore.getState().activeSessionId;
		state.addMessage({
			id: "2",
			role: "user",
			content: "other msg",
			timestamp: 2,
		});

		if (otherSessionId === null) throw new Error("otherSessionId is null");

		useChatStore.getState().clearSessionMessages(otherSessionId);
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(0);

		const defaultSession = useChatStore.getState().sessions[0];
		expect(defaultSession.messages).toHaveLength(1);
	});

	test("adds message to specific session via sessionId", () => {
		const state = useChatStore.getState();
		state.createSession("Target");
		const targetId = useChatStore.getState().activeSessionId;
		state.switchSession(useChatStore.getState().sessions[0].id);

		if (targetId === null) throw new Error("targetId is null");

		useChatStore
			.getState()
			.addMessage(
				{ id: "1", role: "user", content: "targeted", timestamp: 1 },
				targetId,
			);
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(0);

		useChatStore.getState().switchSession(targetId);
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].content).toBe(
			"targeted",
		);
	});

	test("isolates sessions by project", () => {
		const state = useChatStore.getState();
		state.setActiveProject("project-a");
		state.addMessage({
			id: "project-a-message",
			role: "user",
			content: "Project A",
			timestamp: 1,
		});

		state.setActiveProject("project-b");
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(0);
		useChatStore.getState().addMessage({
			id: "project-b-message",
			role: "user",
			content: "Project B",
			timestamp: 2,
		});

		useChatStore.getState().setActiveProject("project-a");
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].content).toBe(
			"Project A",
		);

		useChatStore.getState().setActiveProject("project-b");
		expect(useChatStore.getState().getActiveMessages()).toHaveLength(1);
		expect(useChatStore.getState().getActiveMessages()[0].content).toBe(
			"Project B",
		);
	});

	test("does not create an empty project session before persistence hydrates", () => {
		useChatStore.setState({
			sessions: [],
			activeSessionId: null,
			activeProjectId: "default-project",
			isHydrated: false,
		});

		useChatStore.getState().setActiveProject("project-a");

		expect(useChatStore.getState().sessions).toHaveLength(0);
		expect(useChatStore.getState().activeSessionId).toBeNull();
		expect(useChatStore.getState().activeProjectId).toBe("default-project");
	});
});
