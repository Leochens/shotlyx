import { describe, expect, test } from "bun:test";
import { SMART_MG_COMPOSITION_STYLE_GUIDE } from "../composition-prompt";
import { createShotlyxMGCompositionPlan } from "../composition-director";

describe("Shotlyx MG composition director", () => {
	test("plans AI Agent explainers as narrative content layers", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "介绍 AI Agent 运行原理，包含感知、思考、行动、工具调用和记忆",
			componentCount: 4,
			durationSeconds: 6,
			styleGuide: "深色科技风",
		});

		expect(plan.title).toContain("AI Agent");
		expect(plan.components.map((component) => component.id)).toEqual([
			"agent-concept",
			"agent-loop",
			"agent-tools",
			"agent-memory",
		]);
		expect(plan.components[1]?.focus).toContain("感知");
		expect(plan.components[2]?.focus).toContain("Function Calling");
		expect(plan.components[3]?.qualityBar).toContain("闭环");
		expect(
			plan.components.map((component) => component.durationSeconds),
		).toEqual([3, 4.2, 3.8, 3.6]);
	});

	test("keeps chart requests focused on data hierarchy", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "做一个中国人口近十年变化折线图 MG",
			componentCount: 4,
			durationSeconds: 8,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"title-reveal",
			"metric-emphasis",
			"annotation-callout",
			"data-table",
		]);
		expect(plan.components[0]?.label).toContain("标题");
		expect(plan.components[1]?.label).toContain("重点");
		expect(plan.components[2]?.qualityBar).toContain("圆圈或方框");
		expect(plan.components[3]?.qualityBar).toContain("propsSchema table");
		expect(
			plan.components.map((component) => component.durationSeconds),
		).toEqual([2.8, 2.4, 1.8, 3.8]);
		expect(plan.components[2]?.screenTiming).toBe("5.2s-7.0s");
	});

	test.each([
		{
			prompt: "标题大字展示：主标题「中国人口十年变局」，副标题 2015-2025",
			expectedId: "title-reveal",
		},
		{
			prompt: "重点指标突出：GMV 120 万，增长 35%，用大数字计数动效展示",
			expectedId: "metric-emphasis",
		},
		{
			prompt: "圆圈方框标注：圈出 2022 年首次负增长，并用箭头标注原因",
			expectedId: "annotation-callout",
		},
		{
			prompt: "数据表格图：列出 2024、2025、2026 三行数据和增长率",
			expectedId: "data-table",
		},
	])("plans exact builtin template requests as $expectedId", ({ prompt, expectedId }) => {
		const plan = createShotlyxMGCompositionPlan({
			prompt,
			componentCount: 1,
			durationSeconds: 5,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			expectedId,
		]);
	});

	test("does not let generic smart style guidance reclassify pure visual effects as data templates", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "生成一个数据雨和星星爆炸的纯视觉粒子 MG 动画，不出现文字",
			componentCount: 4,
			durationSeconds: 5,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"concept",
			"main-mechanism",
			"callouts",
			"final-summary",
		]);
	});

	test.each([
		"做一个数据感科技背景转场，蓝色光效和扫描线，不出现任何文字",
		"生成一个产品发布复杂 MG 动画，星形粒子、镜头推进、空间轨迹，不要套固定标题模板",
		"做一个三个步骤流程：上传、AI 分析、导出成片，用动态图形表现流程",
		"Stable Diffusion 风格的星光粒子动画，透明背景，不出现文字",
	])("keeps non-template smart requests custom: %s", (prompt) => {
		const plan = createShotlyxMGCompositionPlan({
			prompt,
			componentCount: 4,
			durationSeconds: 5,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"concept",
			"main-mechanism",
			"callouts",
			"final-summary",
		]);
	});

	test("can plan more than five MG components without truncating", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "生成 8 个连续的产品功能标注 MG",
			componentCount: 8,
			durationSeconds: 3,
		});

		expect(plan.components).toHaveLength(8);
		expect(plan.components[0]?.id).toBe("concept");
		expect(plan.components[4]?.id).toBe("concept-2");
		expect(plan.components[7]?.id).toBe("final-summary-2");
		expect(plan.components[4]?.label).toContain("扩展 2");
	});
});
