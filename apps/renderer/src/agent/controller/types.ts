import type { AgentTokenUsageTotals } from "@/agent/token-usage";

export type AgentRole = "user" | "assistant" | "system";

export type ExecutionMode = "auto" | "suggest" | "manual";

export type Complexity = "simple" | "medium" | "complex";

export interface ToolProgressRecord {
	stage: string;
	label: string;
	status: "running" | "success" | "error";
	detail?: string;
	current?: number;
	total?: number;
	jobId?: string;
	taskId?: string;
	taskLabel?: string;
	taskIndex?: number;
	timestamp?: number;
}

export interface ToolCallRecord {
	callId?: string;
	tool: string;
	params: Record<string, unknown>;
	progress?: ToolProgressRecord[];
	result?: {
		status: "success" | "error";
		data?: unknown;
		error?: string;
		verified?: boolean;
		verification?: {
			changes: Array<{
				type: "added" | "removed" | "updated";
				target: string;
				detail?: string;
			}>;
			expectation?: {
				description: string;
				satisfied: boolean;
			};
		};
	};
}

export interface AgentMessage {
	id: string;
	role: AgentRole;
	content: string;
	thought?: string;
	clarification?: ClarificationRequest;
	actions?: MessageAction[];
	attachments?: Attachment[];
	toolCalls?: ToolCallRecord[];
	tokenUsage?: AgentTokenUsageTotals;
	hidden?: boolean;
	timestamp: number;
}

export interface ClarificationOption {
	id: string;
	label: string;
	value: string;
	description?: string;
	recommended?: boolean;
}

export interface ClarificationRequest {
	id: string;
	title: string;
	question: string;
	reason?: string;
	options: ClarificationOption[];
	allowOther: boolean;
	blocking: true;
	targetSlot: string;
}

export interface MessageAction {
	id: string;
	label: string;
	variant: "primary" | "secondary" | "danger";
	value?: string;
	description?: string;
	isOption?: boolean;
}

export interface Attachment {
	id: string;
	name: string;
	url: string;
	type: "image" | "video" | "audio";
}

export interface AgentStep {
	tool: string;
	params: Record<string, unknown>;
	description: string;
	risk: "none" | "destructive" | "irreversible";
}

export interface AgentPlan {
	complexity: Complexity;
	reasoning: string;
	response?: string;
	steps: AgentStep[];
	needsConfirmation: boolean;
	actions?: MessageAction[];
}
