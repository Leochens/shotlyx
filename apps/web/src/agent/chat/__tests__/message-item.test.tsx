import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	MessageItem,
	getMessageActionRenderKey,
} from "@/agent/chat/message-item";
import type { ChatMessage } from "@/agent/chat/types";

describe("MessageItem", () => {
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
});
