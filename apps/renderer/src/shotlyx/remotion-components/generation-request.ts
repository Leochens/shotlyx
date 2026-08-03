import type {
	ShotlyxMGAspectRatio,
	ShotlyxMGContentKind,
	ShotlyxMGPreferenceSource,
} from "./types";

export type ShotlyxMGDurationChoice = "auto" | number;

export interface ShotlyxMGGenerationRequest {
	prompt: string;
	mode: "single" | "sequence";
	componentCount?: number;
	durationSeconds: number;
	durationSource: "prompt" | "ui" | "auto";
	aspectRatio: ShotlyxMGAspectRatio;
	transparentBackground: boolean;
	contentKind: ShotlyxMGContentKind;
	textPolicy: "required" | "optional" | "forbidden";
	preferences: {
		colors: string[];
		colorsSource: ShotlyxMGPreferenceSource;
		fontFamilies: string[];
		fontSource: ShotlyxMGPreferenceSource;
		styleGuide?: string;
		styleSource: ShotlyxMGPreferenceSource;
	};
}

const COLOR_WORDS: ReadonlyArray<[RegExp, string]> = [
	[/暖红|朱红|红色|\bred\b/i, "#dc3c32"],
	[/橙色|暖橙|\borange\b/i, "#ea6a2a"],
	[/黄色|金色|\byellow\b|\bgold\b/i, "#d4a017"],
	[/绿色|翠绿|\bgreen\b/i, "#238b57"],
	[/蓝色|\bblue\b/i, "#2864dc"],
	[/紫色|\bpurple\b/i, "#7551c9"],
	[/粉色|\bpink\b/i, "#d94f86"],
	[/黑色|\bblack\b/i, "#111111"],
	[/白色|\bwhite\b/i, "#ffffff"],
];

function includesAny({
	text,
	patterns,
}: {
	text: string;
	patterns: RegExp[];
}): boolean {
	return patterns.some((pattern) => pattern.test(text));
}

