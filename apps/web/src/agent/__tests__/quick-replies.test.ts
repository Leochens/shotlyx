import { describe, expect, test } from "bun:test";
import {
	normalizeQuickReplyActions,
	shouldRequestQuickReplies,
} from "@/agent/controller/quick-replies";

describe("quick replies", () => {
	test("detects clarification questions that can use quick replies", () => {
		expect(
			shouldRequestQuickReplies({
				assistantText: "你想生成什么类型的音频？",
			}),
		).toBe(true);
		expect(
			shouldRequestQuickReplies({
				assistantText: "已找到候选素材，可以在卡片里预览并导入资源库。",
			}),
		).toBe(false);
		expect(
			shouldRequestQuickReplies({
				assistantText: "pong",
			}),
		).toBe(false);
	});

	test("normalizes model options into clickable message actions", () => {
		const actions = normalizeQuickReplyActions({
			assistantText: "你想生成什么类型的音频？",
			response: {
				shouldOffer: true,
				options: [
					{
						label: "旁白配音",
						value: "我想生成旁白配音，请继续。",
					},
					{
						label: "背景音乐",
						value: "我想生成背景音乐，请继续。",
					},
				],
			},
		});

		expect(actions).toHaveLength(3);
		expect(actions[0]).toMatchObject({
			id: "option-choice-1",
			label: "旁白配音",
			value: "我想生成旁白配音，请继续。",
			variant: "secondary",
			isOption: true,
		});
		expect(actions[2]).toMatchObject({
			id: "option-other",
			label: "其他",
			value: "__other__",
			isOption: true,
		});
	});

	test("does not expose option actions when the model declines", () => {
		expect(
			normalizeQuickReplyActions({
				assistantText: "要继续吗？",
				response: {
					shouldOffer: false,
					options: [
						{
							label: "继续",
							value: "继续",
						},
					],
				},
			}),
		).toEqual([]);
	});
});
