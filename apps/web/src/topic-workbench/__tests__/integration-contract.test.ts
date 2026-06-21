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

const projectsPageSource = readFileSync(
	fileURLToPath(new URL("../../app/projects/page.tsx", import.meta.url)),
	"utf8",
);

const projectManagerSource = readFileSync(
	fileURLToPath(
		new URL("../../core/managers/project-manager.ts", import.meta.url),
	),
	"utf8",
);

const previewSource = readFileSync(
	fileURLToPath(new URL("../../preview/components/index.tsx", import.meta.url)),
	"utf8",
);

const packageJsonSource = readFileSync(
	fileURLToPath(new URL("../../../package.json", import.meta.url)),
	"utf8",
);

const topicWorkbenchSource = readFileSync(
	fileURLToPath(new URL("../topic-workbench.tsx", import.meta.url)),
	"utf8",
);

const agentChatRouteSource = readFileSync(
	fileURLToPath(new URL("../../api/agent/chat/route.ts", import.meta.url)),
	"utf8",
);

const brainstormDraftCardSource = topicWorkbenchSource.slice(
	topicWorkbenchSource.indexOf("function BrainstormDraftCard"),
	topicWorkbenchSource.indexOf("function DraftTiptapToolbar"),
);

const scriptTableWorkspaceSource = (() => {
	const start = topicWorkbenchSource.indexOf("function ScriptTableWorkspace");
	const end = topicWorkbenchSource.indexOf(
		"function ScriptTableMetadataPanel",
		start,
	);
	return start >= 0 && end > start
		? topicWorkbenchSource.slice(start, end)
		: "";
})();

const packageSectionSource = (() => {
	const start = topicWorkbenchSource.indexOf("function PackageSection");
	const end = topicWorkbenchSource.indexOf("function ProductionPlanSection", start);
	return start >= 0 && end > start
		? topicWorkbenchSource.slice(start, end)
		: "";
})();

const directScriptCutSource = (() => {
	const start = topicWorkbenchSource.indexOf(
		"function buildDirectScriptCutPrompt",
	);
	const end = topicWorkbenchSource.indexOf("function getActivePackage", start);
	return start >= 0 && end > start
		? topicWorkbenchSource.slice(start, end)
		: "";
})();

