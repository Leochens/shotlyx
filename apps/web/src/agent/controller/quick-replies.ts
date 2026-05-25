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
const NUMBERED_CHOICE_PATTERN = /^\s*(?:\d+[.)]|[-*])\s+(.+?)\s*[：:]\s*(.+)$/;
const MARKDOWN_MARKER_PATTERN = /[*`~[\]()]/g;
const COMPACT_KEY_PATTERN = /[^a-z0-9\u3400-\u9fff]+/gi;

function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stripMarkdown(value: string): string {
	return compactWhitespace(value.replace(MARKDOWN_MARKER_PATTERN, ""));
}

function makeMatchKey(value: string): string {
	return stripMarkdown(value).toLowerCase().replace(COMPACT_KEY_PATTERN, "");
}

function parseAssistantOptionDescriptions({
	assistantText,
}: {
	assistantText: string;
}): Array<{ title: string; description: string }> {
	return assistantText
		.split(/\r?\n/)
		.map((line) => {
			const match = line.match(NUMBERED_CHOICE_PATTERN);
			if (!match) return null;
			const title = stripMarkdown(match[1] ?? "");
			const description = stripMarkdown(match[2] ?? "");
			if (!title || !description) return null;
			return { title, description };
		})
		.filter((item): item is { title: string; description: string } =>
			Boolean(item),
		);
}

function findAssistantOptionDescription({
	label,
	index,
	assistantChoices,
}: {
	label: string;
	index: number;
	assistantChoices: Array<{ title: string; description: string }>;
}): string | undefined {
	const labelKey = makeMatchKey(label);
	const matchedChoice = assistantChoices.find((choice) => {
		const titleKey = makeMatchKey(choice.title);
		return titleKey.includes(labelKey) || labelKey.includes(titleKey);
	});

	return matchedChoice?.description ?? assistantChoices[index]?.description;
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
	const assistantChoices = parseAssistantOptionDescriptions({ assistantText });

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
				: findAssistantOptionDescription({
						label,
						index: actions.length,
						assistantChoices,
					}),
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
