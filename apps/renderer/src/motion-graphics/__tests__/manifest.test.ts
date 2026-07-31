import { describe, expect, test } from "bun:test";
import { mgBattleCardGraphicDefinition } from "@/graphics/definitions/motion-graphics";
import { buildMotionGraphicManifest } from "@/motion-graphics/manifest";

describe("buildMotionGraphicManifest", () => {
	test("describes editable MG params without hidden animation progress", () => {
		const manifest = buildMotionGraphicManifest({
			definition: mgBattleCardGraphicDefinition,
			kind: "battle-card",
			params: {
				title: "NVIDIA vs AMD",
				leftHp: 40,
				rightColor: "#76b900",
				progress: 1,
			},
			sourcePrompt: "做一个 NVIDIA vs AMD 对战 MG",
			generatedAt: "2026-05-16T00:00:00.000Z",
			updatedAt: "2026-05-16T00:01:00.000Z",
		});

		expect(manifest.version).toBe(1);
		expect(manifest.engine).toBe("opencut-graphic-v1");
		expect(manifest.definitionId).toBe("mg-battle-card");
		expect(manifest.kind).toBe("battle-card");
		expect(manifest.sourcePrompt).toBe("做一个 NVIDIA vs AMD 对战 MG");
		expect(manifest.generatedAt).toBe("2026-05-16T00:00:00.000Z");
		expect(manifest.updatedAt).toBe("2026-05-16T00:01:00.000Z");
		expect(
			manifest.editableParams.some((param) => param.key === "progress"),
		).toBe(false);

		const title = manifest.editableParams.find(
			(param) => param.key === "title",
		);
		expect(title).toMatchObject({
			label: "Title",
			type: "text",
			role: "content",
			value: "NVIDIA vs AMD",
		});

		const leftHp = manifest.editableParams.find(
			(param) => param.key === "leftHp",
		);
		expect(leftHp).toMatchObject({
			type: "number",
			role: "data",
			value: 40,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		});

		const font = manifest.editableParams.find(
			(param) => param.key === "fontFamily",
		);
		expect(font).toMatchObject({
			type: "font",
			role: "typography",
			value: "Arial",
		});

		const rightColor = manifest.editableParams.find(
			(param) => param.key === "rightColor",
		);
		expect(rightColor).toMatchObject({
			type: "color",
			role: "style",
			value: "#76b900",
		});

		expect(manifest.scene).toMatchObject({
			version: 1,
			canvas: {
				width: 1920,
				height: 1080,
				aspectRatio: "16:9",
			},
			animation: {
				progressParam: "progress",
			},
		});
		expect(manifest.scene?.animation.phases).toHaveLength(3);

		const rightHpBar = manifest.scene?.nodes.find(
			(node) => node.id === "right-hp-bar",
		);
		expect(rightHpBar).toMatchObject({
			kind: "bar",
			label: "Right HP bar",
			paramRefs: [
				{ key: "rightHp", role: "data" },
				{ key: "rightColor", role: "style" },
			],
		});
	});
});
