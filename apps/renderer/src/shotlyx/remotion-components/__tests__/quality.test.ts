import { describe, expect, test } from "bun:test";
import {
	assertShotlyxMGHardQuality,
	evaluateShotlyxMGLocalQuality,
} from "../quality";
import type { ShotlyxRemotionComponentDocument } from "../types";

function buildDocument(): ShotlyxRemotionComponentDocument {
	return {
		version: 1,
		runtime: "shotlyx-remotion-component-v1",
		name: "Quality fixture",
		durationSeconds: 4,
		fps: 30,
		width: 1920,
		height: 1080,
		aspectRatio: "16:9",
		componentSource:
			"export default function ShotlyxComponent({title}) { const frame = useCurrentFrame(); return <div style={{maxWidth: 1200}}>{title}{frame}</div>; }",
		compiledModule: "export default function ShotlyxComponent() {}",
		propsSchema: [
			{
				key: "title",
				label: "Title",
				type: "text",
				role: "content",
				default: "实际文字",
			},
			{
				key: "primaryColor",
				label: "Primary",
				type: "color",
				role: "style",
				default: "#777777",
			},
			{
				key: "backgroundColor",
				label: "Background",
				type: "color",
				role: "style",
				default: "#787878",
			},
		],
		defaultProps: {
			title: "实际文字",
			primaryColor: "#777777",
			backgroundColor: "#787878",
		},
		sourcePrompt: "生成实际文字标题",
		motionSpec: {
			version: 1,
			textPolicy: "required",
			readingOrder: ["hero"],
			elements: [
				{
					id: "hero",
					role: "hero",
					contentSource: "user",
					priority: 1,
				},
			],
			beats: [
				{ id: "build", label: "建立", start: 0, end: 0.24 },
				{ id: "hold", label: "保持", start: 0.24, end: 0.82 },
				{ id: "resolve", label: "收束", start: 0.82, end: 1 },
			],
			constraints: [],
		},
	};
}

describe("Shotlyx MG local visual quality", () => {
	test("keeps low contrast as a repairable warning when text is visible", () => {
		const report = evaluateShotlyxMGLocalQuality({
			document: buildDocument(),
			frames: [
				{ frame: 0, markup: '<div style="max-width:1200px">实际文字</div>' },
				{ frame: 30, markup: '<div style="max-width:1200px">实际文字</div>' },
			],
		});

		expect(report.status).toBe("needs-attention");
		expect(report.issues.map((issue) => issue.code)).toContain(
			"low-color-contrast",
		);
		expect(() => assertShotlyxMGHardQuality(report)).not.toThrow();
	});

	test("blocks content MG when editable text is missing from every frame", () => {
		const report = evaluateShotlyxMGLocalQuality({
			document: buildDocument(),
			frames: [
				{ frame: 0, markup: '<div style="width:400px;height:200px"></div>' },
				{ frame: 30, markup: '<div style="width:400px;height:200px"></div>' },
			],
		});

		expect(report.status).toBe("needs-attention");
		expect(report.issues.map((issue) => issue.code)).toContain(
			"required-text-not-rendered",
		);
		expect(() => assertShotlyxMGHardQuality(report)).toThrow(
			"required-text-not-rendered",
		);
	});

	test("blocks element coordinates that stay far outside the canvas", () => {
		const report = evaluateShotlyxMGLocalQuality({
			document: buildDocument(),
			frames: [0, 30, 60, 90].map((frame) => ({
				frame,
				markup:
					'<div style="left:2600px;top:100px;width:200px;height:100px">实际文字</div>',
			})),
		});

		expect(report.status).toBe("needs-attention");
		expect(report.issues.map((issue) => issue.code)).toContain(
			"elements-far-outside-canvas",
		);
	});
});
