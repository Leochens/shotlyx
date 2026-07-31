import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_THEME, ThemeProvider, useTheme } from "@/platform/theme";

function ThemeProbe() {
	const { theme, resolvedTheme } = useTheme();
	return createElement("span", null, `${theme}:${resolvedTheme}`);
}

describe("theme defaults", () => {
	test("defaults fresh sessions to dark mode", () => {
		expect(DEFAULT_THEME).toBe("dark");
		expect(
			renderToStaticMarkup(
				createElement(ThemeProvider, null, createElement(ThemeProbe)),
			),
		).toContain("dark:dark");
	});
});