describe("topic workbench integration contract", () => {
	test("lets topic agents understand uploaded media before generating topics", () => {
		expect(chatPanelSource).toContain("TOPIC_SUPPORT_TOOL_NAMES");
		expect(chatPanelSource).toContain("video_semantic_index_analyze");
		expect(chatPanelSource).toContain("video_semantic_index_get");
		expect(chatPanelSource).toContain("vision_analyze_image");
		expect(chatPanelSource).toContain("vision_analyze_video");
		expect(chatPanelSource).toContain("media_get_all");
		expect(chatPanelSource).toContain("media_read_text_asset");
	});

	test("clears one-shot draft references immediately after sending", () => {
		const submitPromptIndex = chatPanelSource.indexOf(
			"const submitPrompt = async",
		);
		const addMessageIndex = chatPanelSource.indexOf(
			"addMessage(userMsg, chatSessionId);",
			submitPromptIndex,
		);
		const clearIndex = chatPanelSource.indexOf(
			"clearDraftReferences();",
			addMessageIndex,
		);
		const runIndex = chatPanelSource.indexOf(
			"await runSSEAgent({",
			addMessageIndex,
		);

		expect(addMessageIndex).toBeGreaterThanOrEqual(0);
		expect(clearIndex).toBeGreaterThan(addMessageIndex);
		expect(clearIndex).toBeLessThan(runIndex);
	});

	test("uses a full-width chat surface before the first topic project exists", () => {
		expect(editorPageSource).toContain("shouldUseFocusedTopicChat");
		expect(editorPageSource).toContain('activeWorkbench === "topic"');
		expect(editorPageSource).toContain("!activeTopicProject");
		expect(editorPageSource).toContain("<AgentPanelFrame />");
		expect(chatPanelSource).toContain("isFocusedTopicChat");
		expect(chatPanelSource).toContain("max-w-4xl");
		expect(chatPanelSource).toContain("centered={isFocusedTopicChat}");
	});

	test("shows editable pending topic materials before the workbench appears", () => {
		expect(chatPanelSource).toContain("PendingTopicMaterialsPanel");
		expect(chatPanelSource).toContain("pendingTopicInputMaterials");
		expect(chatPanelSource).toContain("EMPTY_TOPIC_INPUT_MATERIALS");
		expect(chatPanelSource).toContain("updateTopicInputMaterial");
		expect(chatPanelSource).toContain("removeTopicInputMaterial");
		expect(chatPanelSource).toContain("分析过程中也可以修改或移除");
		expect(chatPanelSource).toContain('aria-label="素材标题"');
		expect(chatPanelSource).toContain('aria-label="素材内容"');
	});

	test("starts topic mode with a draft-first brainstorm surface", () => {
		expect(chatPanelSource).toContain("startBrainstormDraft");
		expect(chatPanelSource).toContain("isTopicBrainstorming");
		expect(chatPanelSource).toContain("handleStartTopicDraft");
		expect(chatPanelSource).toContain("我先自己打打草稿");
		expect(chatPanelSource).toContain('topicInteractionMode: "brainstorm"');
		expect(chatPanelSource).toContain("getBrainstormToolSchemas");
		expect(editorPageSource).toContain("activeTopicProject");
	});

	test("uses a Tiptap editor for brainstorm drafts while keeping Markdown storage", () => {
		expect(packageJsonSource).toContain('"@tiptap/react"');
		expect(topicWorkbenchSource).toContain('data-testid="draft-tiptap-editor"');
		expect(topicWorkbenchSource).toContain("<EditorContent");
		expect(topicWorkbenchSource).toContain("draftMarkdownToTiptapHtml");
		expect(topicWorkbenchSource).toContain("getDraftTiptapMarkdown");
		expect(topicWorkbenchSource).toContain("insertUploadedAssetsIntoTiptap");
	});

	test("keeps brainstorm drafts editable by default without an edit-mode gate", () => {
		expect(brainstormDraftCardSource).toContain('aria-label="草稿标题"');
		expect(brainstormDraftCardSource).toContain(
			'data-testid="draft-tiptap-editor"',
		);
		expect(brainstormDraftCardSource).toContain("<DraftTiptapToolbar");
		expect(brainstormDraftCardSource).not.toContain("isEditing");
		expect(brainstormDraftCardSource).not.toContain("setEditing");
		expect(brainstormDraftCardSource).not.toContain('title="编辑草稿"');
		expect(brainstormDraftCardSource).not.toContain("点击编辑开始记录");
	});

	test("adds a four-column script table tab to brainstorm mode and forwards it to Agent context", () => {
		expect(topicWorkbenchSource).toContain("type BrainstormWorkspaceTab");
		expect(topicWorkbenchSource).toContain("topic-script-table-tab");
		expect(topicWorkbenchSource).toContain('data-testid="topic-script-table"');
		expect(topicWorkbenchSource).toContain('aria-label="脚本表格时间"');
		expect(topicWorkbenchSource).toContain('aria-label="脚本文案"');
		expect(topicWorkbenchSource).toContain('aria-label="画面内容"');
		expect(topicWorkbenchSource).toContain("选择素材");
		expect(topicWorkbenchSource).toContain("添加一行");
		expect(topicWorkbenchSource).toContain('title="删除这一行"');
		expect(topicWorkbenchSource).toContain("addScriptTableRow");
		expect(topicWorkbenchSource).toContain("removeScriptTableRow");
		expect(topicWorkbenchSource).toContain("attachScriptTableAssets");
		expect(chatPanelSource).toContain("formatTopicScriptTableForAgent");
		expect(chatPanelSource).toContain("脚本表格");
		expect(chatPanelSource).toContain("画面内容");
		expect(chatPanelSource).toContain("选择素材");
	});

	test("lets brainstorm scripts skip ideation and carry metadata into direct editing", () => {
		expect(topicWorkbenchSource).toContain("buildDirectScriptCutPrompt");
		expect(topicWorkbenchSource).toContain("直接根据脚本进行剪辑");
		expect(topicWorkbenchSource).toContain("跳过候选选题、调研、结构和选题包");
		expect(topicWorkbenchSource).toContain("由 Agent 自动估算时间");
		expect(topicWorkbenchSource).toContain("updateScriptTableMetadata");
		expect(topicWorkbenchSource).toContain('aria-label="脚本标题"');
		expect(topicWorkbenchSource).toContain('aria-label="脚本简介"');
		expect(topicWorkbenchSource).toContain("脚本封面");
		expect(topicWorkbenchSource).toContain("脚本表格封面素材。");
		expect(topicWorkbenchSource).toContain("project_update_cover");
		expect(chatPanelSource).toContain("脚本信息");
		expect(chatPanelSource).toContain("封面");
		expect(chatPanelSource).toContain("由 Agent 自动估算时间");
	});

	test("sends direct script cuts as Markdown without draft context and shows asset duration", () => {
		expect(topicWorkbenchSource).toContain(
			"buildTopicScriptTableMarkdownContext",
		);
		expect(topicWorkbenchSource).toContain("## 脚本表格");
		expect(topicWorkbenchSource).toContain(
			"| 时间 | 文案 | 画面内容 | 选择素材 |",
		);
		expect(topicWorkbenchSource).toContain("## 执行要求");
		expect(directScriptCutSource).toContain(
			"buildTopicScriptTableMarkdownContext(project)",
		);
		expect(directScriptCutSource).not.toContain(
			"buildInputMaterialContext(project)",
		);
		expect(topicWorkbenchSource).toContain("formatScriptAssetDuration");
		expect(topicWorkbenchSource).toContain("时长");
		expect(chatPanelSource).toContain("formatTopicScriptTableForAgent");
		expect(chatPanelSource).toContain("| 时间 | 文案 | 画面内容 | 选择素材 |");
	});

	test("keeps script row actions and video metadata visually aligned", () => {
		expect(topicWorkbenchSource).toContain("SCRIPT_TABLE_GRID_CLASS");
		expect(topicWorkbenchSource).toContain("_3.25rem]");
		expect(topicWorkbenchSource).toContain("操作");
		expect(topicWorkbenchSource).toContain(
			"aria-label={`删除第 ${index + 1} 行`}",
		);
		expect(topicWorkbenchSource).toContain("MessageSquarePlus");
		expect(topicWorkbenchSource).toContain(
			"aria-label={`把第 ${index + 1} 行添加到左侧 Agent 对话`}",
		);
		expect(topicWorkbenchSource).toContain("ScriptTableMetadataField");
		expect(topicWorkbenchSource).toContain("min-h-28");
		expect(topicWorkbenchSource).toContain("h-full");
	});

	test("shows a hover insert control between script table rows", () => {
		expect(topicWorkbenchSource).toContain("ScriptTableRowInsertHandle");
		expect(topicWorkbenchSource).toContain(
			'data-testid="script-table-row-insert-handle"',
		);
		expect(topicWorkbenchSource).toContain("在此处添加一行");
		expect(topicWorkbenchSource).toContain("index < rows.length - 1");
		expect(topicWorkbenchSource).toContain(
			"addScriptTableRow({ afterRowId: row.id })",
		);
		expect(topicWorkbenchSource).toContain("group-hover:opacity-100");
	});

	test("keeps script table copy readable and metadata preview-first", () => {
		const metadataIndex = scriptTableWorkspaceSource.indexOf(
			"<ScriptTableMetadataPanel",
		);
		const tableIndex = scriptTableWorkspaceSource.indexOf("overflow-x-auto");
		expect(metadataIndex).toBeGreaterThanOrEqual(0);
		expect(tableIndex).toBeGreaterThanOrEqual(0);
		expect(metadataIndex).toBeLessThan(tableIndex);
		expect(topicWorkbenchSource).toContain("AutoResizeTextarea");
		expect(topicWorkbenchSource).toContain("resizeAutoTextareaToContent");
		expect(topicWorkbenchSource).toContain("minRows={2}");
		expect(topicWorkbenchSource).toContain("resize-none");
		expect(topicWorkbenchSource).toContain("overflow-hidden");
		expect(topicWorkbenchSource).toContain("ScriptTableAssetPreviewDialog");
		expect(topicWorkbenchSource).toContain("previewAsset");
		expect(topicWorkbenchSource).toContain("预览素材");
		expect(topicWorkbenchSource).toContain("<video");
		expect(topicWorkbenchSource).toContain("<img");
	});

	test("reuses the script table for package transcript editing", () => {
		expect(topicWorkbenchSource).toContain(
			"const activeProjectStage = activeProject?.stage ?? null",
		);
		expect(topicWorkbenchSource).toContain(
			"[activeProjectId, activeProjectStage, stageSectionRefs]",
		);
		expect(topicWorkbenchSource).toContain("useLayoutEffect(() =>");
		expect(packageSectionSource).toContain("<ScriptTableWorkspace");
		expect(packageSectionSource).toContain(
			"onUploadFiles={uploadTopicScriptTableMediaFiles}",
		);
		expect(packageSectionSource).toContain(
			"onAddRowToAgent={handleAddScriptRowToAgent}",
		);
		expect(topicWorkbenchSource).not.toContain("function ScriptSegmentViewRow");
		expect(topicWorkbenchSource).not.toContain("时间段逐字稿与素材建议");
	});

	test("routes one package script segment into the left Agent for targeted rewrites", () => {
		expect(topicWorkbenchSource).toContain("buildScriptTableRowRevisionPrompt");
		expect(scriptTableWorkspaceSource).toContain("onAddRowToAgent");
		expect(topicWorkbenchSource).toContain("添加到左侧 Agent 对话");
		expect(packageSectionSource).toContain(
			'source: "script-segment-edit"',
		);
		expect(topicWorkbenchSource).toContain("topic_get_active_package");
		expect(topicWorkbenchSource).toContain("topic_update_script_segment");
		expect(agentChatRouteSource).toContain("topic_update_script_segment");
		expect(agentChatRouteSource).toContain(
			"Do not recreate the whole package unless the user explicitly asks.",
		);
	});

	test("keeps script table visible and connected after entering topic workflow", () => {
		const workflowScriptTableIndex = topicWorkbenchSource.indexOf(
			"<WorkflowScriptTableSection",
		);
		const inputMaterialsIndex = topicWorkbenchSource.indexOf(
			"<InputMaterialsSection",
		);
		expect(workflowScriptTableIndex).toBeGreaterThanOrEqual(0);
		expect(inputMaterialsIndex).toBeGreaterThanOrEqual(0);
		expect(workflowScriptTableIndex).toBeLessThan(inputMaterialsIndex);
		expect(topicWorkbenchSource).toContain('| "scriptTable"');
		expect(topicWorkbenchSource).toContain("scriptTable: false");
		expect(topicWorkbenchSource).toContain(
			"function WorkflowScriptTableSection",
		);
		expect(topicWorkbenchSource).toContain(
			'testId="workflow-script-table-section"',
		);
		expect(topicWorkbenchSource).toContain("data-testid={testId}");
		expect(topicWorkbenchSource).toContain("hasTopicScriptTableContent");
		expect(topicWorkbenchSource).toContain(
			"脚本表格不会因为进入选题流程而删除",
		);
		expect(chatPanelSource).toContain(
			"const topicScriptTableContext = useMemo",
		);
		expect(chatPanelSource).toContain("topicScriptTableContext:");
		expect(chatPanelSource).toContain("topicBrainstormDraft: undefined");
		expect(agentChatRouteSource).toContain("topicScriptTableContext");
		expect(agentChatRouteSource).toContain("Current script table reference");
	});

	test("copies topic drafts with duplicated editor projects and exports scripts as Markdown", () => {
		expect(projectsPageSource).toContain("useTopicWorkbenchStore");
		expect(projectsPageSource).toContain("sourceProjectIds");
		expect(projectsPageSource).toContain("duplicatedProjectIds");
		expect(projectsPageSource).toContain("duplicateEditorProjectTopicState");
		expect(topicWorkbenchSource).toContain(
			"buildTopicScriptTableMarkdownDocument",
		);
		expect(topicWorkbenchSource).toContain("downloadTopicScriptTableMarkdown");
		expect(topicWorkbenchSource).toContain("sanitizeMarkdownFileName");
		expect(topicWorkbenchSource).toContain("text/markdown;charset=utf-8");
		expect(topicWorkbenchSource).toContain(
			"anchor.download = `${fileName}.md`",
		);
		expect(topicWorkbenchSource).toContain("导出 Markdown");
		expect(topicWorkbenchSource).toContain("canExportMarkdown");
	});

	test("skips automatic thumbnail rendering when the editor is degraded", () => {
		expect(projectManagerSource).toContain("updateThumbnailFromTimeline");
		expect(projectManagerSource).toContain("this.editor.renderer.isDegraded");
		expect(previewSource).toContain("isRendererDegraded");
		expect(previewSource).toContain("if (isRendererDegraded) return;");
	});

	test("keeps topic and video chat sessions scoped separately", () => {
		expect(chatPanelSource).toContain(
			"`${editorProjectId}::${activeWorkbench}`",
		);
		expect(chatPanelSource).toContain("chatSessionId");
		expect(chatPanelSource).toContain("getSessionMessages(chatSessionId)");
		expect(chatPanelSource).toContain("TOPIC_PACKAGE_RESOURCE_TOOL_NAMES");
		expect(chatPanelSource).toContain("getTopicPackageResourceToolSchemas");
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
		expect(chatPanelSource).toContain("TopicPromptSection");
		expect(chatPanelSource).toContain("PROMPT_STEP_LABELS");
		expect(chatPanelSource).toContain("我想做一个「${label}」类视频");
		expect(chatPanelSource).toContain("先不要直接写完整脚本");
		expect(chatPanelSource).toContain("候选选题产出要求");
		expect(chatPanelSource).toContain("候选出来后，请先停下来等我选择");
		expect(chatPanelSource).toContain("同步展示到右侧选题工作台");
		expect(chatPanelSource).toContain("内容策划导演和表达教练");
		expect(chatPanelSource).toContain("测评编辑、体验研究员和消费决策顾问");
		expect(chatPanelSource).toContain("快讯编辑、事实核查员和热点解读策划");
		expect(chatPanelSource).toContain("短剧编剧、场景导演和商业创意策划");
		expect(chatPanelSource).toContain("广告创意假设");
		expect(chatPanelSource).toContain("不要凭空生成切片");
		expect(chatPanelSource).toContain("一次最多问 2-3 个最关键的问题");
	});
});
