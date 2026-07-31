import { describe, expect, test } from "bun:test";
import {
	buildRemotionSkillContextSummary,
	buildRemotionSkillContext,
	formatRemotionSkillSummary,
	selectRemotionSkillRules,
} from "../skill-context";
import { OFFICIAL_REMOTION_SKILL_SOURCE } from "../official-remotion-skill";

describe("Remotion skill context", () => {
	test("selects text animation guidance for typewriter requests", () => {
		const rules = selectRemotionSkillRules({
			prompt: "做一个打字机标题动画，文字逐字出现并带一点弹性",
			styleGuide: "科技感标题",
		});

		expect(rules.map((rule) => rule.id)).toContain("text-animations");
		expect(rules.map((rule) => rule.id)).toContain("timing");
		expect(rules.length).toBeLessThanOrEqual(8);
		expect(
			rules.every((rule) => rule.sourcePath.startsWith("skills/remotion/")),
		).toBe(true);
	});

	test("selects caption and sequencing guidance for subtitle-like requests", () => {
		const rules = selectRemotionSkillRules({
			prompt: "生成一段视频字幕，高亮当前词，并按时间切换",
		});

		expect(rules.map((rule) => rule.id)).toContain("subtitles");
		expect(rules.map((rule) => rule.id)).toContain("display-captions");
		expect(rules.map((rule) => rule.id)).toContain("sequencing");
	});

	test("uses Shotlyx overrides as the editable tuning layer", () => {
		const rules = selectRemotionSkillRules({
			prompt: "做一个中文标题字卡",
		});
		const context = buildRemotionSkillContext({
			prompt: "做一个中文标题字卡",
		});

		expect(rules.map((rule) => rule.id)).toContain("text-animations");
		expect(context).toContain(
			"Editable Shotlyx override file: apps/renderer/src/shotlyx/remotion-components/remotion-skill-overrides.ts",
		);
		expect(context).toContain("For Chinese text");
	});

	test("pins official skill source to a concrete upstream commit", () => {
		expect(OFFICIAL_REMOTION_SKILL_SOURCE.repository).toBe(
			"https://github.com/remotion-dev/skills",
		);
		expect(OFFICIAL_REMOTION_SKILL_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(OFFICIAL_REMOTION_SKILL_SOURCE.installCommand).toContain(
			"npx skills add https://github.com/remotion-dev/skills --skill remotion",
		);
	});

	test("summarizes selected rules for tool progress and results", () => {
		const summary = buildRemotionSkillContextSummary({
			prompt: "制作 AI Agent 运行原理 MG 动画，包含工具调用和记忆",
		});

		expect(summary.source.repository).toBe(
			"https://github.com/remotion-dev/skills",
		);
		expect(summary.selectedRules.map((rule) => rule.id)).toContain(
			"animations",
		);
		expect(summary.overrideFile).toContain("remotion-skill-overrides.ts");
		expect(formatRemotionSkillSummary({ summary })).toContain("rules=");
	});

	test("builds Shotlyx adapted context instead of raw Remotion project setup", () => {
		const context = buildRemotionSkillContext({
			prompt: "做一个带图片的产品介绍 MG 动画",
			styleGuide: "干净现代",
		});

		expect(context).toContain("Shotlyx Remotion skill context");
		expect(context).toContain(
			`Official skill: ${OFFICIAL_REMOTION_SKILL_SOURCE.repository}/tree/${OFFICIAL_REMOTION_SKILL_SOURCE.commit}/${OFFICIAL_REMOTION_SKILL_SOURCE.skillPath}`,
		);
		expect(context).toContain(
			"Official source: https://github.com/remotion-dev/skills/blob/277510e78245ac0fa275d7cb6520d52e0ac2e212/skills/remotion/rules/images.md",
		);
		expect(context).toContain("Do not add import statements");
		expect(context).toContain("frame-based");
		expect(context).not.toContain("npx create-video");
	});
});
