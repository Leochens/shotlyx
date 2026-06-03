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
});
