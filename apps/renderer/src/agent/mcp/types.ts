import type { ErrorCategory } from "./error-classification";

export type ToolEffect = "read" | "write" | "destructive" | "external";
export type ToolConfirmation = "never" | "always" | "explicit-user-intent";

export interface ToolPolicy {
	effect: ToolEffect;
	confirmation: ToolConfirmation;
	idempotent: boolean;
}

export interface ToolParameter {
	type: "string" | "number" | "boolean" | "array" | "object";
	description: string;
	optional?: boolean;
	items?: ToolParameter;
	properties?: Record<string, ToolParameter>;
}

export interface Tool {
	name: string;
	description: string;
	parameters: Record<string, ToolParameter>;
	handler: (
		params: Record<string, unknown>,
		context?: ToolExecutionContext,
	) => unknown;
	mutating?: boolean;
	effect?: ToolEffect;
	confirmation?: ToolConfirmation;
	idempotent?: boolean;
	preconditions?: (params: Record<string, unknown>) => PreconditionResult;
}

export interface ToolExecutionContext {
	signal?: AbortSignal;
	onProgress?: (event: ToolProgressEvent) => void;
}

export interface ToolProgressEvent {
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
}

export interface PreconditionResult {
	ok: boolean;
	error?: string;
	suggestion?: string;
}

export interface ToolResultData {
	message?: string;
	changes?: Array<{
		type: "added" | "removed" | "updated" | "moved";
		target: string;
		id?: string;
	}>;
	state?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ToolResult {
	status: "success" | "error";
	data?: unknown;
	error?: string;
	errorCategory?: ErrorCategory;
	suggestion?: string;
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
}

export interface ToolCall {
	tool: string;
	params: Record<string, unknown>;
}
