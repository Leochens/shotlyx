import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	MessageItem,
	getMessageActionRenderKey,
} from "@/agent/chat/message-item";
import type { ChatMessage } from "@/agent/chat/types";

describe("MessageItem", () => {
	test("renders only user-facing content when a hidden request prompt exists", () => {
		const message: ChatMessage = {
			id: "mg-user-request",
			role: "user",
			content: "帮我生成一段中国人口近十年变化的 MG 动画",
			requestContent:
				'内部参数：{"durationSeconds":5} 请调用 shotlyx_generate_mg_component',
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("中国人口近十年变化");
		expect(html).not.toContain("durationSeconds");
		expect(html).not.toContain("shotlyx_generate_mg_component");
	});

	test("uses render keys that remain unique for duplicate action ids", () => {
		expect(
			[{ id: "option-b-roll" }, { id: "option-b-roll" }].map((action, index) =>
				getMessageActionRenderKey({ action, index }),
			),
		).toEqual(["option-b-roll:0", "option-b-roll:1"]);
	});

	test("renders assistant content as markdown", () => {
		const message: ChatMessage = {
			id: "assistant-markdown",
			role: "assistant",
			content: [
				"第一行",
				"第二行含有 **重点**。",
				"",
				"| 方案 | 说明 |",
				"| --- | --- |",
				"| MG 动画 | 生成可编辑动画 |",
			].join("\n"),
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain('data-testid="chat-message-assistant"');
		expect(html).toContain("<br");
		expect(html).toContain("<strong");
		expect(html).toContain("<table");
	});

	test("renders assistant content with a readable light-mode bubble surface", () => {
		const message: ChatMessage = {
			id: "assistant-light-surface",
			role: "assistant",
			content: "项目目前是空的，需要先上传素材。",
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("border-border/70");
		expect(html).toContain("bg-card/85");
	});

	test("renders streaming assistant content as lightweight plain text", () => {
		const message: ChatMessage = {
			id: "assistant-streaming",
			role: "assistant",
			content: "**正在生成**\n\n- 第一步",
			timestamp: 0,
		};

		const html = renderToStaticMarkup(
			<MessageItem message={message} isStreaming />,
		);

		expect(html).toContain("**正在生成**");
		expect(html).not.toContain("<strong");
	});

	test("collapses very long assistant content by default", () => {
		const message: ChatMessage = {
			id: "assistant-long",
			role: "assistant",
			content: [
				"**长回复开头**",
				"这是一段比较长的正文。".repeat(220),
				"tail-marker-should-not-render",
			].join("\n"),
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("展开全文");
		expect(html).toContain("**长回复开头**");
		expect(html).not.toContain("<strong");
		expect(html).not.toContain("tail-marker-should-not-render");
	});

	test("renders assistant token usage summary", () => {
		const message: ChatMessage = {
			id: "assistant-token-usage",
			role: "assistant",
			content: "已完成。",
			tokenUsage: {
				inputTokens: 1200,
				outputTokens: 320,
				reasoningTokens: 80,
				totalTokens: 1520,
				cachedInputTokens: 100,
				cacheWriteTokens: 0,
				approximate: true,
				sources: ["local-cli"],
				updatedAt: 0,
			},
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("1.5K tokens");
		expect(html).toContain("In 1.2K");
		expect(html).toContain("Out 320");
		expect(html).toContain("Reason 80");
		expect(html).toContain("估算");
	});

	test("renders quick reply options as a questionnaire form", () => {
		const message: ChatMessage = {
			id: "assistant-options",
			role: "assistant",
			content: "这个片头想走哪种视觉气质？",
			actions: [
				{
					id: "option-warm",
					label: "暖色 + 力量感",
					value: "我想走暖色 + 力量感，请继续。",
					description: "品牌/演讲/发布会",
					variant: "secondary",
					isOption: true,
				},
				{
					id: "option-other",
					label: "其他",
					value: "__other__",
					description: "自己输入",
					variant: "secondary",
					isOption: true,
				},
			],
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("需要你确认");
		expect(html).toContain("这个片头想走哪种视觉气质？");
		expect(html).toContain("暖色 + 力量感");
		expect(html).toContain("其他（我在备注里说）");
	});

	test("renders structured clarification as a questionnaire form", () => {
		const message: ChatMessage = {
			id: "assistant-clarification",
			role: "assistant",
			content: "",
			clarification: {
				id: "opening-line",
				title: "片头金句参数",
				question: "金句全文是什么？",
				reason: "锁定内容后再出片，保证每一帧都是真实数据。",
				options: [
					{
						id: "slogan",
						label: "品牌 Slogan",
						value: "使用品牌 Slogan。",
						recommended: true,
					},
				],
				allowOther: true,
				blocking: true,
				targetSlot: "opening.line",
			},
			timestamp: 0,
		};

		const html = renderToStaticMarkup(<MessageItem message={message} />);

		expect(html).toContain("片头金句参数");
		expect(html).toContain("金句全文是什么？");
		expect(html).toContain("锁定内容后再出片");
		expect(html).toContain("待回答");
		expect(html).toContain("品牌 Slogan");
	});
});
