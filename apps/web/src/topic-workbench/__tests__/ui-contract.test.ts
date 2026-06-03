import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const topicWorkbenchSource = readFileSync(
	fileURLToPath(new URL("../topic-workbench.tsx", import.meta.url)),
	"utf8",
);

describe("topic workbench UI contract", () => {
	test("keeps early-stage selection tool-driven and later package content editable", () => {
		expect(topicWorkbenchSource).not.toContain(
			"updateCandidate = useTopicWorkbenchStore",
		);
		expect(topicWorkbenchSource).not.toContain(
			"resetToStage = useTopicWorkbenchStore",
		);

		expect(topicWorkbenchSource).toContain("选择这个");
		expect(topicWorkbenchSource).toContain("让 Agent 调整");
		expect(topicWorkbenchSource).toContain("查看依据");
		expect(topicWorkbenchSource).toContain("素材输入");
		expect(topicWorkbenchSource).toContain("updateInputMaterial");
		expect(topicWorkbenchSource).toContain("removeInputMaterial");
		expect(topicWorkbenchSource).toContain("updatePackageVersion");
		expect(topicWorkbenchSource).toContain("updateScriptSegment");
		expect(topicWorkbenchSource).toContain("updatePackageOutlineItem");
		expect(topicWorkbenchSource).toContain(
			"updatePackagePlatformRecommendation",
		);
		expect(topicWorkbenchSource).toContain("用户提供素材上下文");
		expect(topicWorkbenchSource).toContain('toolName: "topic_reset_to_stage"');
	});

	test("supports collapsible flow cards, research controls, and package handoff resource", () => {
		expect(topicWorkbenchSource).toContain("stageSectionRefs");
		expect(topicWorkbenchSource).toContain("scrollIntoView");
		expect(topicWorkbenchSource).toContain("researchInsights");
		expect(topicWorkbenchSource).toContain("知识脉络");
		expect(topicWorkbenchSource).toContain("视频内容脑图");
		expect(topicWorkbenchSource).toContain("已屏蔽");
		expect(topicWorkbenchSource).toContain("补充想法");
		expect(topicWorkbenchSource).toContain("引用资料（");
		expect(topicWorkbenchSource).toContain("其他候选已折叠");
		expect(topicWorkbenchSource).toContain("其他结构模板已折叠");
		expect(topicWorkbenchSource).toContain("CollapsibleSection");
		expect(topicWorkbenchSource).toContain("topic_get_active_package");
		expect(topicWorkbenchSource).not.toContain("时间段、内容与素材建议：");
	});
});
