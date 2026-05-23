import type { MessageAction } from "@/agent/controller/types";
import { cn } from "@/utils/ui";
import { SendHorizontal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface OptionCardProps {
	option: MessageAction;
	isSelected?: boolean;
	onSelect?: () => void;
	onCustomSubmit?: (answer: string) => void;
}

function isCustomOption(option: MessageAction): boolean {
	return option.value === "__other__";
}

function usesChinese(value: string): boolean {
	return /[\u3400-\u9fff]/.test(value);
}

export function OptionCard({
	option,
	isSelected,
	onSelect,
	onCustomSubmit,
}: OptionCardProps) {
	const [isExpanded, setExpanded] = useState(false);
	const [customAnswer, setCustomAnswer] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const isCustom = isCustomOption(option);
	const chinese = usesChinese(option.label);

	useEffect(() => {
		if (isExpanded) {
			inputRef.current?.focus();
		}
	}, [isExpanded]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = customAnswer.trim();
		if (!trimmed) return;
		onCustomSubmit?.(trimmed);
		setCustomAnswer("");
		setExpanded(false);
	};

	if (isCustom && isExpanded) {
		return (
			<form
				onSubmit={handleSubmit}
				className="w-full max-w-[26rem] rounded-md border border-dashed border-cyan-400/35 bg-cyan-400/[0.045] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
			>
				<textarea
					ref={inputRef}
					value={customAnswer}
					onChange={(event) => setCustomAnswer(event.target.value)}
					onKeyDown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.currentTarget.form?.requestSubmit();
						}
					}}
					rows={2}
					placeholder={chinese ? "输入你的具体想法..." : "Type your custom answer..."}
					className="min-h-16 w-full resize-none rounded-sm border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan-400/60"
				/>
				<div className="mt-2 flex items-center justify-between gap-2">
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="rounded-sm px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						{chinese ? "收起" : "Collapse"}
					</button>
					<button
						type="submit"
						disabled={!customAnswer.trim()}
						className="inline-flex items-center gap-1.5 rounded-sm bg-cyan-500/90 px-2.5 py-1.5 text-xs font-medium text-cyan-950 transition-colors hover:bg-cyan-400 disabled:pointer-events-none disabled:opacity-45"
					>
						{chinese ? "发送" : "Send"}
						<SendHorizontal size={13} />
					</button>
				</div>
			</form>
		);
	}

	return (
		<button
			type="button"
			onClick={isCustom ? () => setExpanded(true) : onSelect}
			data-testid={`action-${option.id}`}
			className={cn(
				"group relative inline-flex min-h-[4.25rem] min-w-[10rem] max-w-[22rem] flex-1 flex-col items-start overflow-hidden rounded-md border px-3.5 py-3 text-left transition-colors",
				isSelected
					? "border-cyan-400/45 bg-cyan-400/10 text-cyan-50"
					: "border-border/70 bg-background/70 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan-400/35 hover:bg-cyan-400/[0.055]",
				isCustom && "border-dashed",
			)}
		>
			<span
				className={cn(
					"absolute top-3 bottom-3 left-0 w-0.5 rounded-r-full transition-colors",
					isSelected ? "bg-cyan-300" : "bg-cyan-400/30 group-hover:bg-cyan-300/70",
				)}
			/>
			<span className="block max-w-full text-sm leading-snug font-medium">
				{option.label}
			</span>
			{option.description && (
				<span className="mt-1 block max-w-full text-xs leading-snug text-muted-foreground">
					{option.description}
				</span>
			)}
		</button>
	);
}
