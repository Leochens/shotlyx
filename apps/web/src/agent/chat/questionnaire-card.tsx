"use client";

import { cn } from "@/utils/ui";
import { Check, CircleHelp, SendHorizontal } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

export interface QuestionnaireOption {
	id: string;
	label: string;
	value: string;
	description?: string;
	recommended?: boolean;
}

interface QuestionnaireCardProps {
	title: string;
	description?: string;
	question: string;
	options?: QuestionnaireOption[];
	allowOther?: boolean;
	otherLabel?: string;
	otherPlaceholder?: string;
	textPlaceholder?: string;
	onAnswer?: (answer: string, option?: QuestionnaireOption) => void;
	className?: string;
}

function usesChinese(value: string): boolean {
	return /[\u3400-\u9fff]/.test(value);
}

export function QuestionnaireCard({
	title,
	description,
	question,
	options = [],
	allowOther = false,
	otherLabel,
	otherPlaceholder,
	textPlaceholder,
	onAnswer,
	className,
}: QuestionnaireCardProps) {
	const [answered, setAnswered] = useState(false);
	const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
	const [showOther, setShowOther] = useState(options.length === 0);
	const [freeformValue, setFreeformValue] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const chinese = usesChinese(`${title} ${description ?? ""} ${question}`);
	const hasOptions = options.length > 0;
	const trimmedFreeform = freeformValue.trim();
	const canSubmitFreeform =
		trimmedFreeform.length > 0 && !answered && !!onAnswer;
	const pendingLabel = chinese ? "待回答" : "Pending";
	const answeredLabel = chinese ? "已回答" : "Answered";
	const resolvedOtherLabel =
		otherLabel ?? (chinese ? "其他（我在备注里说）" : "Other");
	const resolvedPlaceholder =
		otherPlaceholder ??
		textPlaceholder ??
		(chinese
			? "补充你的具体要求、限制或参考方向..."
			: "Add your exact preference, constraint, or reference...");

	useEffect(() => {
		if (showOther && !answered) {
			inputRef.current?.focus();
		}
	}, [answered, showOther]);

	const submitAnswer = (
		answer: string,
		option?: QuestionnaireOption,
		customOptionId?: string,
	) => {
		const trimmed = answer.trim();
		if (!trimmed || answered || !onAnswer) return;
		setSelectedOptionId(option?.id ?? customOptionId ?? "freeform");
		setAnswered(true);
		onAnswer(trimmed, option);
	};

	const handleFreeformSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmitFreeform) return;
		submitAnswer(trimmedFreeform, undefined, "freeform");
	};

	return (
		<section
			className={cn(
				"mt-2 w-full overflow-hidden rounded-lg border border-border/75 bg-slate-50/95 text-foreground shadow-[0_14px_32px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.72)] dark:bg-neutral-950/85 dark:shadow-[0_16px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]",
				className,
			)}
		>
			<div className="flex items-start gap-3 border-border/70 border-b bg-slate-100/80 px-4 py-3.5 dark:bg-neutral-900/70">
				<div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-[0_8px_18px_rgba(234,88,12,0.22)]">
					<CircleHelp size={22} strokeWidth={2.3} />
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-[15px] leading-snug font-semibold text-foreground">
						{title}
					</h3>
					{description && (
						<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				<span
					className={cn(
						"inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
						answered
							? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
							: "border-border/80 bg-background/70 text-muted-foreground",
					)}
				>
					{answered && <Check size={13} />}
					{answered ? answeredLabel : pendingLabel}
				</span>
			</div>

			<div className="space-y-5 px-4 py-4">
				<fieldset className="min-w-0">
					<legend className="mb-3 text-[15px] leading-snug font-semibold text-foreground">
						{question}
						<span className="ml-1 text-orange-600">*</span>
					</legend>

					{hasOptions && (
						<div className="flex flex-wrap gap-2.5">
							{options.map((option) => {
								const selected = selectedOptionId === option.id;

								return (
									<button
										key={option.id}
										type="button"
										aria-pressed={selected}
										disabled={answered || !onAnswer}
										onClick={() => submitAnswer(option.value, option)}
										className={cn(
											"inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-4 py-2 text-left text-sm leading-snug font-medium transition-[border-color,background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-orange-500/25 focus-visible:outline-none disabled:cursor-default",
											selected
												? "border-orange-500 bg-orange-500/12 text-orange-700 shadow-[0_7px_16px_rgba(234,88,12,0.12)] dark:text-orange-300"
												: "border-border/85 bg-background/85 text-foreground hover:border-orange-400/55 hover:bg-orange-500/[0.055]",
											answered && !selected && "opacity-55",
										)}
									>
										<span className="min-w-0 break-words">{option.label}</span>
										{option.description && (
											<span
												className={cn(
													"min-w-0 break-words text-muted-foreground",
													selected &&
														"text-orange-700/80 dark:text-orange-200/80",
												)}
											>
												{option.description}
											</span>
										)}
										{option.recommended && (
											<span
												className={cn(
													"shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none",
													selected
														? "bg-orange-500/15 text-orange-700 dark:text-orange-200"
														: "bg-muted text-muted-foreground",
												)}
											>
												{chinese ? "推荐" : "Rec"}
											</span>
										)}
									</button>
								);
							})}

							{allowOther && (
								<button
									type="button"
									aria-pressed={selectedOptionId === "freeform"}
									disabled={answered}
									onClick={() => setShowOther(true)}
									className={cn(
										"inline-flex min-h-10 max-w-full items-center rounded-full border px-4 py-2 text-left text-sm leading-snug font-medium transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-orange-500/25 focus-visible:outline-none disabled:cursor-default",
										selectedOptionId === "freeform"
											? "border-orange-500 bg-orange-500/12 text-orange-700 dark:text-orange-300"
											: "border-border/85 bg-background/85 text-foreground hover:border-orange-400/55 hover:bg-orange-500/[0.055]",
										answered && selectedOptionId !== "freeform" && "opacity-55",
									)}
								>
									<span className="min-w-0 break-words">
										{resolvedOtherLabel}
									</span>
								</button>
							)}
						</div>
					)}
				</fieldset>

				{(showOther || !hasOptions) && (
					<form onSubmit={handleFreeformSubmit}>
						<textarea
							ref={inputRef}
							value={freeformValue}
							disabled={answered}
							onChange={(event) => setFreeformValue(event.currentTarget.value)}
							onKeyDown={(event) => {
								if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
									event.currentTarget.form?.requestSubmit();
								}
							}}
							rows={3}
							placeholder={resolvedPlaceholder}
							className="min-h-24 w-full resize-y rounded-lg border border-border/75 bg-background px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-orange-500/55 disabled:cursor-default disabled:opacity-75"
						/>
						<div className="mt-2.5 flex items-center justify-between gap-3">
							{hasOptions ? (
								<button
									type="button"
									disabled={answered}
									onClick={() => setShowOther(false)}
									className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
								>
									{chinese ? "收起备注" : "Collapse"}
								</button>
							) : (
								<span className="text-xs text-muted-foreground">
									{chinese ? "填写后我会继续处理。" : "Submit to continue."}
								</span>
							)}
							<button
								type="submit"
								disabled={!canSubmitFreeform}
								className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-400 disabled:pointer-events-none disabled:opacity-45"
							>
								{chinese ? "继续" : "Continue"}
								<SendHorizontal size={13} />
							</button>
						</div>
					</form>
				)}
			</div>
		</section>
	);
}
