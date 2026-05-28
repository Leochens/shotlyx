import { describe, expect, test } from "bun:test";
import {
	buildRemotionMGCompositionPrompt,
	buildSeedanceMediaPrompt,
} from "../prompt-builders";

describe("chat prompt builders", () => {
	test("builds a Seedance media prompt with reference state", () => {
		expect(
			buildSeedanceMediaPrompt({
				description: "生成一段海边产品展示",
				aspectRatio: "16:9",
				durationSeconds: 5,
				hasReferences: true,
			}),
		).toContain("creative_generate_seedance_video");
	});

	test("builds a Remotion MG composition prompt with the selected template", () => {
		const prompt = buildRemotionMGCompositionPrompt({
			description: "给数据视频加标题、圆圈和表格",
			templateLabel: "数据图表",
			styleGuide: "高级数据展示 MG 模板",
			componentCount: 4,
			aspectRatio: "16:9",
			durationSeconds: 5,
		});

		expect(prompt).toContain("shotlyx_generate_mg_composition");
		expect(prompt).toContain("数据图表");
		expect(prompt).toContain('"componentCount":4');
		expect(prompt).toContain("propsSchema/defaultProps");
		expect(prompt).toContain("只允许使用 Remotion / Shotlyx Component");
		expect(prompt).toContain("稳定唯一 key");
		expect(prompt).toContain("只问一个简短问题让用户选择风格/目标");
		expect(prompt).toContain("自动缩短到 1-2s");
		expect(prompt).not.toContain("shotlyx_generate_hyperframes_overlay");
	});

	test("builds a Remotion MG prompt that forces a selected builtin template", () => {
		const prompt = buildRemotionMGCompositionPrompt({
			description: "做一个标题大字展示",
			templateLabel: "标题大字展示",
			styleGuide: "大标题、副标题、标签和高亮扫线的透明 MG 标题模板。",
			componentCount: 1,
			aspectRatio: "16:9",
			durationSeconds: 5,
			templateMode: "auto",
			templateId: "title-reveal",
		});

		expect(prompt).toContain('"templateMode":"force"');
		expect(prompt).toContain('"templateId":"title-reveal"');
		expect(prompt).toContain('必须传入 templateMode:"force" 和 templateId');
	});
});
