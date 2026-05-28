import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageItem } from "@/agent/chat/message-item";
import type { ChatMessage } from "@/agent/chat/types";

describe("MessageItem", () => {
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
});
