import { describe, expect, test } from "bun:test";
import {
	buildMotionGraphicElementFromAsset,
	buildProjectMotionGraphicAsset,
} from "@/motion-graphics/project-assets";
import type { MediaTime } from "@/wasm";

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ZERO_TIME = 0 as MediaTime;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ONE_SECOND = 90_000 as MediaTime;

describe("project motion graphic assets", () => {
	test("builds timeline instances that keep asset params separate from overrides", () => {
		const asset = buildProjectMotionGraphicAsset({
			name: "Reusable title",
			definitionId: "mg-title-card",
			duration: ONE_SECOND,
			params: {
				title: "Asset title",
				subtitle: "Asset subtitle",
				accentColor: "#76b900",
				progress: 1,
			},
			kind: "title",
			sourcePrompt: "生成一个标题 MG",
		});

		const element = buildMotionGraphicElementFromAsset({
			asset,
			startTime: ZERO_TIME,
			params: {
				title: "Instance title",
			},
		});

		expect(element.motionGraphicAssetId).toBe(asset.id);
		expect(element.motionGraphicBaseParams?.title).toBe("Asset title");
		expect(element.motionGraphicBaseParams?.subtitle).toBe("Asset subtitle");
		expect(element.motionGraphicBaseParams?.accentColor).toBe("#76b900");
		expect(element.params.title).toBe("Instance title");
		expect(element.params.subtitle).toBeUndefined();
		expect(element.params.accentColor).toBeUndefined();
	});
});