export function hasConcreteMGSubject({ prompt }: { prompt: string }): boolean {
	const subject = prompt
		.replace(/#[0-9a-fA-F]{3,8}\b/g, " ")
		.replace(/\d+(?:\.\d+)?\s*(?:秒|s|secs?|seconds?)/gi, " ")
		.replace(
			/(?:请|帮我|给我|生成|制作|创建|做成|做一个|做一段|来一个|需要|想要)/g,
			" ",
		)
		.replace(
			/(?:MG|motion graphics?|动画|动效|效果|可编辑|透明背景|横屏|竖屏|标题|流程|图表|数据|对比|高级|漂亮|好看)/gi,
			" ",
		)
		.replace(/(?:红色|橙色|黄色|绿色|蓝色|紫色|粉色|黑色|白色)/g, " ")
		.replace(/[\s，。.!！?？；;：:'"“”‘’「」『』《》、/\\_-]+/g, "");
	return subject.length >= 2;
}

export function extractExplicitMGDuration(prompt: string): number | null {
	const patterns = [
		/(?:时长|持续|做成|生成|动画|duration)\s*(?:为|是|:|：)?\s*(\d+(?:\.\d+)?)\s*(?:秒|s|sec(?:ond)?s?)/i,
		/(\d+(?:\.\d+)?)\s*(?:秒|seconds?|secs?)\s*(?:的|时长)?\s*(?:MG|动画)?/i,
	];
	for (const pattern of patterns) {
		const value = Number(prompt.match(pattern)?.[1]);
		if (Number.isFinite(value) && value > 0 && value <= 120) return value;
	}
	return null;
}

export function detectMGSequenceIntent(prompt: string): {
	mode: "single" | "sequence";
	componentCount?: number;
} {
	const sequence = includesAny({
		text: prompt,
		patterns: [
			/MG\s*(?:动画)?\s*(?:拼接|序列|系列)/i,
			/(?:拼接|连续分镜|多个|一组|系列)\s*(?:MG|动效|动画)/i,
			/(?:拆成|分成|生成)\s*\d+\s*(?:个|段|组)\s*(?:MG|动效|动画)/i,
			/(?:multiple|a series of|sequence of)\s+(?:MG|motion graphics?)/i,
		],
	});
	if (!sequence) return { mode: "single" };
	const countMatch = prompt.match(
		/(?:拆成|分成|生成|做成)?\s*(\d+)\s*(?:个|段|组)\s*(?:MG|动效|动画|分镜)/i,
	);
	const count = Number(countMatch?.[1]);
	return {
		mode: "sequence",
		...(Number.isInteger(count) && count > 0 && count <= 20
			? { componentCount: count }
			: {}),
	};
}

export function detectMGContentKind(prompt: string): ShotlyxMGContentKind {
	if (
		includesAny({
			text: prompt,
			patterns: [
				/标注/i,
				/重点/i,
				/callout/i,
				/highlight/i,
				/(?:箭头|圆圈|划线).*[『「“"'][^』」”"']+/i,
			],
		})
	)
		return "callout";
	if (
		includesAny({
			text: prompt,
			patterns: [
				/纯视觉/i,
				/粒子/i,
				/转场/i,
				/箭头/i,
				/圆圈/i,
				/闪光/i,
				/划线/i,
				/effect/i,
				/transition/i,
			],
		})
	)
		return "effect";
	if (
		includesAny({
			text: prompt,
			patterns: [/对比/i, /前后/i, /versus/i, /\bvs\b/i],
		})
	)
		return "comparison";
	if (
		includesAny({
			text: prompt,
			patterns: [/流程/i, /过程/i, /步骤/i, /process/i, /step/i],
		})
	)
		return "process";
	if (
		includesAny({
			text: prompt,
			patterns: [/图表/i, /趋势/i, /柱状/i, /折线/i, /chart/i, /trend/i],
		})
	)
		return "chart";
	if (
		includesAny({
			text: prompt,
			patterns: [/标题/i, /片头/i, /大字/i, /title/i, /headline/i],
		})
	)
		return "title";
	if (
		includesAny({
			text: prompt,
			patterns: [/指标/i, /数据冲击/i, /增长/i, /百分比/i, /metric/i, /kpi/i],
		})
	)
		return "metric";
	return "general";
}

export function extractMGColors(prompt: string): string[] {
	const colors = (prompt.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((color) =>
		color.toLowerCase(),
	);
	for (const [pattern, value] of COLOR_WORDS) {
		if (pattern.test(prompt)) colors.push(value);
	}
	return Array.from(new Set(colors)).slice(0, 4);
}

export function extractMGFontFamilies(prompt: string): string[] {
	const result: string[] = [];
	for (const match of prompt.matchAll(
		/(?:字体|font(?:-family)?)\s*(?:用|使用|为|是|:|：)?\s*["“]?([^\n，。；;"”]{2,48})/gi,
	)) {
		const value = match[1]?.trim();
		if (value) result.push(value);
	}
	return Array.from(new Set(result)).slice(0, 2);
}

function automaticDuration(contentKind: ShotlyxMGContentKind): number {
	if (contentKind === "effect" || contentKind === "callout") return 3;
	if (contentKind === "title" || contentKind === "metric") return 4;
	if (
		contentKind === "chart" ||
		contentKind === "process" ||
		contentKind === "comparison"
	)
		return 6;
	return 5;
}

export function buildShotlyxMGGenerationRequest({
	prompt,
	duration = "auto",
	aspectRatio = "16:9",
	transparentBackground = true,
	styleGuide,
}: {
	prompt: string;
	duration?: ShotlyxMGDurationChoice;
	aspectRatio?: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
	styleGuide?: string;
}): ShotlyxMGGenerationRequest {
	const explicitDuration = extractExplicitMGDuration(prompt);
	const sequence = detectMGSequenceIntent(prompt);
	const contentKind = detectMGContentKind(prompt);
	const noText = includesAny({
		text: prompt,
		patterns: [
			/不出现文字/i,
			/不要文字/i,
			/无文字/i,
			/纯视觉/i,
			/no\s*text/i,
			/without\s+text/i,
		],
	});
	const userColors = extractMGColors(prompt);
	const derivedColors = styleGuide ? extractMGColors(styleGuide) : [];
	const colors = userColors.length ? userColors : derivedColors;
	const userFontFamilies = extractMGFontFamilies(prompt);
	const derivedFontFamilies = styleGuide
		? extractMGFontFamilies(styleGuide)
		: [];
	const fontFamilies = userFontFamilies.length
		? userFontFamilies
		: derivedFontFamilies;
	return {
		prompt: prompt.trim(),
		...sequence,
		durationSeconds:
			explicitDuration ??
			(typeof duration === "number"
				? Math.max(0.1, Math.min(120, duration))
				: automaticDuration(contentKind)),
		durationSource: explicitDuration
			? "prompt"
			: typeof duration === "number"
				? "ui"
				: "auto",
		aspectRatio,
		transparentBackground,
		contentKind,
		textPolicy: noText
			? "forbidden"
			: contentKind === "effect"
				? "optional"
				: "required",
		preferences: {
			colors,
			colorsSource: userColors.length
				? "locked"
				: derivedColors.length
					? "derived"
					: "auto",
			fontFamilies,
			fontSource: userFontFamilies.length
				? "locked"
				: derivedFontFamilies.length
					? "derived"
					: "auto",
			...(styleGuide?.trim() ? { styleGuide: styleGuide.trim() } : {}),
			styleSource: styleGuide?.trim() ? "derived" : "auto",
		},
	};
}
