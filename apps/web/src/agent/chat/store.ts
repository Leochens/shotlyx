/* eslint-disable shotlyx/prefer-object-params */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "./indexeddb-storage";
import type { ChatSession, ChatState, ExecutionMode } from "./types";

interface PersistedChatState {
	sessions: ChatSession[];
	activeSessionId: string | null;
	activeProjectId: string;
	mode: ExecutionMode;
	selectedAgent: string;
}

const DEFAULT_CHAT_PROJECT_ID = "default-project";

function getLegacyStorage() {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getStorage() {
	return createIndexedDBPersistStorage<PersistedChatState>({
		dbName: "shotlyx-agent-chat",
		storeName: "chat-state",
		legacyStorage: getLegacyStorage(),
	});
}

function createDefaultSession({
	projectId = DEFAULT_CHAT_PROJECT_ID,
}: {
	projectId?: string;
} = {}): ChatSession {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		projectId,
		name: "新会话",
		createdAt: now,
		updatedAt: now,
		messages: [],
	};
}

function getTargetSession(
	sessions: ChatSession[],
	activeSessionId: string | null,
	sessionId?: string,
): ChatSession | undefined {
	const targetId = sessionId ?? activeSessionId;
	if (targetId === null) return undefined;
	return sessions.find((s) => s.id === targetId);
}

function getSessionProjectId(session: ChatSession): string {
	return session.projectId ?? DEFAULT_CHAT_PROJECT_ID;
}

function getProjectSessions({
	sessions,
	projectId,
}: {
	sessions: ChatSession[];
	projectId: string;
}): ChatSession[] {
	return sessions.filter((session) => getSessionProjectId(session) === projectId);
}

const initialState: Omit<
	ChatState,
	| "getActiveSession"
	| "getActiveMessages"
	| "setActiveProject"
	| "createSession"
	| "switchSession"
	| "deleteSession"
	| "renameSession"
	| "clearSessionMessages"
	| "addMessage"
	| "removeMessage"
	| "setLoading"
	| "setMode"
	| "setSelectedAgent"
	| "setPendingPlan"
	| "setStreamingMessageId"
	| "updateMessageContent"
	| "updateMessageThought"
	| "updateMessageActions"
	| "updateMessageClarification"
	| "updateMessageToolCalls"
	| "updateMessageTokenUsage"
	| "clearMessages"
	| "clearAll"
> = {
	sessions: [],
	activeSessionId: null,
	activeProjectId: DEFAULT_CHAT_PROJECT_ID,
	isLoading: false,
	mode: "auto",
	selectedAgent: "default",
	pendingPlan: null,
	streamingMessageId: null,
};

