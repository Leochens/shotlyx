"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useChatStore } from "./store";
import { MessageItem } from "./message-item";
import type { ToolActionResult, ToolCallActionRequest } from "./tool-call-card";
import { appendToolProgressEvent } from "./progress-history";
import { AgentModeSelect, BottomToolbar } from "./bottom-toolbar";
import { useEditor } from "@/editor/use-editor";
import { parseSSEStream } from "./sse-parser";
import type { SSEEvent } from "./sse-parser";
import {
	BarChart3,
	BookOpenText,
	Check,
	Copy,
	Gamepad2,
	Lightbulb,
	LineChart,
	Loader2,
	Megaphone,
	Scissors,
	SlidersHorizontal,
	Sparkles,
	Trash2,
	Zap,
	type LucideIcon,
} from "lucide-react";
import type {
	AgentPlan,
	MessageAction,
	ToolCallRecord,
} from "@/agent/controller/types";
import { isClarificationRequest } from "@/agent/controller/clarification";
import { sanitizeToolResultForModel } from "@/agent/controller/tool-result-sanitizer";
import { useAgentContextStore } from "@/agent/context/store";
import type { AgentContextReference } from "@/agent/context/types";
import type { ChatMessage } from "./types";
import type { ToolProgressEvent, ToolResult } from "@/agent/mcp/types";
import type { AgentTokenUsageTotals } from "@/agent/token-usage";
import { resumeShotlyxMGJobInBackground } from "@/agent/tools/creative/creative-tools";
import {
	getShotlyxMGJobDataFromToolCall,
	getRunningShotlyxMGJobIdsFromMessages,
	isRunningShotlyxMGToolCall,
} from "./mg-job-records";
import { formatToolCallForCopy } from "./tool-result-copy";
import { buildToolResultContext } from "./tool-context";
import { useAppLocale } from "@/i18n/use-app-locale";
import {
	isRoughCutReviewResult,
	RoughCutReviewDialog,
} from "./rough-cut-review-dialog";
import type { RoughCutReviewResult } from "@/agent/mcp/rough-cut-tools";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { ExecutionMode } from "./types";

const MODE_CONFIG: Array<{
	mode: ExecutionMode;
	icon: typeof Zap;
}> = [
	{ mode: "auto", icon: Zap },
	{ mode: "suggest", icon: Lightbulb },
	{ mode: "manual", icon: Gamepad2 },
];

function formatElapsed(ms: number): string {
	const totalSec = ms / 1000;
	if (totalSec < 60) {
		return `${totalSec.toFixed(1)}s`;
	}
	const min = Math.floor(totalSec / 60);
	const sec = (totalSec % 60).toFixed(0).padStart(2, "0");
	return `${min}m${sec}s`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	try {
		return JSON.stringify(error);
	} catch {
		return "工具执行失败";
	}
}

function buildClientToolErrorResult({
	error,
	message,
}: {
	error?: unknown;
	message?: string;
}): ToolResult {
	return {
		status: "error",
		error: message ?? getErrorMessage(error),
		errorCategory: "system_error",
		suggestion: "请稍后重试，或先刷新编辑器状态后再执行。",
	};
}

const STARTER_PROMPT_STYLES: Array<{
	icon: LucideIcon;
	iconClassName: string;
}> = [
	{
		icon: Scissors,
		iconClassName:
			"border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-600 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-300",
	},
	{
		icon: Sparkles,
		iconClassName:
			"border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200",
	},
	{
		icon: BarChart3,
		iconClassName:
			"border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-600 dark:border-emerald-300/25 dark:bg-emerald-300/10 dark:text-emerald-300",
	},
	{
		icon: LineChart,
		iconClassName:
			"border-blue-500/20 bg-blue-500/[0.08] text-blue-600 dark:border-blue-300/25 dark:bg-blue-300/10 dark:text-blue-300",
	},
	{
		icon: Megaphone,
		iconClassName:
			"border-rose-500/20 bg-rose-500/[0.08] text-rose-600 dark:border-rose-300/25 dark:bg-rose-300/10 dark:text-rose-300",
	},
	{
		icon: BookOpenText,
		iconClassName:
			"border-violet-500/20 bg-violet-500/[0.08] text-violet-600 dark:border-violet-300/25 dark:bg-violet-300/10 dark:text-violet-300",
	},
];

const STREAM_TEXT_FLUSH_INTERVAL_MS = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): string | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "string" ? nextValue : undefined;
}

function getBooleanField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): boolean | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "boolean" ? nextValue : undefined;
}

function getNumberField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): number | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return typeof nextValue === "number" ? nextValue : undefined;
}

function getTokenCountField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): number {
	const numberValue = getNumberField({ value, key });
	if (
		numberValue === undefined ||
		!Number.isFinite(numberValue) ||
		numberValue < 0
	) {
		return 0;
	}
	return Math.round(numberValue);
}

function getRecordField({
	value,
	key,
}: {
	value: unknown;
	key: string;
}): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined;
	const nextValue = value[key];
	return isRecord(nextValue) ? nextValue : undefined;
}

