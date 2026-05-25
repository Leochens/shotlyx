import { AlertCircle, RotateCcw } from "lucide-react";
import type { ChatMessage } from "./types";
import { ReasoningBlock } from "./reasoning-block";
import {
	StockMediaResultsPanel,
	ToolCallGroup,
	getStockMediaCandidatesFromToolCalls,
	type ToolActionResult,
	type ToolCallActionRequest,
} from "./tool-call-card";
import { OptionCard } from "./option-card";
import { ReferenceChipList } from "./reference-chip";
import { ClarificationCard } from "./clarification-card";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";

interface MessageItemProps {
	message: ChatMessage;
	onActionClick?: (actionId: string) => void;
	onOptionCustomAnswer?: (answer: string) => void;
	onClarificationAnswer?: (answer: string) => void;
	onToolAction?: (request: ToolCallActionRequest) => Promise<ToolActionResult>;
	onRetry?: () => void;
	isStreaming?: boolean;
}

export function MessageItem({
	message,
	onActionClick,
	onOptionCustomAnswer,
	onClarificationAnswer,
	onToolAction,
	onRetry,
	isStreaming,
}: MessageItemProps) {
	const isUser = message.role === "user";
	const hasReasoning = !isUser && message.thought && message.thought.length > 0;
	const hasContent = !!message.content && message.content.length > 0;
	const hasToolCalls =
		!isUser && message.toolCalls && message.toolCalls.length > 0;
	const hasMediaResults =
		!isUser &&
		getStockMediaCandidatesFromToolCalls(message.toolCalls).length > 0;
	const hasActions = !isUser && message.actions && message.actions.length > 0;
	const hasClarification = !isUser && message.clarification;
	const hasError = !isUser && message.error;
	const isOptions = hasActions && message.actions!.some((a) => a.isOption);
	const hasReferences = isUser && (message.references?.length ?? 0) > 0;
	const textBubbleClassName = isUser
		? "border border-sky-200/45 bg-sky-50/70 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-sky-200/10 dark:bg-sky-300/[0.075] dark:text-neutral-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
		: "bg-muted text-foreground";

	return (
		<div
			data-testid={isUser ? "chat-message-user" : "chat-message-assistant"}
			className={`mb-4 flex select-text ${isUser ? "justify-end" : "justify-start"}`}
		>
			{/* Message Body */}
			<div
				className={`flex min-w-0 select-text flex-col ${
					isUser ? "max-w-[85%] items-end" : "w-full max-w-full items-start"
				}`}
			>
				{/* Thinking Part */}
				{hasReasoning && (
					<div className="w-full">
						<ReasoningBlock
							reasoning={message.thought!}
							isStreaming={isStreaming && !hasContent}
						/>
					</div>
				)}

				{/* Tool Invocation Parts */}
				{hasToolCalls && (
					<div className="w-full">
						<ToolCallGroup toolCalls={message.toolCalls!} />
					</div>
				)}

				{/* Text Content Part */}
				{(hasContent || isStreaming) && (
					<div
						className={`relative max-w-full select-text rounded-2xl px-4 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] ${
							textBubbleClassName
						}`}
					>
						{hasContent && !isUser ? (
							<ReactMarkdownWrapper>{message.content}</ReactMarkdownWrapper>
						) : (
							message.content || (isStreaming ? "..." : "")
						)}
						{isStreaming && hasContent && (
							<span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
						)}
					</div>
				)}

				{hasReferences && (
					<ReferenceChipList
						references={message.references!}
						primaryReferenceId={message.references![0]?.id ?? null}
						className="mt-2 justify-end"
					/>
				)}

				{hasMediaResults && (
					<StockMediaResultsPanel
						toolCalls={message.toolCalls}
						onToolAction={onToolAction}
					/>
				)}

				{hasClarification && (
					<ClarificationCard
						clarification={message.clarification!}
						onAnswer={onClarificationAnswer}
					/>
				)}

				{/* Error State */}
				{hasError && (
					<div className="w-full select-text rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3">
						<div className="flex items-start gap-2">
							<AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
							<div className="min-w-0 flex-1">
								<p className="text-sm text-red-300">{message.error!.message}</p>
								{message.error!.isRetryable && (
									<button
										type="button"
										onClick={() => onRetry?.()}
										className="mt-2 inline-flex items-center gap-1.5 rounded bg-red-800/60 px-3 py-1.5 text-xs text-red-200 hover:bg-red-700/60"
									>
										<RotateCcw size={12} />
										重试
									</button>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Actions / Options Part */}
				{hasActions && (
					<div className="mt-2 w-full">
						{isOptions ? (
							<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.5rem),1fr))] gap-2.5">
								{message.actions!.map((action) => (
									<OptionCard
										key={action.id}
										option={action}
										onSelect={() => onActionClick?.(action.id)}
										onCustomSubmit={onOptionCustomAnswer}
									/>
								))}
							</div>
						) : (
							<div className="flex flex-wrap gap-2">
								{message.actions!.map((action) => (
									<button
										key={action.id}
										data-testid={`action-${action.id}`}
										type="button"
										onClick={() => onActionClick?.(action.id)}
										className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
											action.variant === "primary"
												? "bg-blue-600 text-white hover:bg-blue-500"
												: action.variant === "danger"
													? "bg-red-600 text-white hover:bg-red-500"
													: "border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
										}`}
									>
										{action.label}
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
