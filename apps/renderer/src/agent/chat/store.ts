/* eslint-disable shotlyx/prefer-object-params */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "./indexeddb-storage";
import { recoverInterruptedToolCalls } from "./interrupted-tool-calls";
import type {
	ChatMessage,
	ChatSession,
	ChatSessionRunState,
	ChatState,
	ExecutionMode,
} from "./types";

interface PersistedChatState {
	sessions: ChatSession[];
	activeSessionId: string | null;
	activeProjectId: string;
	mode: ExecutionMode;
	selectedAgent: string;
}

const DEFAULT_CHAT_PROJECT_ID = "default-project";
const CHAT_WORKBENCH_PROJECT_SEPARATOR = "::";
const CHAT_STORAGE_WRITE_DEBOUNCE_MS = 350;
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

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
		setItemDebounceMs: CHAT_STORAGE_WRITE_DEBOUNCE_MS,
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
	return sessions.filter(
		(session) => getSessionProjectId(session) === projectId,
	);
}

function getLegacyProjectIdForScopedProject({
	projectId,
}: {
	projectId: string;
}): string | null {
	const separatorIndex = projectId.indexOf(CHAT_WORKBENCH_PROJECT_SEPARATOR);
	if (separatorIndex <= 0) return null;
	return projectId.slice(0, separatorIndex);
}

function hasConversation(session: ChatSession): boolean {
	return session.messages.length > 0;
}

function isEmptyAutoSession(session: ChatSession): boolean {
	return session.messages.length === 0 && session.name === "新会话";
}

function cloneLegacySessionForScopedProject({
	session,
	projectId,
}: {
	session: ChatSession;
	projectId: string;
}): ChatSession {
	return {
		...session,
		id: `${session.id}${CHAT_WORKBENCH_PROJECT_SEPARATOR}${projectId}`,
		projectId,
	};
}

function restoreLegacySessionsForScopedProject({
	sessions,
	projectId,
}: {
	sessions: ChatSession[];
	projectId: string;
}): ChatSession[] {
	const legacyProjectId = getLegacyProjectIdForScopedProject({ projectId });
	if (!legacyProjectId) return sessions;

	const scopedSessions = getProjectSessions({ sessions, projectId });
	if (scopedSessions.some(hasConversation)) return sessions;

	const legacySessions = getProjectSessions({
		sessions,
		projectId: legacyProjectId,
	}).filter(hasConversation);
	if (legacySessions.length === 0) return sessions;

	const clonedSessions = legacySessions.map((session) =>
		cloneLegacySessionForScopedProject({ session, projectId }),
	);
	const clonedIds = new Set(clonedSessions.map((session) => session.id));
	return [
		...sessions.filter(
			(session) =>
				!clonedIds.has(session.id) &&
				!(
					getSessionProjectId(session) === projectId &&
					isEmptyAutoSession(session)
				),
		),
		...clonedSessions,
	];
}

const EMPTY_RUN_STATE: ChatSessionRunState = {
	isLoading: false,
	pendingPlan: null,
	streamingMessageId: null,
};

function getRunStateForSession({
	runStatesBySessionId,
	sessionId,
}: {
	runStatesBySessionId: Record<string, ChatSessionRunState>;
	sessionId: string | null | undefined;
}): ChatSessionRunState {
	if (!sessionId) return EMPTY_RUN_STATE;
	return runStatesBySessionId[sessionId] ?? EMPTY_RUN_STATE;
}

