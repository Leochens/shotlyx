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
		expect(topicWorkbenchSource).toContain("updateScriptTableRow");
		expect(topicWorkbenchSource).toContain("ScriptTableWorkspace");
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

	test("keeps script-table recording inline with countdown, mic selection, waveform, and optional silence cleanup", () => {
		expect(topicWorkbenchSource).toContain(
			"const SCRIPT_TABLE_RECORDING_COUNTDOWN_SECONDS = 3",
		);
		expect(topicWorkbenchSource).toContain('"countdown"');
		expect(topicWorkbenchSource).toContain(
			'data-testid="script-table-recording-microphone"',
		);
		expect(topicWorkbenchSource).toContain(
			'data-testid="script-table-recording-waveform"',
		);
		expect(topicWorkbenchSource).toContain("audioContext.resume()");
		expect(topicWorkbenchSource).toContain("previousLevels");
		expect(topicWorkbenchSource).toContain("waveformLevelsRef.current");
		expect(topicWorkbenchSource).toContain("min-h-60");
		expect(topicWorkbenchSource).toContain("是否自动剪辑气口");
		expect(topicWorkbenchSource).toContain("analyzeSilenceForElements");
		expect(topicWorkbenchSource).toContain("applySilenceCutPlan");
	});
});
