import { describe, expect, test } from "bun:test";
import { resolveAppLocaleFromLanguage } from "@/i18n/use-app-locale";

describe("locale defaults", () => {
	test("uses Simplified Chinese for Chinese system languages", () => {
		expect(resolveAppLocaleFromLanguage("zh-CN")).toBe("zh-CN");
		expect(resolveAppLocaleFromLanguage("zh-Hans-US")).toBe("zh-CN");
	});

	test("falls back to English for non-Chinese system languages", () => {
		expect(resolveAppLocaleFromLanguage("en-US")).toBe("en");
		expect(resolveAppLocaleFromLanguage("fr-FR")).toBe("en");
		expect(resolveAppLocaleFromLanguage(undefined)).toBe("en");
	});
});