const initialState: Omit<
	ChatState,
	| "getActiveSession"
	| "getActiveMessages"
	| "getSessionMessages"
	| "getSessionRunState"
	| "setIsHydrated"
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
	isHydrated: typeof window === "undefined",
	isLoading: false,
	mode: "auto",
	selectedAgent: "default",
	pendingPlan: null,
	streamingMessageId: null,
	runStatesBySessionId: {},
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
				return session?.messages ?? EMPTY_CHAT_MESSAGES;
			},

			getSessionMessages: (sessionId) => {
				if (!sessionId) return EMPTY_CHAT_MESSAGES;
				return (
					get().sessions.find((session) => session.id === sessionId)
						?.messages ?? EMPTY_CHAT_MESSAGES
				);
			},

			getSessionRunState: (sessionId) => {
				const state = get();
				return getRunStateForSession({
					runStatesBySessionId: state.runStatesBySessionId,
					sessionId: sessionId ?? state.activeSessionId,
				});
			},

			setIsHydrated: (isHydrated) => set({ isHydrated }),

			setActiveProject: (projectId) => {
				set((state) => {
					if (!state.isHydrated) return state;

					const normalizedProjectId = projectId || DEFAULT_CHAT_PROJECT_ID;
					const sessions = restoreLegacySessionsForScopedProject({
						sessions: state.sessions,
						projectId: normalizedProjectId,
					});
					const didRestoreLegacySessions = sessions !== state.sessions;
					const currentActive = sessions.find(
						(session) => session.id === state.activeSessionId,
					);
					if (
						!didRestoreLegacySessions &&
						currentActive &&
						getSessionProjectId(currentActive) === normalizedProjectId &&
						state.activeProjectId === normalizedProjectId
					) {
						return state;
					}

					const projectSessions = getProjectSessions({
						sessions,
						projectId: normalizedProjectId,
					});
					if (projectSessions.length > 0) {
						const nextActive =
							projectSessions
								.toSorted((a, b) => a.updatedAt - b.updatedAt)
								.at(-1) ?? projectSessions[0];
						return {
							sessions,
							activeProjectId: normalizedProjectId,
							activeSessionId: nextActive.id,
							...getRunStateForSession({
								runStatesBySessionId: state.runStatesBySessionId,
								sessionId: nextActive.id,
							}),
						};
					}

					const newSession = createDefaultSession({
						projectId: normalizedProjectId,
					});
					return {
						sessions: [...sessions, newSession],
						activeProjectId: normalizedProjectId,
						activeSessionId: newSession.id,
						...EMPTY_RUN_STATE,
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
					...EMPTY_RUN_STATE,
				}));
			},

			switchSession: (id) => {
				set((state) => {
					const session = state.sessions.find((item) => item.id === id);
					if (!session) return state;
					return {
						activeProjectId: getSessionProjectId(session),
						activeSessionId: id,
						...getRunStateForSession({
							runStatesBySessionId: state.runStatesBySessionId,
							sessionId: id,
						}),
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
							runStatesBySessionId: {},
							...EMPTY_RUN_STATE,
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
							runStatesBySessionId: Object.fromEntries(
								Object.entries(state.runStatesBySessionId).filter(
									([sessionId]) => sessionId !== id,
								),
							),
							...EMPTY_RUN_STATE,
						};
					}
					const newActive =
						state.activeSessionId === id
							? activeProjectSessions[activeProjectSessions.length - 1].id
							: state.activeSessionId;
					return {
						sessions: filtered,
						activeSessionId: newActive,
						runStatesBySessionId: Object.fromEntries(
							Object.entries(state.runStatesBySessionId).filter(
								([sessionId]) => sessionId !== id,
							),
						),
						...getRunStateForSession({
							runStatesBySessionId: state.runStatesBySessionId,
							sessionId: newActive,
						}),
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
						runStatesBySessionId: {
							...state.runStatesBySessionId,
							[targetId]: EMPTY_RUN_STATE,
						},
						...(targetId === state.activeSessionId ? EMPTY_RUN_STATE : {}),
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

			setLoading: (loading, sessionId) =>
				set((state) => {
					const targetId = sessionId ?? state.activeSessionId;
					if (!targetId) return { isLoading: loading };
					const currentRunState = getRunStateForSession({
						runStatesBySessionId: state.runStatesBySessionId,
						sessionId: targetId,
					});
					const nextRunState = {
						...currentRunState,
						isLoading: loading,
					};
					return {
						runStatesBySessionId: {
							...state.runStatesBySessionId,
							[targetId]: nextRunState,
						},
						...(targetId === state.activeSessionId
							? { isLoading: loading }
							: {}),
					};
				}),
			setMode: (mode) => set({ mode }),
			setSelectedAgent: (agent) => set({ selectedAgent: agent }),
			setPendingPlan: (plan, sessionId) =>
				set((state) => {
					const targetId = sessionId ?? state.activeSessionId;
					if (!targetId) return { pendingPlan: plan };
					const currentRunState = getRunStateForSession({
						runStatesBySessionId: state.runStatesBySessionId,
						sessionId: targetId,
					});
					const nextRunState = {
						...currentRunState,
						pendingPlan: plan,
					};
					return {
						runStatesBySessionId: {
							...state.runStatesBySessionId,
							[targetId]: nextRunState,
						},
						...(targetId === state.activeSessionId
							? { pendingPlan: plan }
							: {}),
					};
				}),
			setStreamingMessageId: (id, sessionId) =>
				set((state) => {
					const targetId = sessionId ?? state.activeSessionId;
					if (!targetId) return { streamingMessageId: id };
					const currentRunState = getRunStateForSession({
						runStatesBySessionId: state.runStatesBySessionId,
						sessionId: targetId,
					});
					const nextRunState = {
						...currentRunState,
						streamingMessageId: id,
					};
					return {
						runStatesBySessionId: {
							...state.runStatesBySessionId,
							[targetId]: nextRunState,
						},
						...(targetId === state.activeSessionId
							? { streamingMessageId: id }
							: {}),
					};
				}),

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
					runStatesBySessionId: {},
				});
				return get();
			},
		}),
		{
			name: "shotlyx-chat-v2",
			version: 2,
			storage: getStorage(),
			merge: (persistedState, currentState) => {
				const persisted =
					typeof persistedState === "object" && persistedState !== null
						? (persistedState as Partial<PersistedChatState>)
						: {};
				return {
					...currentState,
					...persisted,
					sessions: recoverInterruptedToolCalls(
						persisted.sessions ?? currentState.sessions,
					),
				};
			},
			onRehydrateStorage: () => (state) => {
				state?.setIsHydrated(true);
			},
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
