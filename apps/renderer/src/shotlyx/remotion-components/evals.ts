import {
	buildShotlyxMGGenerationRequest,
	type ShotlyxMGDurationChoice,
} from "./generation-request";
import type { ShotlyxMGAspectRatio, ShotlyxMGContentKind } from "./types";

export interface ShotlyxMGEvalCase {
	id: string;
	prompt: string;
	duration?: ShotlyxMGDurationChoice;
	aspectRatio?: ShotlyxMGAspectRatio;
	styleGuide?: string;
	expected: {
		mode: "single" | "sequence";
		componentCount?: number;
		durationSeconds: number;
		contentKind: ShotlyxMGContentKind;
		textPolicy: "required" | "optional" | "forbidden";
		lockedColor?: string;
		lockedFont?: string;
	};
	manualReview: string[];
}

export const SHOTLYX_MG_EVAL_CASES: ShotlyxMGEvalCase[] = [
	{
		id: "zh-kinetic-title",
		prompt: "做一个 4 秒中文大字标题『年度增长』，暖红色，稳健入场",
		expected: {
			mode: "single",
			durationSeconds: 4,
			contentKind: "title",
			textPolicy: "required",
			lockedColor: "#dc3c32",
		},
		manualReview: ["标题实际可见", "中文字形完整", "不是网页卡片"],
	},
	{
		id: "metric-hit",
		prompt: "生成数据冲击 MG：『增长 38%』，3 秒，主色 #e24a35",
		expected: {
			mode: "single",
			durationSeconds: 3,
			contentKind: "metric",
			textPolicy: "required",
			lockedColor: "#e24a35",
		},
		manualReview: ["38% 未被改写", "数字是视觉主体", "保持段可读"],
	},
	{
		id: "chart-trend",
		prompt: "做一个季度收入折线图动画，数据 12、18、27、35，6 秒",
		expected: {
			mode: "single",
			durationSeconds: 6,
			contentKind: "chart",
			textPolicy: "required",
		},
		manualReview: ["数据未虚构", "图表路径清楚", "标签不碰撞"],
	},
	{
		id: "process-explainer",
		prompt: "用一个 MG 讲清楚注册、验证、完成三步流程",
		duration: 8,
		expected: {
			mode: "single",
			durationSeconds: 8,
			contentKind: "process",
			textPolicy: "required",
		},
		manualReview: ["仍是一个资产", "阅读顺序明确", "三步文字可编辑"],
	},
	{
		id: "comparison",
		prompt: "做一段前后对比 MG：改版前 / 改版后，5 秒",
		expected: {
			mode: "single",
			durationSeconds: 5,
			contentKind: "comparison",
			textPolicy: "required",
		},
		manualReview: ["对比关系一眼可见", "两侧权重合理"],
	},
	{
		id: "transparent-callout",
		prompt: "在视频上叠加箭头标注『点击这里』，2 秒透明背景",
		expected: {
			mode: "single",
			durationSeconds: 2,
			contentKind: "callout",
			textPolicy: "required",
		},
		manualReview: ["透明背景", "箭头确实指向标注", "文案实际可见"],
	},
	{
		id: "pure-visual",
		prompt: "纯视觉圆环扩散和粒子收束，不出现文字，3 秒",
		expected: {
			mode: "single",
			durationSeconds: 3,
			contentKind: "effect",
			textPolicy: "forbidden",
		},
		manualReview: ["没有任何文字", "代表帧不为空", "收束完整"],
	},
	{
		id: "vertical-title",
		prompt: "9:16 竖屏产品发布标题『轻装上阵』，5 秒",
		aspectRatio: "9:16",
		expected: {
			mode: "single",
			durationSeconds: 5,
			contentKind: "title",
			textPolicy: "required",
		},
		manualReview: ["竖屏安全区合理", "标题不超宽"],
	},
	{
		id: "long-copy",
		prompt:
			"标题『让每一次创作都更接近你真正想表达的样子』，副标题『Shotlyx 本地视频工作流』，8 秒",
		expected: {
			mode: "single",
			durationSeconds: 8,
			contentKind: "title",
			textPolicy: "required",
		},
		manualReview: ["长文案不截断", "不超过最大行数", "层级清楚"],
	},
	{
		id: "locked-font-color",
		prompt: "用字体 Source Han Sans 做标题『可信增长』，颜色 #b42318，5 秒",
		expected: {
			mode: "single",
			durationSeconds: 5,
			contentKind: "title",
			textPolicy: "required",
			lockedColor: "#b42318",
			lockedFont: "Source Han Sans",
		},
		manualReview: ["字体与红色色相未被修复替换", "低对比时通过背景适配"],
	},
	{
		id: "english-headline",
		prompt: "Create a 4 second kinetic title: “Built for focus”",
		expected: {
			mode: "single",
			durationSeconds: 4,
			contentKind: "title",
			textPolicy: "required",
		},
		manualReview: ["English kerning is clean", "headline comes from props"],
	},
	{
		id: "one-second-effect",
		prompt: "做一个 1 秒闪光划线强调效果",
		expected: {
			mode: "single",
			durationSeconds: 1,
			contentKind: "effect",
			textPolicy: "optional",
		},
		manualReview: ["一秒内完成建立即收束", "没有空等"],
	},
	{
		id: "explicit-sequence",
		prompt: "生成 3 个 MG 动画拼接，分别讲问题、方法、结果，总时长 12 秒",
		expected: {
			mode: "sequence",
			componentCount: 3,
			durationSeconds: 12,
			contentKind: "general",
			textPolicy: "required",
		},
		manualReview: ["生成三个独立资产", "每段有语义名称"],
	},
	{
		id: "sequence-needs-confirmation",
		prompt: "做一组连续分镜 MG，讲清楚新品发布过程",
		expected: {
			mode: "sequence",
			durationSeconds: 6,
			contentKind: "process",
			textPolicy: "required",
		},
		manualReview: ["生成前先给分镜并确认数量", "不得直接默认五个"],
	},
	{
		id: "brand-derived",
		prompt: "做一个观点强调 MG，标题『少即是多』",
		styleGuide: "品牌主色 #3957d7；字体使用 Noto Sans CJK SC；克制、留白",
		expected: {
			mode: "single",
			durationSeconds: 4,
			contentKind: "title",
			textPolicy: "required",
		},
		manualReview: ["品牌色和字体进入 VisualDNA", "不凭空增加霓虹渐变"],
	},
];

export function runShotlyxMGEvalCase(testCase: ShotlyxMGEvalCase): {
	passed: boolean;
	failures: string[];
} {
	const request = buildShotlyxMGGenerationRequest({
		prompt: testCase.prompt,
		duration: testCase.duration ?? "auto",
		aspectRatio: testCase.aspectRatio ?? "16:9",
		styleGuide: testCase.styleGuide,
	});
	const failures: string[] = [];
	for (const [key, expected] of Object.entries(testCase.expected)) {
		if (key === "lockedColor") {
			if (!request.preferences.colors.includes(String(expected))) {
				failures.push(`lockedColor expected ${expected}`);
			}
			continue;
		}
		if (key === "lockedFont") {
			if (
				!request.preferences.fontFamilies.some((font) =>
					font.includes(String(expected)),
				)
			) {
				failures.push(`lockedFont expected ${expected}`);
			}
			continue;
		}
		const actual = Reflect.get(request, key);
		if (actual !== expected)
			failures.push(`${key} expected ${expected}, received ${actual}`);
	}
	return { passed: failures.length === 0, failures };
}
