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

	test("backfills option descriptions from the assistant's numbered choices", () => {
		const actions = normalizeQuickReplyActions({
			assistantText: [
				"你可以通过以下替代方案来实现类似效果：",
				"1. **生成图片 + 动画化**：用 AI 生成一张黏土风花生苗破土而出的图片，然后插入时间线做缩放/位移动画。",
				"2. **MG 动画**：用 `shotlyx_generate_mg_component` 生成黏土风格 MG 动画，表现花生苗破土过程。",
				"3. **搜索素材**：搜索外部素材库中现成的植物破土或黏土风视频素材。",
				"你更倾向哪种方案？",
			].join("\n"),
			response: {
				shouldOffer: true,
				options: [
					{
						label: "生成图片+动画",
						value: "我想用生成图片再动画化的方案。",
					},
					{
						label: "MG 动画",
						value: "我想用 MG 动画方案。",
					},
					{
						label: "搜索素材",
						value: "我想先搜索素材。",
					},
				],
			},
		});

		expect(actions[0]?.description).toBe(
			"用 AI 生成一张黏土风花生苗破土而出的图片，然后插入时间线做缩放/位移动画。",
		);
		expect(actions[1]?.description).toBe(
			"用 shotlyx_generate_mg_component 生成黏土风格 MG 动画，表现花生苗破土过程。",
		);
		expect(actions[2]?.description).toBe(
			"搜索外部素材库中现成的植物破土或黏土风视频素材。",
		);
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

	test("normalizes full-video production package options", () => {
		const actions = normalizeQuickReplyActions({
			assistantText:
				"这个介绍视频要做到什么完整度？要配音、字幕、MG 动画和音效吗？",
			response: {
				shouldOffer: true,
				options: [
					{
						label: "完整包装",
						value: "做完整包装：配音、字幕、关键 MG 动画和音效都需要。",
						description: "配音+字幕+MG+音效",
					},
					{
						label: "配音字幕",
						value: "先做配音和字幕，不需要额外 MG 和音效。",
						description: "只生成旁白和字幕层",
					},
					{
						label: "MG+字幕",
						value: "做字幕和关键 MG 强调，暂时不要配音和音效。",
						description: "偏图形化讲解",
					},
				],
			},
		});

		expect(actions).toHaveLength(4);
		expect(actions[0]).toMatchObject({
			label: "完整包装",
			value: "做完整包装：配音、字幕、关键 MG 动画和音效都需要。",
			description: "配音+字幕+MG+音效",
		});
		expect(actions[3]).toMatchObject({
			id: "option-other",
			label: "其他",
		});
	});
});
