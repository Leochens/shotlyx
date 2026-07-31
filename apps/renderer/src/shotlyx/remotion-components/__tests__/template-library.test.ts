import { describe, expect, test } from "bun:test";
import {
	createShotlyxMGTemplateDocument,
	listShotlyxMGTemplates,
	normalizeShotlyxMGTemplateSelection,
	resolveShotlyxMGTemplateForTask,
} from "../template-library";

describe("Shotlyx MG template library", () => {
	test("lists flexible built-in template families", () => {
		const templateIds = listShotlyxMGTemplates().map((template) => template.id);

		expect(templateIds).toContain("title-reveal");
		expect(templateIds).toContain("metric-emphasis");
		expect(templateIds).toContain("annotation-callout");
		expect(templateIds).toContain("data-table");
	});

	test("creates an editable Remotion document while deriving props schema", async () => {
		const document = await createShotlyxMGTemplateDocument({
			templateId: "title-reveal",
			prompt:
				"制作一个 MG 动画《从 Vibe 到 Harness：AI 编程的二次跃迁》，展示 2024、2025、2026 三个阶段",
			taskLabel: "标题大字展示",
			taskFocus: "提取主标题、副标题和年份标签，用大字标题建立主题。",
			durationSeconds: 5,
			aspectRatio: "16:9",
			transparentBackground: true,
		});

		expect(document.runtime).toBe("shotlyx-remotion-component-v1");
		expect(document.componentSource).toContain("useCurrentFrame");
		expect(document.compiledModule.length).toBeGreaterThan(0);
		expect(document.defaultProps.title).toContain("Vibe");
		expect(document.propsSchema.map((prop) => prop.key)).toEqual(
			expect.arrayContaining(["title", "subtitle", "accentColor"]),
		);
	});

	test("resolves known director task ids to template ids", () => {
		expect(resolveShotlyxMGTemplateForTask({ taskId: "title-reveal" })).toBe(
			"title-reveal",
		);
		expect(resolveShotlyxMGTemplateForTask({ taskId: "data-table-2" })).toBe(
			"data-table",
		);
		expect(resolveShotlyxMGTemplateForTask({ taskId: "unknown-effect" })).toBe(
			null,
		);
	});

	test("does not resolve generic default director tasks to builtin templates", () => {
		for (const taskId of [
			"concept",
			"main-mechanism",
			"callouts",
			"final-summary",
		]) {
			expect(resolveShotlyxMGTemplateForTask({ taskId })).toBe(null);
		}
	});

	test("does not resolve narrative agent director tasks to builtin templates", () => {
		for (const taskId of [
			"agent-concept",
			"agent-loop",
			"agent-tools",
			"agent-memory",
			"agent-summary",
		]) {
			expect(resolveShotlyxMGTemplateForTask({ taskId })).toBe(null);
		}
	});

	test("ignores selected template ids unless template mode is forced", () => {
		expect(
			normalizeShotlyxMGTemplateSelection({
				templateMode: "auto",
				templateId: "title-reveal",
			}),
		).toEqual({
			templateMode: "auto",
		});
		expect(
			normalizeShotlyxMGTemplateSelection({
				templateMode: "force",
				templateId: "title-reveal",
			}),
		).toEqual({
			templateMode: "force",
			templateId: "title-reveal",
		});
	});
});
