import { describe, expect, test } from "bun:test";
import { SMART_MG_COMPOSITION_STYLE_GUIDE } from "../composition-prompt";
import { createShotlyxMGCompositionPlan } from "../composition-director";

describe("Shotlyx MG composition director", () => {
	test("only slices work into custom segments instead of classifying the request", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "介绍 AI Agent 运行原理，包含感知、思考、行动、工具调用和记忆",
			componentCount: 4,
			durationSeconds: 6,
			styleGuide: "深色科技风",
		});

		expect(plan.title).toContain("AI Agent");
		expect(plan.narrativeArc).toContain("不预判动画类型");
		expect(plan.components.map((component) => component.id)).toEqual([
			"custom-segment-1",
			"custom-segment-2",
			"custom-segment-3",
			"custom-segment-4",
		]);
		expect(plan.components[0]?.focus).toContain("自行决定");
		expect(plan.components[0]?.qualityBar).toContain("不能套用内置");
		expect(
			plan.components.map((component) => component.durationSeconds),
		).toEqual([6, 6, 6, 6]);
	});

	test("does not route chart requests into title, metric, callout, or table stages", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "做一个中国人口近十年变化折线图 MG",
			componentCount: 4,
			durationSeconds: 8,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"custom-segment-1",
			"custom-segment-2",
			"custom-segment-3",
			"custom-segment-4",
		]);
		const joined = plan.components
			.map((component) => `${component.id} ${component.label}`)
			.join(" ");
		expect(joined).not.toContain("title-reveal");
		expect(joined).not.toContain("metric-emphasis");
		expect(joined).not.toContain("annotation-callout");
		expect(joined).not.toContain("data-table");
		expect(plan.components[1]?.screenTiming).toBe("8.0s-16.0s");
	});

	test.each([
		"标题大字展示：主标题「中国人口十年变局」，副标题 2015-2025",
		"重点指标突出：GMV 120 万，增长 35%，用大数字计数动效展示",
		"圆圈方框标注：圈出 2022 年首次负增长，并用箭头标注原因",
		"数据表格图：列出 2024、2025、2026 三行数据和增长率",
	])("does not infer builtin template ids from wording alone: %s", (prompt) => {
		const plan = createShotlyxMGCompositionPlan({
			prompt,
			componentCount: 1,
			durationSeconds: 5,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"custom-segment-1",
		]);
		expect(plan.components[0]?.focus).toContain("不要从固定模板类型中选择");
	});

	test("keeps pure visual requests custom without star-specific stage names", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "天空中飘过云彩的 MG 动画，透明背景，不出现文字，云层柔和移动",
			componentCount: 4,
			durationSeconds: 5,
		});

		expect(plan.components.map((component) => component.id)).toEqual([
			"custom-segment-1",
			"custom-segment-2",
			"custom-segment-3",
			"custom-segment-4",
		]);
		expect(plan.components.map((component) => component.label).join(" / ")).not.toContain(
			"星",
		);
		expect(plan.components[0]?.focus).toContain("云彩");
		expect(plan.components[0]?.qualityBar).toContain("无文字");
	});

	test("can plan more than five MG components without falling back to repeated role names", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "生成 8 个连续的产品功能标注 MG",
			componentCount: 8,
			durationSeconds: 3,
		});

		expect(plan.components).toHaveLength(8);
		expect(plan.components.at(0)?.id).toBe("custom-segment-1");
		expect(plan.components.at(4)?.id).toBe("custom-segment-5");
		expect(plan.components.at(7)?.label).toBe("自定义片段 8/8");
		expect(plan.components.at(4)?.focus).toContain("第 5/8 个 MG 片段");
	});
});
