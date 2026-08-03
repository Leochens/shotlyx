import { describe, expect, test } from "bun:test";
import {
	buildRemotionMGPrompt,
	buildRemotionMGCompositionPrompt,
	buildRemotionMGSubmission,
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

	test("builds one complete MG by default and lets prompt duration win", () => {
		const prompt = buildRemotionMGPrompt({
			description: "做一个 2 秒标题『年度增长』，用红色",
			aspectRatio: "16:9",
			duration: 8,
		});

		expect(prompt).toContain("shotlyx_generate_mg_component");
		expect(prompt).toContain('"durationSeconds":2');
		expect(prompt).toContain("不要拆成多个 MG");
	});

	test("keeps MG orchestration hidden behind the original user request", () => {
		const submission = buildRemotionMGSubmission({
			description: "  帮我生成一段中国人口近十年变化的 MG 动画  ",
			aspectRatio: "16:9",
			duration: 5,
		});

		expect(submission.displayPrompt).toBe(
			"帮我生成一段中国人口近十年变化的 MG 动画",
		);
		expect(submission.displayPrompt).not.toContain("shotlyx_generate");
		expect(submission.requestPrompt).toContain("shotlyx_generate_mg_component");
	});

	test("lets chat color and font override generator selections", () => {
		const result = buildRemotionMGSubmission({
			description:
				"生成标题『可信增长』，主色 #b42318，字体使用 Source Han Sans",
			aspectRatio: "16:9",
			duration: 5,
			primaryColor: "#2864dc",
			fontFamily: "PingFang SC",
		});

		expect(result.requestPrompt).toContain("#b42318");
		expect(result.requestPrompt).toContain("Source Han Sans");
		expect(result.requestPrompt).not.toContain("#2864dc");
		expect(result.requestPrompt).not.toContain("PingFang SC");
	});

	test("requires storyboard confirmation for an uncounted MG sequence", () => {
		const prompt = buildRemotionMGPrompt({
			description: "做一组连续分镜 MG",
			aspectRatio: "9:16",
			duration: "auto",
		});

		expect(prompt).toContain("先按语义给出一个简短分镜");
		expect(prompt).toContain("用户确认前不要调用生成工具");
	});

	test("asks once instead of generating when the MG has no subject", () => {
		const prompt = buildRemotionMGPrompt({
			description: "帮我做一个 5 秒好看的 MG 动画",
			aspectRatio: "16:9",
			duration: "auto",
		});

		expect(prompt).toContain("只追问一次核心内容");
		expect(prompt).not.toContain("shotlyx_generate_mg_component");
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
		expect(prompt).toContain("默认不要使用内置模板");
		expect(prompt).toContain('templateMode:"force"');
		expect(prompt).toContain("不指定模板类型");
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
