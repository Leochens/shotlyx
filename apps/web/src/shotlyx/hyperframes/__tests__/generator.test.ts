import { describe, expect, test } from "bun:test";
import {
	generateShotlyxHyperFramesDocument,
	rebuildShotlyxHyperFramesDocument,
} from "../generator";
import { listShotlyxHyperFramesTemplates } from "../templates";
import { validateShotlyxHyperFramesDocument } from "../validator";

describe("Shotlyx HyperFrames generator", () => {
	test("exposes multiple style templates for user choice", () => {
		const templates = listShotlyxHyperFramesTemplates();

		expect(templates.map((template) => template.id)).toEqual([
			"swiss-pulse-explainer",
			"kinetic-launch-type",
			"data-drift-ai",
			"editorial-spotlight",
		]);
		expect(
			templates.every(
				(template) =>
					template.propsSchema.some((prop) => prop.key === "title") &&
					template.propsSchema.some((prop) => prop.key === "accentColor") &&
					template.principles.length >= 3,
			),
		).toBe(true);
	});

	test("generates a parameterized HyperFrames HTML composition", async () => {
		const document = await generateShotlyxHyperFramesDocument({
			prompt: "给人物旁边加一个高级感箭头，提示这里是关键步骤",
			templateId: "data-drift-ai",
			durationSeconds: 6,
			aspectRatio: "16:9",
		});

		expect(document.runtime).toBe("shotlyx-hyperframes-overlay-v1");
		expect(document.templateId).toBe("data-drift-ai");
		expect(document.propsSchema.every((prop) => prop.label)).toBe(true);
		expect(document.htmlSource).toContain("data-composition-variables");
		expect(document.htmlSource).toContain("window.__hyperframes.getVariables");
		expect(document.htmlSource).toContain("gsap.timeline");
		expect(document.htmlSource).toContain("paused: true");
		expect(document.htmlSource).toContain("window.__timelines");
		expect(document.htmlSource).toContain("strokeDashoffset");
		expect(document.render.status).toBe("simulated");
		expect(validateShotlyxHyperFramesDocument({ document }).valid).toBe(true);
	});

	test("rebuilds html when editable props change", async () => {
		const document = await generateShotlyxHyperFramesDocument({
			prompt: "字幕强调：把成交率翻倍这几个字做成黄色动效",
			templateId: "kinetic-launch-type",
		});
		const updated = rebuildShotlyxHyperFramesDocument({
			document,
			props: {
				title: "成交率翻倍",
				callout: "重点看这里",
				accentColor: "#ffd60a",
			},
		});

		expect(updated.defaultProps.title).toBe("成交率翻倍");
		expect(updated.htmlSource).toContain("成交率翻倍");
		expect(updated.htmlSource).toContain("重点看这里");
		expect(updated.render.status).toBe("simulated");
		expect(
			validateShotlyxHyperFramesDocument({ document: updated }).valid,
		).toBe(true);
	});
});