export const useChatStore = create<ChatState>()(
	persist(
		(set, get) => ({
			...initialState,

			getActiveSession: () => {
				const { sessions, activeSessionId, activeProjectId } = get();
				if (activeSessionId === null) return null;
				const session = sessions.find((s) => s.id === activeSessionId) ?? null;
				if (!session || getSessionProjectId(session) !== activeProjectId) {
					return null;
				}
				return session;
			},

			getActiveMessages: () => {
				const session = get().getActiveSession();
				return session?.messages ?? [];
			},

			setActiveProject: (projectId) => {
				set((state) => {
					const normalizedProjectId = projectId || DEFAULT_CHAT_PROJECT_ID;
					const currentActive = state.sessions.find(
						(session) => session.id === state.activeSessionId,
					);
					if (
						currentActive &&
						getSessionProjectId(currentActive) === normalizedProjectId &&
						state.activeProjectId === normalizedProjectId
					) {
						return state;
					}

					const projectSessions = getProjectSessions({
						sessions: state.sessions,
						projectId: normalizedProjectId,
					});
					if (projectSessions.length > 0) {
						const nextActive =
							projectSessions.toSorted((a, b) => a.updatedAt - b.updatedAt).at(-1) ??
							projectSessions[0];
						return {
							activeProjectId: normalizedProjectId,
							activeSessionId: nextActive.id,
							pendingPlan: null,
							streamingMessageId: null,
						};
					}

					const newSession = createDefaultSession({
						projectId: normalizedProjectId,
					});
					return {
						sessions: [...state.sessions, newSession],
						activeProjectId: normalizedProjectId,
						activeSessionId: newSession.id,
						pendingPlan: null,
						streamingMessageId: null,
					};
				});
			},

			createSession: (name) => {
				const now = Date.now();
				const projectId = get().activeProjectId;
				const newSession: ChatSession = {
					id: crypto.randomUUID(),
					projectId,
					name: name ?? "新会话",
					createdAt: now,
					updatedAt: now,
					messages: [],
				};
				set((state) => ({
					sessions: [...state.sessions, newSession],
					activeSessionId: newSession.id,
					pendingPlan: null,
					streamingMessageId: null,
				}));
			},

			switchSession: (id) => {
				set((state) => {
					const session = state.sessions.find((item) => item.id === id);
					if (!session) return state;
					return {
						activeProjectId: getSessionProjectId(session),
						activeSessionId: id,
						pendingPlan: null,
						streamingMessageId: null,
					};
				});
			},

			deleteSession: (id) => {
				set((state) => {
					const filtered = state.sessions.filter((s) => s.id !== id);
					if (filtered.length === 0) {
						const replacement = createDefaultSession({
							projectId: state.activeProjectId,
						});
						return {
							sessions: [replacement],
							activeSessionId: replacement.id,
							pendingPlan: null,
							streamingMessageId: null,
						};
					}
					const activeProjectSessions = getProjectSessions({
						sessions: filtered,
						projectId: state.activeProjectId,
					});
					if (activeProjectSessions.length === 0) {
						const replacement = createDefaultSession({
							projectId: state.activeProjectId,
						});
						return {
							sessions: [...filtered, replacement],
							activeSessionId: replacement.id,
							pendingPlan: null,
							streamingMessageId: null,
						};
					}
					const newActive =
						state.activeSessionId === id
							? activeProjectSessions[activeProjectSessions.length - 1].id
							: state.activeSessionId;
					return {
						sessions: filtered,
						activeSessionId: newActive,
						pendingPlan: null,
						streamingMessageId: null,
					};
				});
			},

			renameSession: (id, name) => {
				set((state) => ({
					sessions: state.sessions.map((s) =>
						s.id === id ? { ...s, name, updatedAt: Date.now() } : s,
					),
				}));
			},

			clearSessionMessages: (sessionId) => {
				set((state) => {
					const targetId = sessionId ?? state.activeSessionId;
					if (targetId === null) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === targetId
								? { ...s, messages: [], updatedAt: Date.now() }
								: s,
						),
						pendingPlan: null,
						streamingMessageId: null,
					};
				});
			},

			addMessage: (msg, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: [...s.messages, msg],
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			removeMessage: (id, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.filter((m) => m.id !== id),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			setLoading: (loading) => set({ isLoading: loading }),
			setMode: (mode) => set({ mode }),
			setSelectedAgent: (agent) => set({ selectedAgent: agent }),
			setPendingPlan: (plan) => set({ pendingPlan: plan }),
			setStreamingMessageId: (id) => set({ streamingMessageId: id }),

			updateMessageContent: ({ id, content }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, content } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			updateMessageThought: ({ id, thought }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, thought } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			updateMessageActions: ({ id, actions }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, actions } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			updateMessageClarification: ({ id, clarification }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, clarification } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			updateMessageToolCalls: ({ id, toolCalls }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, toolCalls } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			updateMessageTokenUsage: ({ id, tokenUsage }, sessionId) => {
				set((state) => {
					const target = getTargetSession(
						state.sessions,
						state.activeSessionId,
						sessionId,
					);
					if (target === undefined) return state;
					return {
						sessions: state.sessions.map((s) =>
							s.id === target.id
								? {
										...s,
										messages: s.messages.map((m) =>
											m.id === id ? { ...m, tokenUsage } : m,
										),
										updatedAt: Date.now(),
									}
								: s,
						),
					};
				});
			},

			clearMessages: () => {
				get().clearSessionMessages();
			},

			clearAll: () => {
				const replacement = createDefaultSession();
				set({
					sessions: [replacement],
					activeSessionId: replacement.id,
					activeProjectId: replacement.projectId,
					isLoading: false,
					mode: "auto",
					selectedAgent: "default",
					pendingPlan: null,
					streamingMessageId: null,
				});
				return get();
			},
		}),
		{
			name: "shotlyx-chat-v2",
			version: 2,
			storage: getStorage(),
			partialize: (state) => ({
				sessions: state.sessions,
				activeSessionId: state.activeSessionId,
				activeProjectId: state.activeProjectId,
				mode: state.mode,
				selectedAgent: state.selectedAgent,
			}),
		},
	),
);
