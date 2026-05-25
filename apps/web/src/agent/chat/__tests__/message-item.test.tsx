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
});
