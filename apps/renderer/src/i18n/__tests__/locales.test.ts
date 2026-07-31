import { describe, expect, test } from "bun:test";
import { getSiteCopy } from "../locales";

describe("editor locale coverage", () => {
	test("covers desktop preferences in both languages", () => {
		expect(getSiteCopy("en").preferences.language).toBe("Language");
		expect(getSiteCopy("zh-CN").preferences.language).toBe("语言");
		expect(getSiteCopy("en").preferences.theme).toBe("Theme");
		expect(getSiteCopy("zh-CN").preferences.theme).toBe("主题");
	});

	test("covers brand kit editing labels in both languages", () => {
		expect(getSiteCopy("en").editor.brandKit.edit).toBe("Edit");
		expect(getSiteCopy("zh-CN").editor.brandKit.edit).toBe("编辑");
		expect(getSiteCopy("en").editor.brandKit.dialog.name).toBe("Name");
		expect(getSiteCopy("zh-CN").editor.brandKit.dialog.name).toBe("名称");
	});

	test("covers visible editor chrome that previously stayed hardcoded", () => {
		expect(getSiteCopy("en").editor.projectSwitcher.title).toBe("Projects");
		expect(getSiteCopy("zh-CN").editor.projectSwitcher.title).toBe("项目");
		expect(getSiteCopy("en").editor.projectSwitcher.newProject).toBe(
			"New project",
		);
		expect(getSiteCopy("zh-CN").editor.projectSwitcher.newProject).toBe(
			"新建项目",
		);
		expect(getSiteCopy("en").editor.assets.import).toBe("Import");
		expect(getSiteCopy("zh-CN").editor.assets.import).toBe("导入");
		expect(getSiteCopy("en").editor.assets.tabs.media).toBe("Media");
		expect(getSiteCopy("zh-CN").editor.assets.tabs.media).toBe("素材");
		expect(getSiteCopy("en").editor.onboarding.steps[0]?.title).toBe(
			"Put ideas on the timeline",
		);
		expect(getSiteCopy("zh-CN").editor.onboarding.steps[0]?.title).toBe(
			"把想法交给时间线",
		);
	});
});