function patchStockCandidateImportResult({
	data,
	candidateId,
	importData,
}: {
	data: unknown;
	candidateId: string;
	importData: unknown;
}): unknown {
	if (!isRecord(data) || !Array.isArray(data.candidates)) return data;

	return {
		...data,
		candidates: data.candidates.map((candidate) => {
			if (
				!isRecord(candidate) ||
				typeof candidate.id !== "string" ||
				candidate.id !== candidateId
			) {
				return candidate;
			}

			return {
				...candidate,
				mediaAssetId:
					getStringField({ value: importData, key: "mediaAssetId" }) ??
					getStringField({ value: candidate, key: "mediaAssetId" }),
				name:
					getStringField({ value: importData, key: "name" }) ??
					getStringField({ value: candidate, key: "name" }),
				previewUrl:
					getStringField({ value: importData, key: "previewUrl" }) ??
					getStringField({ value: candidate, key: "previewUrl" }),
				thumbnailUrl:
					getStringField({ value: importData, key: "thumbnailUrl" }) ??
					getStringField({ value: candidate, key: "thumbnailUrl" }),
				sizeBytes:
					getNumberField({ value: importData, key: "sizeBytes" }) ??
					getNumberField({ value: candidate, key: "sizeBytes" }),
				width:
					getNumberField({ value: importData, key: "width" }) ??
					getNumberField({ value: candidate, key: "width" }),
				height:
					getNumberField({ value: importData, key: "height" }) ??
					getNumberField({ value: candidate, key: "height" }),
				durationSeconds:
					getNumberField({ value: importData, key: "durationSeconds" }) ??
					getNumberField({ value: candidate, key: "durationSeconds" }),
			};
		}),
	};
}

function cancelShotlyxMGJobs({ jobIds }: { jobIds: string[] }): void {
	void Promise.all(
		jobIds.map(async (jobId) => {
			try {
				await fetch(`/api/agent/creative/mg-jobs/${jobId}`, {
					method: "DELETE",
				});
			} catch {
				// Stopping the chat flow should not be blocked by a best-effort job cancel.
			}
		}),
	);
}

function isStepRisk(
	value: unknown,
): value is AgentPlan["steps"][number]["risk"] {
	return (
		value === "none" || value === "destructive" || value === "irreversible"
	);
}

function isAgentStep(value: unknown): value is AgentPlan["steps"][number] {
	if (!isRecord(value)) return false;
	return (
		typeof value.tool === "string" &&
		isRecord(value.params) &&
		typeof value.description === "string" &&
		isStepRisk(value.risk)
	);
}

function isActionVariant(value: unknown): value is MessageAction["variant"] {
	return value === "primary" || value === "secondary" || value === "danger";
}

