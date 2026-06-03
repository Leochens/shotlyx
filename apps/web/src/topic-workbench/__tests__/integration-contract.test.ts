import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const chatPanelSource = readFileSync(
	fileURLToPath(new URL("../../agent/chat/panel.tsx", import.meta.url)),
	"utf8",
);

const editorPageSource = readFileSync(
	fileURLToPath(
		new URL("../../app/editor/[project_id]/page.tsx", import.meta.url),
	),
	"utf8",
);

describe("topic workbench integration contract", () => {
	test("lets topic agents understand uploaded media before generating topics", () => {
		expect(chatPanelSource).toContain("TOPIC_SUPPORT_TOOL_NAMES");
		expect(chatPanelSource).toContain("video_semantic_index_analyze");
		expect(chatPanelSource).toContain("video_semantic_index_get");
		expect(chatPanelSource).toContain("vision_analyze_media");
		expect(chatPanelSource).toContain("media_get_all");
		expect(chatPanelSource).toContain("media_read_text_asset");
	});

	test("clears one-shot draft references immediately after sending", () => {
		const addMessageIndex = chatPanelSource.indexOf("addMessage(userMsg);");
		const clearIndex = chatPanelSource.indexOf("clearDraftReferences();");
		const runIndex = chatPanelSource.indexOf("await runSSEAgent({");

		expect(addMessageIndex).toBeGreaterThanOrEqual(0);
		expect(clearIndex).toBeGreaterThan(addMessageIndex);
		expect(clearIndex).toBeLessThan(runIndex);
	});

	test("uses a full-width chat surface before the first topic project exists", () => {
		expect(editorPageSource).toContain("shouldUseFocusedTopicChat");
		expect(editorPageSource).toContain('activeWorkbench === "topic"');
		expect(editorPageSource).toContain("!activeTopicProject");
		expect(editorPageSource).toContain("<AgentPanelFrame />");
	});

	test("offers broad topic intent capsules with intake-first prompts", () => {
		expect(chatPanelSource).toContain("TopicIntentCapsules");
		expect(chatPanelSource).toContain("选择一个创作类型");
		expect(chatPanelSource).toContain("气泡只会载入问询流程");
		expect(chatPanelSource).toContain("flex-wrap justify-center");
		expect(chatPanelSource).toContain("口播观点");
		expect(chatPanelSource).toContain("产品展示");
		expect(chatPanelSource).toContain("教程演示");
		expect(chatPanelSource).toContain("生活记录");
		expect(chatPanelSource).toContain("实时资讯");
		expect(chatPanelSource).toContain("长视频拆短");
		expect(chatPanelSource).toContain("访谈播客");
		expect(chatPanelSource).toContain("情景短剧");
		expect(chatPanelSource).toContain("【${label}】");
		expect(chatPanelSource).toContain("先帮我把一个观点");
		expect(chatPanelSource).toContain("这个类型的判断重点");
		expect(chatPanelSource).toContain("请先问我这些问题");
		expect(chatPanelSource).toContain("候选生成侧重");
		expect(chatPanelSource).toContain("观点锋利度");
		expect(chatPanelSource).toContain("产品利益点");
		expect(chatPanelSource).toContain("步骤断点");
		expect(chatPanelSource).toContain("高光切片");
		expect(chatPanelSource).toContain("资料与能力使用方式");
		expect(chatPanelSource).toContain("不要立刻把候选写入右侧选题工作台");
		expect(chatPanelSource).toContain("同步写入右侧选题工作台");
		expect(chatPanelSource).toContain("一次最多问 2-3 个问题");
	});
});
