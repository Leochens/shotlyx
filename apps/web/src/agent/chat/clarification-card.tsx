"use client";

import type { ClarificationRequest } from "@/agent/controller/types";
import { cn } from "@/utils/ui";
import { SendHorizontal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

export function ClarificationCard({
	clarification,
	onAnswer,
}: {
	clarification: ClarificationRequest;
	onAnswer?: (answer: string) => void;
}) {
	const [showOther, setShowOther] = useState(false);
	const [otherValue, setOtherValue] = useState("");
	const otherInputRef = useRef<HTMLTextAreaElement>(null);
	const canSubmitOther = otherValue.trim().length > 0;

	useEffect(() => {
		if (showOther) {
			otherInputRef.current?.focus();
		}
	}, [showOther]);

	const handleOtherSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmitOther) return;
		onAnswer?.(otherValue.trim());
		setOtherValue("");
		setShowOther(false);
	};

	return (
		<div className="mt-2 w-full rounded-md border border-border/70 bg-background/80 p-3 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
			<div className="space-y-1">
				<p className="text-xs font-medium text-cyan-300">
					{clarification.title}
				</p>
				<p className="text-sm font-medium">{clarification.question}</p>
				{clarification.reason && (
					<p className="text-xs leading-relaxed text-muted-foreground">
						{clarification.reason}
					</p>
				)}
			</div>

			<div className="mt-3 grid gap-2">
				{clarification.options.map((option) => (
					<button
						key={option.id}
						type="button"
						className="group relative overflow-hidden rounded-md border border-border/70 bg-background/70 px-3.5 py-3 text-left transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.055]"
						onClick={() => onAnswer?.(option.value)}
					>
						<span className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-full bg-cyan-400/30 transition-colors group-hover:bg-cyan-300/70" />
						<span className="flex items-center gap-2">
							<span className="text-sm font-medium text-foreground">
								{option.label}
							</span>
							{option.recommended && (
								<span className="rounded-sm bg-cyan-400/12 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:text-cyan-200">
									推荐
								</span>
							)}
						</span>
						{option.description && (
							<span className="mt-0.5 block text-xs text-muted-foreground">
								{option.description}
							</span>
						)}
					</button>
				))}

				{clarification.allowOther && !showOther && (
					<button
						type="button"
						className="rounded-md border border-dashed border-border/80 bg-background/50 px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.045] hover:text-foreground"
						onClick={() => setShowOther(true)}
					>
						其他，我手动输入
					</button>
				)}

				{showOther && (
					<form
						className="rounded-md border border-dashed border-cyan-400/35 bg-cyan-400/[0.045] p-2.5"
						onSubmit={handleOtherSubmit}
					>
						<textarea
							ref={otherInputRef}
							value={otherValue}
							onChange={(event) => setOtherValue(event.currentTarget.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
									event.currentTarget.form?.requestSubmit();
								}
							}}
							rows={2}
							placeholder="输入你的自定义方向"
							className="min-h-16 w-full resize-none rounded-sm border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan-400/60"
						/>
						<div className="mt-2 flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => setShowOther(false)}
								className="rounded-sm px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							>
								收起
							</button>
							<button
								type="submit"
								disabled={!canSubmitOther}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-sm bg-cyan-500/90 px-2.5 py-1.5 text-xs font-medium text-cyan-950 transition-colors hover:bg-cyan-400",
									"disabled:pointer-events-none disabled:opacity-45",
								)}
							>
								继续
								<SendHorizontal size={13} />
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
