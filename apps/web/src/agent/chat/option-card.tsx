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
				className="w-full rounded-lg border border-dashed border-cyan-400/40 bg-cyan-400/[0.055] p-3 shadow-[0_12px_28px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]"
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
					placeholder={
						chinese ? "输入你的具体想法..." : "Type your custom answer..."
					}
					className="min-h-16 w-full resize-none rounded-md border border-border/70 bg-background/85 px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan-400/65"
				/>
				<div className="mt-2 flex items-center justify-between gap-2">
					<button
						type="button"
						onClick={() => setExpanded(false)}
						className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						{chinese ? "收起" : "Collapse"}
					</button>
					<button
						type="submit"
						disabled={!customAnswer.trim()}
						className="inline-flex items-center gap-1.5 rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-cyan-950 transition-colors hover:bg-cyan-300 disabled:pointer-events-none disabled:opacity-45"
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
				"group relative flex min-h-[5.7rem] w-full flex-col items-start overflow-hidden rounded-lg border px-4 py-3.5 text-left shadow-[0_10px_24px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.045)] transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-cyan-300/35 focus-visible:outline-none",
				isSelected
					? "border-cyan-300/60 bg-cyan-400/[0.11] text-cyan-50"
					: "border-border/80 bg-background/80 text-foreground hover:-translate-y-0.5 hover:border-cyan-300/45 hover:bg-cyan-400/[0.055] hover:shadow-[0_14px_30px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.06)]",
				isCustom && "border-dashed bg-background/60",
			)}
		>
			<span
				className={cn(
					"absolute top-3 bottom-3 left-0 w-0.5 rounded-r-full transition-colors",
					isSelected
						? "bg-cyan-200"
						: "bg-cyan-400/35 group-hover:bg-cyan-300/80",
				)}
			/>
			<span className="line-clamp-1 block max-w-full text-[15px] leading-snug font-semibold">
				{option.label}
			</span>
			{option.description && (
				<span className="mt-2 line-clamp-2 block max-w-full text-xs leading-relaxed text-muted-foreground">
					{option.description}
				</span>
			)}
		</button>
	);
}
