import { describe, expect, test } from "bun:test";
import type { ToolCallRecord } from "@/agent/controller/types";
import { formatToolCallForCopy } from "@/agent/chat/tool-result-copy";

describe("formatToolCallForCopy", () => {
	test("summarizes stock search results instead of dumping raw objects", () => {
		const toolCall: ToolCallRecord = {
			tool: "stock_search_media",
			params: { query: "office", type: "video" },
			result: {
				status: "success",
				data: {
					candidates: [
						{ id: "stock_1", provider: "pexels", type: "video" },
						{ id: "stock_2", provider: "pixabay", type: "video" },
					],
				},
			},
		};

		const text = formatToolCallForCopy(toolCall);

		expect(text).toContain("工具: stock_search_media");
		expect(text).toContain("找到 2 个候选");
		expect(text).toContain("Pexels");
		expect(text).not.toContain("[object Object]");
	});

	test("keeps generic object results readable", () => {
		const toolCall: ToolCallRecord = {
			tool: "project_get_settings",
			params: {},
			result: {
				status: "success",
				data: {
					width: 1024,
					height: 768,
				},
			},
		};

		const text = formatToolCallForCopy(toolCall);

		expect(text).toContain('"width":1024');
		expect(text).toContain('"height":768');
		expect(text).not.toContain("[object Object]");
	});

	test("includes error text for failed tool calls", () => {
		const toolCall: ToolCallRecord = {
			tool: "stock_search_media",
			params: { query: "bgm", type: "audio" },
			result: {
				status: "error",
				error: "configuration_error: missing FREESOUND_API_KEY",
			},
		};

		const text = formatToolCallForCopy(toolCall);

		expect(text).toContain("✗");
		expect(text).toContain("missing FREESOUND_API_KEY");
	});
});
