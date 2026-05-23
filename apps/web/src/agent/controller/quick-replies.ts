import { z } from "zod";
import type { MessageAction } from "./types";

export const quickReplyOptionSchema = z.object({
	label: z.string().min(1).max(32),
	value: z.string().min(1).max(220),
	description: z.string().max(96).optional(),
});

export const quickReplyResponseSchema = z.object({
	shouldOffer: z.boolean(),
	options: z.array(quickReplyOptionSchema).max(4).default([]),
});

export type QuickReplyOption = z.infer<typeof quickReplyOptionSchema>;
export type QuickReplyResponse = z.infer<typeof quickReplyResponseSchema>;

const QUESTION_MARK_PATTERN = /[?？]/;
const CJK_PATTERN = /[\u3400-\u9fff]/;
const COMPLETED_STATUS_PATTERN =
	/(已完成|已找到|已添加|已生成|done|completed|finished)/i;

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function makeOptionId({ label, index }: { label: string; index: number }) {
	const asciiSlug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 36);
	return `option-${asciiSlug || `choice-${index + 1}`}`;
}

function usesChinese(text: string): boolean {
	return CJK_PATTERN.test(text);
}

export function shouldRequestQuickReplies({
	assistantText,
	toolCallCount = 0,
}: {
	assistantText: string;
	toolCallCount?: number;
}): boolean {
	const text = compactWhitespace(assistantText);
	if (text.length < 6) return false;
	if (!QUESTION_MARK_PATTERN.test(text)) return false;
	if (COMPLETED_STATUS_PATTERN.test(text)) return false;
	if (toolCallCount > 0 && text.length < 24) return false;
	return true;
}

export function normalizeQuickReplyActions({
	response,
	assistantText,
}: {
	response: QuickReplyResponse;
	assistantText: string;
}): MessageAction[] {
	if (!response.shouldOffer) return [];

	const seen = new Set<string>();
	const actions: MessageAction[] = [];

	for (const option of response.options) {
		const label = compactWhitespace(option.label);
		const value = compactWhitespace(option.value);
		if (!label || !value || value === "__other__") continue;
		const key = `${label}\n${value}`.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		actions.push({
			id: makeOptionId({ label, index: actions.length }),
			label,
			value,
			description: option.description
				? compactWhitespace(option.description)
				: undefined,
			variant: "secondary",
			isOption: true,
		});
		if (actions.length >= 4) break;
	}

	if (actions.length < 2) return [];

	const hasOther = actions.some((action) =>
		/^(other|其他|其它|自定义)$/i.test(action.label),
	);
	if (!hasOther) {
		const chinese = usesChinese(assistantText);
		actions.push({
			id: "option-other",
			label: chinese ? "其他" : "Other",
			value: "__other__",
			description: chinese ? "自己输入" : "Type a custom answer",
			variant: "secondary",
			isOption: true,
		});
	}

	return actions;
}
