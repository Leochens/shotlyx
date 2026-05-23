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
		<div className="mb-2 overflow-hidden rounded-lg border border-neutral-700/50 bg-neutral-800/40">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex w-full select-none items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-700/30"
			>
				<Sparkles
					size={14}
					className={`shrink-0 ${isStreaming ? "animate-pulse text-blue-400" : "text-neutral-500"}`}
				/>
				<span className="flex-1 text-xs font-medium text-neutral-400">
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
					<ChevronUp size={14} className="text-neutral-500" />
				) : (
					<ChevronDown size={14} className="text-neutral-500" />
				)}
			</button>
			{isOpen && (
				<div className="px-3 pb-2">
					<div className="max-h-48 select-text overflow-y-auto overscroll-contain border-l-2 border-neutral-700/50 pl-3 pr-2 text-xs leading-relaxed whitespace-pre-wrap text-neutral-500 [overflow-wrap:anywhere]">
						{reasoning}
					</div>
				</div>
			)}
		</div>
	);
}
