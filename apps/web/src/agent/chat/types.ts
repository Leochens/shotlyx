import type {
	AgentPlan,
	ClarificationRequest,
	MessageAction,
	ToolCallRecord,
} from "@/agent/controller/types";
import type { AgentContextReference } from "@/agent/context/types";

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
	id: string;
	role: ChatMessageRole;
	content: string;
	thought?: string;
	msgType?: "thinking" | "text" | "tool";
	clarification?: ClarificationRequest;
	actions?: MessageAction[];
	attachments?: Array<{
		id: string;
		name: string;
		url: string;
		type: "image" | "video" | "audio";
	}>;
	references?: AgentContextReference[];
	toolCalls?: ToolCallRecord[];
	timestamp: number;
	hidden?: boolean;
	error?: {
		message: string;
		category: string;
		isRetryable: boolean;
	};
}

export type ExecutionMode = "auto" | "suggest" | "manual";

export interface ChatSession {
	id: string;
	projectId: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	messages: ChatMessage[];
}

export interface ChatState {
	sessions: ChatSession[];
	activeSessionId: string | null;
	activeProjectId: string;
	isLoading: boolean;
	mode: ExecutionMode;
	selectedAgent: string;
	pendingPlan: AgentPlan | null;
	streamingMessageId: string | null;
	getActiveSession: () => ChatSession | null;
	getActiveMessages: () => ChatMessage[];
	setActiveProject: (projectId: string) => void;
	createSession: (name?: string) => void;
	switchSession: (id: string) => void;
	deleteSession: (id: string) => void;
	renameSession: (id: string, name: string) => void;
	clearSessionMessages: (sessionId?: string) => void;
	addMessage: (msg: ChatMessage, sessionId?: string) => void;
	removeMessage: (id: string, sessionId?: string) => void;
	setLoading: (loading: boolean) => void;
	setMode: (mode: ExecutionMode) => void;
	setSelectedAgent: (agent: string) => void;
	setPendingPlan: (plan: AgentPlan | null) => void;
	setStreamingMessageId: (id: string | null) => void;
	updateMessageContent: (
		args: { id: string; content: string },
		sessionId?: string,
	) => void;
	updateMessageThought: (
		args: { id: string; thought: string },
		sessionId?: string,
	) => void;
	updateMessageActions: (
		args: { id: string; actions?: MessageAction[] },
		sessionId?: string,
	) => void;
	updateMessageClarification: (
		args: { id: string; clarification?: ClarificationRequest },
		sessionId?: string,
	) => void;
	updateMessageToolCalls: (
		args: { id: string; toolCalls: ToolCallRecord[] },
		sessionId?: string,
	) => void;
	clearMessages: () => void;
	clearAll: () => ChatState;
}
