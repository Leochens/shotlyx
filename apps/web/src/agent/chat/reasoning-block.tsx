import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface ReasoningBlockProps {
	reasoning: string;
	isStreaming?: boolean;
}

export function ReasoningBlock({
	reasoning,
	isStreaming,
}: ReasoningBlockProps) {
	const [isOpen, setIsOpen] = useState(true);

	return (
		<div className="mb-2 overflow-hidden rounded-lg border border-border/70 bg-card/70 shadow-[0_8px_22px_rgba(14,44,56,0.06)] dark:border-neutral-700/50 dark:bg-neutral-800/40 dark:shadow-none">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full select-none items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/70 dark:hover:bg-neutral-700/30"
			>
				<Sparkles
					size={14}
					className={`shrink-0 ${
						isStreaming
							? "animate-pulse text-blue-500 dark:text-blue-400"
							: "text-muted-foreground dark:text-neutral-500"
					}`}
				/>
				<span className="flex-1 text-xs font-medium text-muted-foreground dark:text-neutral-400">
					{isStreaming ? "思考中..." : "思考过程"}
				</span>
				{isStreaming && (
					<span className="mr-2 flex gap-0.5">
						<span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
						<span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
						<span className="h-1 w-1 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
					</span>
				)}
				{isOpen ? (
					<ChevronUp
						size={14}
						className="text-muted-foreground dark:text-neutral-500"
					/>
				) : (
					<ChevronDown
						size={14}
						className="text-muted-foreground dark:text-neutral-500"
					/>
				)}
			</button>
			{isOpen && (
				<div className="px-3 pb-2">
					<div className="max-h-48 select-text overflow-y-auto overscroll-contain border-primary/25 border-l-2 pl-3 pr-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere] dark:border-neutral-700/50 dark:text-neutral-500">
						{reasoning}
					</div>
				</div>
			)}
		</div>
	);
}