function isMessageAction(value: unknown): value is MessageAction {
	if (!isRecord(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.label === "string" &&
		isActionVariant(value.variant) &&
		(value.value === undefined || typeof value.value === "string") &&
		(value.description === undefined ||
			typeof value.description === "string") &&
		(value.isOption === undefined || typeof value.isOption === "boolean")
	);
}

function parsePlanEventData(value: unknown): {
	reasoning?: string;
	steps: AgentPlan["steps"];
	displayContent?: string;
	needsConfirmation?: boolean;
	actions?: MessageAction[];
} | null {
	if (!isRecord(value) || !Array.isArray(value.steps)) return null;
	const steps = value.steps.filter(isAgentStep);
	if (steps.length !== value.steps.length) return null;
	const rawActions = Array.isArray(value.actions) ? value.actions : undefined;
	const actions = rawActions?.filter(isMessageAction);
	if (rawActions && actions?.length !== rawActions.length) return null;

	return {
		reasoning:
			typeof value.reasoning === "string" ? value.reasoning : undefined,
		steps,
		displayContent:
			typeof value.displayContent === "string"
				? value.displayContent
				: undefined,
		needsConfirmation: getBooleanField({ value, key: "needsConfirmation" }),
		actions,
	};
}

function parseTokenUsageEventData(
	value: unknown,
): AgentTokenUsageTotals | null {
	const usage = getRecordField({ value, key: "usage" });
	if (!usage) return null;
	const rawSources = Array.isArray(usage.sources) ? usage.sources : [];
	const sources = rawSources.filter(
		(source): source is AgentTokenUsageTotals["sources"][number] =>
			source === "api" || source === "local-cli",
	);

	return {
		inputTokens: getTokenCountField({ value: usage, key: "inputTokens" }),
		outputTokens: getTokenCountField({ value: usage, key: "outputTokens" }),
		reasoningTokens: getTokenCountField({
			value: usage,
			key: "reasoningTokens",
		}),
		totalTokens: getTokenCountField({ value: usage, key: "totalTokens" }),
		cachedInputTokens: getTokenCountField({
			value: usage,
			key: "cachedInputTokens",
		}),
		cacheWriteTokens: getTokenCountField({
			value: usage,
			key: "cacheWriteTokens",
		}),
		approximate: getBooleanField({ value: usage, key: "approximate" }) ?? false,
		sources,
		updatedAt:
			getTokenCountField({ value: usage, key: "updatedAt" }) || Date.now(),
	};
}

export function ChatPanel() {
	const { copy, locale } = useAppLocale();
	const [input, setInput] = useState("");
	const [showClearConfirm, setShowClearConfirm] = useState(false);
	const [copied, setCopied] = useState(false);
	const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
	const isSelecting = selectedMsgIds.size > 0;
	const runAbortRef = useRef<AbortController | null>(null);
	const streamAbortRef = useRef<AbortController | null>(null);
	const toolAbortControllersRef = useRef<Map<string, AbortController>>(
		new Map(),
	);
	const resumedMGJobsRef = useRef<Set<string>>(new Set());
	const resumedMGJobAbortControllersRef = useRef<Map<string, AbortController>>(
		new Map(),
	);
	const [startTime, setStartTime] = useState<number | null>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const [roughCutReview, setRoughCutReview] =
		useState<RoughCutReviewResult | null>(null);
	const [roughCutReviewOpen, setRoughCutReviewOpen] = useState(false);
	const { draftReferences, clearDraftReferences } = useAgentContextStore();

	useEffect(() => {
		if (startTime === null) return;
		const interval = setInterval(() => {
			setElapsedMs(Date.now() - startTime);
		}, 1_000);
		return () => clearInterval(interval);
	}, [startTime]);

	const {
		getActiveMessages,
		addMessage,
		isLoading,
		setLoading,
		mode,
		setMode,
		selectedAgent,
		setSelectedAgent,
		pendingPlan,
		setPendingPlan,
		streamingMessageId,
		setStreamingMessageId,
		updateMessageContent,
		updateMessageThought,
		updateMessageActions,
		updateMessageClarification,
		updateMessageToolCalls,
		updateMessageTokenUsage,
		activeSessionId,
		isHydrated,
		setActiveProject,
		clearSessionMessages,
		removeMessage,
	} = useChatStore();
	const editor = useEditor();
	const projectId = useEditor(
		(editor) => editor.project.getActiveOrNull()?.metadata.id ?? null,
	);
	const mediaAssetCount = useEditor(
		(editor) =>
			editor.media.getAssets().filter((asset) => !asset.ephemeral).length,
	);
	const messages = getActiveMessages();
	const visibleMessages = useMemo(
		() => messages.filter((msg) => !msg.hidden),
		[messages],
	);
	const toRequestMessage = (
		message: Pick<ChatMessage, "role" | "content" | "toolCalls"> & {
			references?: AgentContextReference[];
		},
	) => ({
		role: message.role,
		content: `${message.content}${buildToolResultContext({
			toolCalls: message.toolCalls,
		})}`,
		references: message.references,
	});

	useEffect(() => {
		if (isHydrated && projectId) {
			setActiveProject(projectId);
		}
	}, [isHydrated, projectId, setActiveProject]);

	useEffect(() => {
		const abortControllers = resumedMGJobAbortControllersRef.current;
		const resumedJobs = resumedMGJobsRef.current;
		return () => {
			for (const controller of abortControllers.values()) {
				controller.abort();
			}
			abortControllers.clear();
			resumedJobs.clear();
		};
	}, []);

	useEffect(() => {
		if (!activeSessionId || isLoading) return;

		for (const message of messages) {
			for (const [toolIndex, toolCall] of (message.toolCalls ?? []).entries()) {
				if (!isRunningShotlyxMGToolCall(toolCall)) continue;
				const jobData = getShotlyxMGJobDataFromToolCall({ toolCall });
				if (!jobData) continue;

				const resumeKey = `${activeSessionId}:${message.id}:${
					toolCall.callId ?? `${jobData.jobId}:${toolIndex}`
				}`;
				if (resumedMGJobsRef.current.has(resumeKey)) continue;

				const abort = new AbortController();
				resumedMGJobsRef.current.add(resumeKey);
				resumedMGJobAbortControllersRef.current.set(resumeKey, abort);

				const appendProgress = (event: ToolProgressEvent) => {
					const session = useChatStore
						.getState()
						.sessions.find((item) => item.id === activeSessionId);
					const currentMessage = session?.messages.find(
						(item) => item.id === message.id,
					);
					if (!currentMessage?.toolCalls) return;

					let didRecordProgress = false;
					const nextToolCalls = currentMessage.toolCalls.map(
						(currentToolCall) => {
							const isSameCall =
								(toolCall.callId &&
									currentToolCall.callId === toolCall.callId) ||
								(!toolCall.callId &&
									currentToolCall.tool === toolCall.tool &&
									JSON.stringify(currentToolCall.params) ===
										JSON.stringify(toolCall.params));
							if (!isSameCall) return currentToolCall;

							const nextProgress = appendToolProgressEvent({
								progress: currentToolCall.progress ?? [],
								event,
							});
							if (nextProgress === currentToolCall.progress) {
								return currentToolCall;
							}
							didRecordProgress = true;

							return {
								...currentToolCall,
								progress: nextProgress,
							};
						},
					);

					if (didRecordProgress) {
						updateMessageToolCalls(
							{ id: message.id, toolCalls: nextToolCalls },
							activeSessionId,
						);
					}

					if (
						event.status === "error" ||
						event.stage === "completed" ||
						event.stage === "complete" ||
						event.stage === "cancelled"
					) {
						resumedMGJobAbortControllersRef.current.delete(resumeKey);
					}
				};

				resumeShotlyxMGJobInBackground({
					editor,
					jobId: jobData.jobId,
					sourcePrompt: jobData.sourcePrompt,
					startTimeSeconds: jobData.startTimeSeconds,
					insertToTimeline: jobData.insertToTimeline,
					signal: abort.signal,
					onProgress: appendProgress,
				});
			}
		}
	}, [activeSessionId, editor, isLoading, messages, updateMessageToolCalls]);

	const handleSSEEvent = ({
		sseEvent,
		accumulated,
		currentAssistantMsgIdRef,
		runSessionIdRef,
		runSignal,
		queueMessageContentUpdate,
		flushMessageContentUpdate,
	}: {
		sseEvent: SSEEvent;
		accumulated: { text: string; thought: string };
		currentAssistantMsgIdRef: { current: string | null };
		runSessionIdRef: { current: string | null };
		runSignal: AbortSignal;
		queueMessageContentUpdate: (args: {
			id: string;
			content: string;
			immediate?: boolean;
		}) => void;
		flushMessageContentUpdate: () => void;
	}) => {
		if (runSignal.aborted) return;
		const data: unknown = JSON.parse(sseEvent.data);

		// Ensure a single assistant message exists for this turn.
		// All content (thinking, text, tool calls) accumulates here.
		const ensureAssistantMessage = (): string => {
			if (!currentAssistantMsgIdRef.current) {
				const mid = `assistant-${Date.now()}`;
				addMessage({
					id: mid,
					role: "assistant",
					content: accumulated.text,
					thought: accumulated.thought,
					timestamp: Date.now(),
				});
				currentAssistantMsgIdRef.current = mid;
				setStreamingMessageId(mid);
			}
			return currentAssistantMsgIdRef.current;
		};

		if (sseEvent.event === "init") {
			runSessionIdRef.current =
				getStringField({ value: data, key: "sessionId" }) ?? null;
			return;
		}

		if (sseEvent.event === "done") {
			flushMessageContentUpdate();
			return;
		}

		if (sseEvent.event === "reasoning-start") {
			ensureAssistantMessage();
			return;
		}

		if (sseEvent.event === "reasoning-delta") {
			const text = getStringField({ value: data, key: "text" }) ?? "";
			accumulated.thought += text;
			const mid = ensureAssistantMessage();
			updateMessageThought({ id: mid, thought: accumulated.thought });
			return;
		}

		if (sseEvent.event === "reasoning-end") {
			return;
		}

		if (sseEvent.event === "text-start") {
			ensureAssistantMessage();
			return;
		}

		if (sseEvent.event === "text-delta") {
			const text = getStringField({ value: data, key: "text" }) ?? "";
			accumulated.text += text;
			const mid = ensureAssistantMessage();
			queueMessageContentUpdate({ id: mid, content: accumulated.text });
			return;
		}

		if (sseEvent.event === "text-end") {
			flushMessageContentUpdate();
			return;
		}

		if (sseEvent.event === "tool-call") {
			const callId = getStringField({ value: data, key: "callId" });
			const tool = getStringField({ value: data, key: "tool" });
			if (!callId || !tool) return;
			const params = getRecordField({ value: data, key: "params" }) ?? {};

			const pendingRecord: ToolCallRecord = { callId, tool, params };
			const mid = ensureAssistantMessage();
			const toolAbort = new AbortController();
			toolAbortControllersRef.current.set(callId, toolAbort);
			const appendToolProgress = (event: ToolProgressEvent) => {
				const updatedMsgs = getActiveMessages();
				const updatedMsg = updatedMsgs.find((m) => m.id === mid);
				let didRecordProgress = false;
				const currentToolCalls = (updatedMsg?.toolCalls ?? []).map((tc) => {
					if (tc.callId !== callId) return tc;
					const nextProgress = appendToolProgressEvent({
						progress: tc.progress ?? [],
						event,
					});
					if (nextProgress === tc.progress) {
						return tc;
					}
					didRecordProgress = true;
					return {
						...tc,
						progress: nextProgress,
					};
				});
				if (!didRecordProgress) return;
				updateMessageToolCalls({
					id: mid,
					toolCalls: currentToolCalls,
				});
			};

			// Append to existing toolCalls on this message
			const currentMsgs = getActiveMessages();
			const currentMsg = currentMsgs.find((m) => m.id === mid);
			const existingToolCalls = currentMsg?.toolCalls ?? [];
			updateMessageToolCalls({
				id: mid,
				toolCalls: [...existingToolCalls, pendingRecord],
			});

			void (async () => {
				let toolResult: ToolResult;
				try {
					if (!editor) {
						toolResult = {
							status: "error",
							error: "编辑器尚未准备好，无法执行工具",
							errorCategory: "state_error",
							suggestion: "请稍后重试，或刷新编辑器后再执行。",
						};
					} else {
						toolResult = await editor.mcp.execute({
							toolName: tool,
							params,
							signal: toolAbort.signal,
							onProgress: appendToolProgress,
						});
					}
				} catch (error) {
					if (runSignal.aborted || toolAbort.signal.aborted) return;
					toolResult = buildClientToolErrorResult({ error });
				}

				if (runSignal.aborted || toolAbort.signal.aborted) return;

				const modelToolResult = sanitizeToolResultForModel({
					toolName: tool,
					result: toolResult,
				});
				if (
					tool === "rough_cut_create_review" &&
					toolResult.status === "success" &&
					isRoughCutReviewResult(toolResult.data)
				) {
					setRoughCutReview(toolResult.data);
					setRoughCutReviewOpen(true);
				}
				const updatedMsgs = getActiveMessages();
				const updatedMsg = updatedMsgs.find((m) => m.id === mid);
				const currentToolCalls = (updatedMsg?.toolCalls ?? []).map((tc) => {
					const isSameCall =
						tc.callId === callId ||
						(tc.callId === undefined &&
							tc.tool === tool &&
							JSON.stringify(tc.params) === JSON.stringify(params) &&
							!tc.result);
					if (isSameCall) {
						return {
							...tc,
							result: {
								status: toolResult.status,
								data: toolResult.data,
								error: toolResult.error,
							},
						} as ToolCallRecord;
					}
					return tc;
				});
				updateMessageToolCalls({
					id: mid,
					toolCalls: currentToolCalls,
				});

				const sid = runSessionIdRef.current;
				if (!sid) return;

				try {
					const response = await fetch(`/api/agent/chat/${sid}/tool-result`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ callId, result: modelToolResult }),
					});
					if (!response.ok) {
						const errorBody = await response.json().catch(() => null);
						const errorDetail =
							getStringField({ value: errorBody, key: "error" }) ??
							`HTTP ${response.status}`;
						throw new Error(`HTTP ${response.status}: ${errorDetail}`);
					}
				} catch (error) {
					if (runSignal.aborted || toolAbort.signal.aborted) return;
					addMessage({
						id: `tool-result-post-error-${Date.now()}`,
						role: "assistant",
						content: `工具 ${tool} 已执行，但结果回传失败：${getErrorMessage(error)}`,
						timestamp: Date.now(),
					});
				}
			})().finally(() => {
				toolAbortControllersRef.current.delete(callId);
			});

			return;
		}

		if (sseEvent.event === "tool-result") {
			return;
		}

		if (sseEvent.event === "token-usage") {
			const usage = parseTokenUsageEventData(data);
			if (!usage || usage.totalTokens <= 0) return;
			const mid = ensureAssistantMessage();
			updateMessageTokenUsage({ id: mid, tokenUsage: usage });
			return;
		}

		if (sseEvent.event === "plan") {
			const planData = parsePlanEventData(data);
			if (!planData) return;

			const plan: AgentPlan = {
				complexity:
					planData.steps.length > 3
						? "complex"
						: planData.steps.length > 1
							? "medium"
							: "simple",
				reasoning: planData.reasoning ?? "",
				steps: planData.steps,
				needsConfirmation: planData.needsConfirmation ?? false,
				actions: planData.actions,
			};

			setPendingPlan(plan);

			if (planData.reasoning) {
				accumulated.thought = planData.reasoning;
				const mid = ensureAssistantMessage();
				updateMessageThought({
					id: mid,
					thought: planData.reasoning,
				});
			}
			if (planData.displayContent) {
				accumulated.text = planData.displayContent;
				const mid = ensureAssistantMessage();
				queueMessageContentUpdate({
					id: mid,
					content: planData.displayContent,
					immediate: true,
				});
			}
			if (planData.actions !== undefined) {
				const mid = ensureAssistantMessage();
				updateMessageActions({
					id: mid,
					actions: planData.actions,
				});
			}
		}
		if (sseEvent.event === "message-actions") {
			const rawActions =
				isRecord(data) && Array.isArray(data.actions)
					? data.actions
					: undefined;
			const actions = rawActions?.filter(isMessageAction);
			if (!rawActions || actions?.length !== rawActions.length) return;
			const mid = ensureAssistantMessage();
			updateMessageActions({ id: mid, actions });
			return;
		}
		if (sseEvent.event === "clarification-request") {
			const clarification = getRecordField({
				value: data,
				key: "clarification",
			});
			if (!isClarificationRequest(clarification)) return;
			const mid = ensureAssistantMessage();
			updateMessageClarification({ id: mid, clarification });
			return;
		}
		if (sseEvent.event === "error") {
			flushMessageContentUpdate();
			const message =
				getStringField({ value: data, key: "message" }) ?? "未知错误";
			const category =
				getStringField({ value: data, key: "category" }) ?? "unknown";
			const isRetryable = category === "network" || category === "rate_limit";

			addMessage({
				id: `error-${Date.now()}`,
				role: "assistant",
				content: "",
				error: { message, category, isRetryable },
				timestamp: Date.now(),
			});

			setLoading(false);
			setStreamingMessageId(null);
			setStartTime(null);
			return;
		}
	};

	const runSSEAgent = async ({
		msgsToSend,
		extra,
	}: {
		msgsToSend: Array<{
			role: string;
			content: string;
			references?: AgentContextReference[];
		}>;
		extra?: { action?: string; plan?: AgentPlan };
	}) => {
		setStartTime(Date.now());
		const runAbort = new AbortController();
		runAbortRef.current = runAbort;

		const accumulated = { text: "", thought: "" };
		const currentAssistantMsgIdRef: { current: string | null } = {
			current: null,
		};
		const runSessionIdRef: { current: string | null } = {
			current: null,
		};
		const pendingContentUpdateRef: {
			id: string | null;
			content: string;
			timer: ReturnType<typeof setTimeout> | null;
		} = {
			id: null,
			content: "",
			timer: null,
		};
		const flushMessageContentUpdate = () => {
			if (pendingContentUpdateRef.timer !== null) {
				clearTimeout(pendingContentUpdateRef.timer);
				pendingContentUpdateRef.timer = null;
			}
			if (pendingContentUpdateRef.id === null) return;
			updateMessageContent({
				id: pendingContentUpdateRef.id,
				content: pendingContentUpdateRef.content,
			});
			pendingContentUpdateRef.id = null;
		};
		const queueMessageContentUpdate = ({
			id,
			content,
			immediate = false,
		}: {
			id: string;
			content: string;
			immediate?: boolean;
		}) => {
			pendingContentUpdateRef.id = id;
			pendingContentUpdateRef.content = content;

			if (immediate) {
				flushMessageContentUpdate();
				return;
			}

			if (pendingContentUpdateRef.timer !== null) return;

			pendingContentUpdateRef.timer = setTimeout(() => {
				flushMessageContentUpdate();
			}, STREAM_TEXT_FLUSH_INTERVAL_MS);
		};

		try {
			const body: Record<string, unknown> = {
				messages: msgsToSend,
				mode,
				toolSchemas: editor.mcp.getToolSchemas(),
				context: {
					activeBrandKit: editor.project.getActiveBrandKit(),
				},
			};

			if (extra?.action) body.action = extra.action;
			if (extra?.plan)
				body.plan = {
					reasoning: extra.plan.reasoning,
					steps: extra.plan.steps.map((s) => ({
						tool: s.tool,
						params: s.params,
						description: s.description,
						risk: s.risk,
					})),
				};

			const response = await fetch("/api/agent/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: runAbort.signal,
			});

			if (!response.ok) {
				const err = await response.json().catch(() => ({ error: "Unknown" }));
				throw new Error(
					getStringField({ value: err, key: "error" }) ??
						`HTTP ${response.status}`,
				);
			}

			const resBody = response.body;
			if (!resBody) throw new Error("No response body");

			await new Promise<void>((resolve, reject) => {
				const streamAbort = parseSSEStream({
					stream: resBody,
					onEvent: (sseEvent) => {
						handleSSEEvent({
							sseEvent,
							accumulated,
							currentAssistantMsgIdRef,
							runSessionIdRef,
							runSignal: runAbort.signal,
							queueMessageContentUpdate,
							flushMessageContentUpdate,
						});
					},
					onComplete: () => {
						flushMessageContentUpdate();
						resolve();
					},
					onError: (error) => {
						flushMessageContentUpdate();
						addMessage({
							id: `err-${Date.now()}`,
							role: "assistant",
							content: `SSE 流错误: ${error.message}`,
							timestamp: Date.now(),
						});
						reject(error);
					},
				});
				streamAbortRef.current = streamAbort;
			});
		} catch (err) {
			if (runAbort.signal.aborted) {
				return;
			}
			addMessage({
				id: `err-${Date.now()}`,
				role: "assistant",
				content: `调用失败: ${err instanceof Error ? err.message : String(err)}`,
				timestamp: Date.now(),
			});
		} finally {
			flushMessageContentUpdate();
			setStreamingMessageId(null);
			setLoading(false);
			setStartTime(null);
			if (runAbortRef.current === runAbort) {
				runAbortRef.current = null;
				streamAbortRef.current = null;
			}
		}
	};

	const handleStop = () => {
		const activeMessages = getActiveMessages();
		const runningMGJobIds = getRunningShotlyxMGJobIdsFromMessages({
			messages: activeMessages,
		});
		if (runningMGJobIds.length > 0) {
			cancelShotlyxMGJobs({ jobIds: runningMGJobIds });
		}
		runAbortRef.current?.abort();
		streamAbortRef.current?.abort();
		for (const controller of toolAbortControllersRef.current.values()) {
			controller.abort();
		}
		toolAbortControllersRef.current.clear();
		for (const message of activeMessages) {
			if (
				!message.toolCalls?.some(
					(toolCall) =>
						!toolCall.result || isRunningShotlyxMGToolCall(toolCall),
				)
			) {
				continue;
			}
			updateMessageToolCalls({
				id: message.id,
				toolCalls: message.toolCalls.map((toolCall) =>
					isRunningShotlyxMGToolCall(toolCall)
						? {
								...toolCall,
								progress: [
									...(toolCall.progress ?? []),
									{
										stage: "cancelled",
										label: "MG 子智能体已停止",
										status: "error",
										timestamp: Date.now(),
									},
								],
								result: {
									status: "error",
									data: toolCall.result?.data,
									error: "已停止",
								},
							}
						: toolCall.result
							? toolCall
							: {
									...toolCall,
									result: {
										status: "error",
										error: "已停止",
									},
								},
				),
			});
		}
		setStreamingMessageId(null);
		setLoading(false);
		setStartTime(null);
		addMessage({
			id: `stop-${Date.now()}`,
			role: "assistant",
			content: "已停止当前 Agent 流程。你可以直接输入新的需求重新开始。",
			timestamp: Date.now(),
		});
	};

	const submitPrompt = async ({
		prompt,
		references = draftReferences,
	}: {
		prompt: string;
		references?: AgentContextReference[];
	}) => {
		const trimmed = prompt.trim();
		if (!trimmed || isLoading || !editor) return;

		const userMsg = {
			id: `u-${Date.now()}`,
			role: "user" as const,
			content: trimmed,
			references,
			timestamp: Date.now(),
		};
		addMessage(userMsg);
		setInput("");
		setLoading(true);

		const allMsgs = [...getActiveMessages(), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
		clearDraftReferences();
	};

	const handleSubmit = async () => {
		await submitPrompt({ prompt: input, references: draftReferences });
	};

	const handleStarterPrompt = (prompt: string) => {
		void submitPrompt({ prompt, references: draftReferences });
	};

	const handleClarificationAnswer = async (answer: string) => {
		const trimmed = answer.trim();
		if (!trimmed || isLoading || !editor) return;

		const userMsg = {
			id: `u-clarification-${Date.now()}`,
			role: "user" as const,
			content: trimmed,
			timestamp: Date.now(),
		};
		addMessage(userMsg);
		setLoading(true);

		const allMsgs = [...getActiveMessages(), userMsg];
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
	};

	const handleActionClick = async ({
		actionId,
		action,
	}: {
		actionId: string;
		action?: MessageAction;
	}) => {
		if (!editor) return;

		if (actionId.startsWith("option-")) {
			const selectedValue = actionId.slice("option-".length);
			const currentMessages = getActiveMessages();
			const lastAssistant = [...currentMessages]
				.reverse()
				.find(
					(m) => m.role === "assistant" && m.actions?.some((a) => a.isOption),
				);
			const selectedAction =
				action?.isOption === true
					? action
					: lastAssistant?.actions?.find((a) => a.id === actionId);
			const label = selectedAction?.label ?? selectedValue;
			if (selectedAction?.value === "__other__") {
				setInput("");
				return;
			}

			const userMsg = {
				id: `u-option-${Date.now()}`,
				role: "user" as const,
				content:
					typeof selectedAction?.value === "string" && selectedAction.value
						? selectedAction.value
						: label,
				timestamp: Date.now(),
			};
			addMessage(userMsg);
			setLoading(true);

			const allMsgs = [...getActiveMessages(), userMsg];
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
			});
			return;
		}

		if (actionId === "confirm") {
			if (!pendingPlan) return;
			setLoading(true);

			const allMsgs = getActiveMessages();
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				extra: { action: "confirm", plan: pendingPlan },
			});
			setPendingPlan(null);
			return;
		}

		if (actionId === "continue") {
			if (!pendingPlan) {
				setLoading(true);
				const allMsgs = getActiveMessages();
				await runSSEAgent({
					msgsToSend: allMsgs.map(toRequestMessage),
				});
				return;
			}
			setLoading(true);

			const allMsgs = getActiveMessages();
			await runSSEAgent({
				msgsToSend: allMsgs.map(toRequestMessage),
				extra: { action: "continue", plan: pendingPlan },
			});
			setPendingPlan(null);
			return;
		}

		if (actionId === "modify") {
			if (!pendingPlan) {
				addMessage({
					id: `modify-${Date.now()}`,
					role: "assistant",
					content: "当前没有待确认的计划。请告诉我你想怎么修改？",
					timestamp: Date.now(),
				});
				return;
			}
			addMessage({
				id: `modify-${Date.now()}`,
				role: "assistant",
				content: `当前计划：\n${pendingPlan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}\n\n告诉我你想怎么修改`,
				timestamp: Date.now(),
			});
			setPendingPlan(null);
		}
	};

	const handleToolAction = async ({
		messageId,
		request,
	}: {
		messageId: string;
		request: ToolCallActionRequest;
	}): Promise<ToolActionResult> => {
		if (!editor) {
			return {
				status: "error",
				error: "编辑器尚未准备好，无法导入素材",
			};
		}

		if (request.action !== "stock-import-candidate") {
			return {
				status: "error",
				error: "未知的工具卡片操作",
			};
		}

		const result = await editor.mcp.execute({
			toolName: "stock_import_media",
			params: { candidateId: request.payload.candidateId },
		});

		if (result.status === "success") {
			const currentMessages = getActiveMessages();
			const currentMessage = currentMessages.find(
				(msg) => msg.id === messageId,
			);
			if (currentMessage?.toolCalls) {
				updateMessageToolCalls(
					{
						id: messageId,
						toolCalls: currentMessage.toolCalls.map((toolCall) => {
							if (
								toolCall.tool !== "stock_search_media" ||
								toolCall.result?.status !== "success"
							) {
								return toolCall;
							}

							return {
								...toolCall,
								result: {
									...toolCall.result,
									data: patchStockCandidateImportResult({
										data: toolCall.result.data,
										candidateId: request.payload.candidateId,
										importData: result.data,
									}),
								},
							};
						}),
					},
					activeSessionId ?? undefined,
				);
			}
		}

		return {
			status: result.status,
			data: result.data,
			error: result.error,
		};
	};

	const handleRetry = async () => {
		if (!editor || isLoading) return;

		const msgs = getActiveMessages();
		const lastMsg = msgs[msgs.length - 1];
		if (lastMsg?.error) {
			removeMessage(lastMsg.id);
		}

		setLoading(true);

		const allMsgs = getActiveMessages();
		await runSSEAgent({
			msgsToSend: allMsgs.map(toRequestMessage),
		});
	};
	const handleClearConfirm = () => {
		clearSessionMessages();
		if (activeSessionId !== null) {
			editor?.command.agentSession.endSession(activeSessionId);
		}
		setShowClearConfirm(false);
	};

	const handleCopyChat = async () => {
		const visibleMessages = messages.filter((msg) => !msg.hidden);
		const text = formatMessagesForCopy(visibleMessages);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const formatMessagesForCopy = (msgs: typeof messages) => {
		return msgs
			.map((msg) => {
				const role =
					msg.role === "user"
						? locale === "zh-CN"
							? "用户"
							: "User"
						: locale === "zh-CN"
							? "助手"
							: "Assistant";
				let line = `[${role}]`;
				if (msg.thought) {
					line += `\n  思考: ${msg.thought}`;
				}
				if (msg.content) {
					line += `\n  ${msg.content}`;
				}
				if (msg.toolCalls && msg.toolCalls.length > 0) {
					const calls = msg.toolCalls
						.map((toolCall) => formatToolCallForCopy(toolCall))
						.join("\n");
					line += `\n${calls}`;
				}
				if (msg.references && msg.references.length > 0) {
					line += `\n  引用: ${msg.references
						.map((reference) => `${reference.kind}:${reference.label}`)
						.join(", ")}`;
				}
				return line;
			})
			.join("\n\n");
	};

	const handleToggleSelect = (msgId: string) => {
		setSelectedMsgIds((prev) => {
			const next = new Set(prev);
			if (next.has(msgId)) {
				next.delete(msgId);
			} else {
				next.add(msgId);
			}
			return next;
		});
	};

	const handleMessageClick = ({
		msgId,
		isToggleGesture,
	}: {
		msgId: string;
		isToggleGesture: boolean;
	}) => {
		if (!isSelecting && !isToggleGesture) return;
		if (window.getSelection()?.toString()) return;
		handleToggleSelect(msgId);
	};

	const handleCopySelected = async () => {
		const selected = messages.filter((msg) => selectedMsgIds.has(msg.id));
		const text = formatMessagesForCopy(selected);
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setSelectedMsgIds(new Set());
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div
			data-testid="chat-panel"
			className="flex h-full bg-background text-foreground"
		>
			{/* Multi-session UI is intentionally disabled for the compact Agent surface. */}
			<div className="flex flex-1 flex-col overflow-hidden">
				<div className="flex min-h-10 min-w-0 items-center justify-between gap-1.5 border-b border-border/70 bg-card/[0.65] px-2 py-1.5 backdrop-blur dark:bg-background/95">
					<div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
						<AgentModeSelect
							selectedAgent={selectedAgent}
							agents={["default", "editor", "media", "mg"]}
							onAgentChange={setSelectedAgent}
						/>
						<Popover>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="flex size-8 shrink-0 items-center justify-center rounded-sm border border-border/80 bg-muted/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									aria-label={copy.editor.toolbar.executionMode}
									title={`${copy.editor.toolbar.executionMode}: ${copy.editor.toolbar.modes[mode]}`}
								>
									<SlidersHorizontal size={14} />
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" side="bottom" className="w-48 p-1">
								{MODE_CONFIG.map(({ mode: value, icon: Icon }) => (
									<button
										key={value}
										type="button"
										onClick={() => setMode(value)}
										className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent ${
											mode === value ? "bg-accent text-foreground" : ""
										}`}
									>
										<Icon size={15} />
										{copy.editor.toolbar.modes[value]}
									</button>
								))}
							</PopoverContent>
						</Popover>
					</div>
					<div className="flex min-w-0 shrink-0 items-center gap-1">
						{showClearConfirm ? (
							<div className="flex min-w-0 items-center gap-1">
								<span className="hidden text-xs text-muted-foreground min-[420px]:inline">
									{copy.editor.chat.confirmClear}
								</span>
								<button
									type="button"
									data-testid="clear-confirm-button"
									onClick={handleClearConfirm}
									className="rounded-sm bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
								>
									{copy.editor.chat.confirm}
								</button>
								<button
									type="button"
									onClick={() => setShowClearConfirm(false)}
									className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
								>
									{copy.editor.chat.cancel}
								</button>
							</div>
						) : (
							<>
								<button
									type="button"
									onClick={handleCopyChat}
									className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
									aria-label={copy.editor.chat.copyChat}
									title={copy.editor.chat.copyChat}
								>
									{copied ? <Check size={13} /> : <Copy size={13} />}
								</button>
								<button
									type="button"
									data-testid="clear-session-button"
									onClick={() => setShowClearConfirm(true)}
									className="flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-red-400"
									aria-label={copy.editor.chat.clearChat}
									title={copy.editor.chat.clearChat}
								>
									<Trash2 size={13} />
								</button>
							</>
						)}
					</div>
				</div>

				<div className="scrollbar-thin min-w-0 flex-1 select-text overflow-y-auto overflow-x-hidden bg-[linear-gradient(180deg,rgba(8,145,178,0.025),rgba(255,255,255,0)_14rem)] p-3 dark:bg-[linear-gradient(180deg,rgba(34,211,238,0.045),transparent_18rem)]">
					{visibleMessages.length === 0 && !isLoading ? (
						<AgentEmptyState
							disabled={isLoading || !editor}
							hasMedia={mediaAssetCount > 0}
							onPromptSelect={handleStarterPrompt}
						/>
					) : null}
					{visibleMessages.map((msg) => (
						<div
							key={msg.id}
							className={`relative select-text ${isSelecting ? "cursor-pointer" : "cursor-text"} ${selectedMsgIds.has(msg.id) ? "rounded bg-primary/10 ring-1 ring-primary/40" : ""}`}
							style={{
								contentVisibility: "auto",
								containIntrinsicSize: "0 220px",
							}}
							onClick={(event) =>
								handleMessageClick({
									msgId: msg.id,
									isToggleGesture: event.metaKey || event.ctrlKey,
								})
							}
							onKeyDown={undefined}
							role={isSelecting ? "button" : undefined}
							tabIndex={isSelecting ? 0 : undefined}
						>
							<MessageItem
								message={msg}
								onActionClick={(request) => {
									void handleActionClick(request);
								}}
								onOptionCustomAnswer={handleClarificationAnswer}
								onClarificationAnswer={handleClarificationAnswer}
								onToolAction={(request) =>
									handleToolAction({ messageId: msg.id, request })
								}
								onRetry={handleRetry}
								isStreaming={msg.id === streamingMessageId}
							/>
						</div>
					))}
					{isLoading && (
						<div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
							<Loader2 size={14} className="animate-spin" />
							<span>
								{copy.editor.chat.running}{" "}
								{startTime !== null ? `(${formatElapsed(elapsedMs)})` : ""}
							</span>
						</div>
					)}
				</div>
				{isSelecting && (
					<div className="flex items-center justify-between border-t bg-muted px-3 py-2">
						<span className="text-xs text-muted-foreground">
							{copy.editor.chat.selectedCount} {selectedMsgIds.size}
						</span>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => setSelectedMsgIds(new Set())}
								className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
							>
								{copy.editor.chat.cancel}
							</button>
							<button
								type="button"
								onClick={handleCopySelected}
								className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-500"
							>
								{copy.editor.chat.copySelected}
							</button>
						</div>
					</div>
				)}
				<BottomToolbar
					input={input}
					selectedAgent={selectedAgent}
					disabled={isLoading}
					onInputChange={setInput}
					onSubmit={handleSubmit}
					onMediaSubmit={(prompt) => {
						void submitPrompt({ prompt, references: draftReferences });
					}}
					onMGSubmit={(prompt) => {
						void submitPrompt({ prompt, references: draftReferences });
					}}
					onStop={handleStop}
				/>
				<RoughCutReviewDialog
					key={roughCutReview?.reviewId ?? "rough-cut-empty"}
					review={roughCutReview}
					open={roughCutReviewOpen}
					onOpenChange={setRoughCutReviewOpen}
				/>
			</div>
		</div>
	);
}

function AgentEmptyState({
	disabled,
	hasMedia,
	onPromptSelect,
}: {
	disabled: boolean;
	hasMedia: boolean;
	onPromptSelect: (prompt: string) => void;
}) {
	const { copy } = useAppLocale();
	const starters = copy.editor.chat.starters;

	return (
		<div className="flex min-h-full flex-col justify-center gap-4 py-4">
			<div className="mx-auto max-w-md text-center">
				<div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-primary/[0.55] dark:text-cyan-300/80">
					{copy.editor.chat.emptyKicker}
				</div>
				<h2 className="mt-2 text-xl font-semibold tracking-normal text-foreground">
					{copy.editor.chat.emptyTitle}
				</h2>
				<p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
					{copy.editor.chat.emptyBody}
				</p>
			</div>

			{!hasMedia && (
				<div className="rounded-sm border border-border/75 bg-card/[0.45] px-3 py-2 text-sm dark:border-cyan-300/20 dark:bg-cyan-300/5">
					<div className="font-medium text-foreground dark:text-cyan-200">
						{copy.editor.chat.emptyNoMediaTitle}
					</div>
					<p className="mt-1 leading-5 text-muted-foreground">
						{copy.editor.chat.emptyNoMediaBody}
					</p>
				</div>
			)}

			<div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]">
				{starters.map(({ label, hint, prompt }, index) => {
					const { icon: Icon, iconClassName } =
						STARTER_PROMPT_STYLES[index] ?? STARTER_PROMPT_STYLES[0];
					return (
						<button
							key={label}
							type="button"
							disabled={disabled}
							onClick={() => onPromptSelect(prompt)}
							className="group flex min-h-[4.8rem] w-full cursor-pointer items-center gap-3 rounded-md border border-border/75 bg-muted/[0.38] px-3 py-2.5 text-left transition-colors hover:border-primary/25 hover:bg-muted/[0.55] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-cyan-300/30 dark:hover:bg-accent"
						>
							<span
								className={`flex size-10 shrink-0 items-center justify-center rounded-md border ${iconClassName} group-hover:text-foreground`}
							>
								<Icon size={19} />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-foreground">
									{label}
								</span>
								<span className="mt-0.5 block truncate text-xs text-muted-foreground">
									{hint}
								</span>
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
