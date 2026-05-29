import { describe, expect, test } from "bun:test";
import { SMART_MG_COMPOSITION_STYLE_GUIDE } from "../composition-prompt";
import { createShotlyxMGCompositionPlan } from "../composition-director";

describe("Shotlyx MG composition director", () => {
	test("distributes durationSeconds as total composition time with executable frame timing", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "介绍 AI Agent 运行原理，包含感知、思考、行动、工具调用和记忆",
			componentCount: 4,
			durationSeconds: 10,
			styleGuide: "深色科技风",
			aspectRatio: "16:9",
			transparentBackground: true,
		});

		expect(plan.title).toContain("AI Agent");
		expect(plan.timelineMode).toBe("series");
		expect(plan.totalDurationSeconds).toBe(10);
		expect(plan.totalDurationFrames).toBe(300);
		expect(plan.width).toBe(1920);
		expect(plan.height).toBe(1080);
		expect(plan.scenes).toHaveLength(4);
		expect(plan.components).toBe(plan.scenes);
		expect(plan.scenes.map((scene) => scene.durationSeconds)).toEqual([
			2.5, 2.5, 2.5, 2.5,
		]);
		expect(plan.scenes[1]?.timing).toEqual({
			startSeconds: 2.5,
			endSeconds: 5,
			durationSeconds: 2.5,
			startFrame: 75,
			durationFrames: 75,
			display: "2.5s-5.0s",
		});
		expect(plan.scenes[1]?.screenTiming).toBe("2.5s-5.0s");
	});

	test("keeps at least 0.8s per scene when the requested total duration is too short", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "生成 5 个连续的产品功能标注 MG",
			componentCount: 5,
			durationSeconds: 2,
		});

		expect(plan.totalDurationSeconds).toBe(4);
		expect(plan.totalDurationFrames).toBe(120);
		expect(plan.scenes.map((scene) => scene.durationSeconds)).toEqual([
			0.8, 0.8, 0.8, 0.8, 0.8,
		]);
		expect(plan.scenes.at(4)?.timing).toMatchObject({
			startSeconds: 3.2,
			endSeconds: 4,
			startFrame: 96,
			durationFrames: 24,
		});
	});

	test("does not enumerate or route requests into builtin template ids", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt:
				"做一个中国人口近十年变化折线图 MG，2024 年 954 万，2025 年 792 万，红色警示 #ef4444",
			componentCount: 4,
			durationSeconds: 8,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
		});

		expect(plan.scenes.map((scene) => scene.sceneId)).toEqual([
			"custom-segment-1",
			"custom-segment-2",
			"custom-segment-3",
			"custom-segment-4",
		]);
		expect(plan.scenes.every((scene) => scene.templateId === undefined)).toBe(
			true,
		);
		expect(
			plan.scenes.every((scene) => scene.generationMode === "custom-code"),
		).toBe(true);
		expect(plan.narrativeArc).toContain("不枚举动画类型");
		expect(plan.scenes[0]?.focus).toContain("自行设计");

		const joined = plan.scenes
			.map((scene) => `${scene.sceneId} ${scene.label}`)
			.join(" ");
		expect(joined).not.toContain("title-reveal");
		expect(joined).not.toContain("metric-emphasis");
		expect(joined).not.toContain("annotation-callout");
		expect(joined).not.toContain("data-table");
	});

	test("separates editable props intent, style tokens, and validation checks from natural-language focus", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt:
				"标题「中国人口十年变局」，副标题「2015-2025」，展示 14.13 亿峰值，使用 #22d3ee 和 #ef4444",
			componentCount: 2,
			durationSeconds: 6,
			transparentBackground: true,
		});
		const scene = plan.scenes[0]!;

		expect(scene.propsIntent).toMatchObject({
			subject: "中国人口十年变局",
			segmentIndex: 1,
			segmentCount: 2,
			quotedText: ["中国人口十年变局", "2015-2025"],
			colors: ["#22d3ee", "#ef4444"],
		});
		expect(scene.propsIntent.numbers).toEqual(
			expect.arrayContaining(["2015", "2025", "14.13"]),
		);
		expect(plan.styleTokens.palette.accent).toBe("#22d3ee");
		expect(plan.styleTokens.palette.warning).toBe("#ef4444");
		expect(scene.validationChecks).toEqual(
			expect.arrayContaining([
				"no-placeholder-text",
				"must-have-primary-subject",
				"must-use-real-user-data",
				"transparent-background",
				"readable-at-1080p",
			]),
		);
	});

	test("keeps pure visual requests custom, text-free, and not tied to a specific effect enum", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "天空中飘过云彩的 MG 动画，透明背景，不出现文字，云层柔和移动",
			componentCount: 4,
			durationSeconds: 5,
			transparentBackground: true,
		});

		expect(plan.scenes.map((scene) => scene.sceneId)).toEqual([
			"custom-segment-1",
			"custom-segment-2",
			"custom-segment-3",
			"custom-segment-4",
		]);
		expect(plan.scenes.map((scene) => scene.label).join(" / ")).not.toContain(
			"星",
		);
		expect(plan.scenes[0]?.focus).toContain("云彩");
		expect(plan.scenes[0]?.qualityBar).toContain("无文字");
		expect(plan.scenes[0]?.propsIntent).toMatchObject({
			constraints: {
				noText: true,
				transparentBackground: true,
			},
		});
		expect(plan.scenes[0]?.validationChecks).toEqual(
			expect.arrayContaining(["no-text", "transparent-background"]),
		);
	});

	test("can plan more than five MG scenes without falling back to repeated role names", () => {
		const plan = createShotlyxMGCompositionPlan({
			prompt: "生成 8 个连续的产品功能标注 MG",
			componentCount: 8,
			durationSeconds: 16,
		});

		expect(plan.scenes).toHaveLength(8);
		expect(plan.scenes.at(0)?.sceneId).toBe("custom-segment-1");
		expect(plan.scenes.at(4)?.sceneId).toBe("custom-segment-5");
		expect(plan.scenes.at(7)?.label).toBe("自定义片段 8/8");
		expect(plan.scenes.at(4)?.focus).toContain("第 5/8 个 MG 片段");
	});
});
