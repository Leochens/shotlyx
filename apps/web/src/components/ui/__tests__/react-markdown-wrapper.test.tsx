import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";

describe("ReactMarkdownWrapper", () => {
	test("renders assistant markdown with core formatting", () => {
		const html = renderToStaticMarkup(
			<ReactMarkdownWrapper>
				{[
					"第一行",
					"第二行含有 **重点** 和 [链接](https://shotlyx.ai)。",
					"",
					"| 方案 | 说明 |",
					"| --- | --- |",
					"| MG 动画 | 生成可编辑动画 |",
				].join("\n")}
			</ReactMarkdownWrapper>,
		);

		expect(html).toContain("<br");
		expect(html).toContain("<strong");
		expect(html).toContain("重点</strong>");
		expect(html).toContain('href="https://shotlyx.ai"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain("<table");
		expect(html).toContain("<th");
		expect(html).toContain("<td");
	});
});
