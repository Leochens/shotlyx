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
