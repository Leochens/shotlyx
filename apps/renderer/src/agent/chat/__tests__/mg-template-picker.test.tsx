import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	MGTemplatePreview,
	buildMGTemplatePickerOptions,
} from "../mg-template-picker";

describe("MG template picker", () => {
	test("exposes smart mode plus builtin templates for the bottom toolbar", () => {
		const options = buildMGTemplatePickerOptions();

		expect(options[0]).toMatchObject({
			value: "smart-composition",
			templateMode: "auto",
		});
		expect(options.map((option) => option.value)).toEqual(
			expect.arrayContaining([
				"title-reveal",
				"metric-emphasis",
				"annotation-callout",
				"data-table",
			]),
		);
	});

	test("renders a visual preview for a builtin template", () => {
		const html = renderToStaticMarkup(
			<MGTemplatePreview templateId="annotation-callout" />,
		);

		expect(html).toContain('data-template-preview="annotation-callout"');
		expect(html).toContain("rounded-full");
		expect(html).toContain("标注");
	});
});
