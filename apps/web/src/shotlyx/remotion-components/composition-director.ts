import type { ShotlyxMGAspectRatio } from "./types";

export type ShotlyxMGTimelineMode = "series" | "overlay";
export type ShotlyxMGGenerationMode = "custom-code" | "forced-template";
export type ShotlyxMGTransition = "none" | "fade" | "slide" | "wipe";

export interface ShotlyxMGSceneTiming {
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
	startFrame: number;
	durationFrames: number;
	display: string;
}

export interface ShotlyxMGStyleTokens {
	theme: string;
	palette: {
		background: string;
		foreground: string;
		accent: string;
		warning: string;
		rawHexColors: string[];
	};
	typography: {
		tone: string;
		textDensity: string;
	};
	motion: {
		energy: string;
		continuity: string;
	};
}

interface ShotlyxMGScenePropsIntent extends Record<string, unknown> {
	subject: string;
	prompt: string;
	segmentIndex: number;
	segmentCount: number;
	quotedText: string[];
	numbers: string[];
	colors: string[];
	constraints: {
		noText: boolean;
		transparentBackground: boolean;
	};
}

export interface ShotlyxMGCompositionScenePlan {
	sceneId: string;
	templateId?: string;
	generationMode: ShotlyxMGGenerationMode;
	label: string;
	focus: string;
	visualRole: string;
	timing: ShotlyxMGSceneTiming;
	durationSeconds: number;
	screenTiming: string;
	propsIntent: Record<string, unknown>;
	animationDirection: string;
	transitionIn: ShotlyxMGTransition;
	transitionOut: ShotlyxMGTransition;
	backgroundMode: "transparent" | "solid" | "inherit";
	textPolicy: "allow-text" | "minimal-text" | "no-text";
	qualityBar: string;
	validationChecks: string[];
}

export type ShotlyxMGCompositionComponentPlan = ShotlyxMGCompositionScenePlan;

export interface ShotlyxMGCompositionDirectorPlan {
	title: string;
	visualStyle: string;
	narrativeArc: string;
	fps: number;
	width: number;
	height: number;
	totalDurationSeconds: number;
	totalDurationFrames: number;
	timelineMode: ShotlyxMGTimelineMode;
	styleTokens: ShotlyxMGStyleTokens;
	scenes: ShotlyxMGCompositionScenePlan[];
	components: ShotlyxMGCompositionScenePlan[];
}

export interface CreateShotlyxMGCompositionPlanOptions {
	prompt: string;
	componentCount: number;
	durationSeconds?: number;
	styleGuide?: string;
	aspectRatio?: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
}

const DEFAULT_FPS = 30;
const DEFAULT_COMPONENT_DURATION_SECONDS = 3;
const MAX_TOTAL_DURATION_SECONDS = 120;
const MIN_COMPONENT_DURATION_SECONDS = 0.8;

function clampRequestedTotalDuration({
	value,
	componentCount,
}: {
	value?: number;
	componentCount: number;
}): number {
	const fallback = componentCount * DEFAULT_COMPONENT_DURATION_SECONDS;
	if (!Number.isFinite(value)) {
		return fallback;
	}
	return Math.min(Math.max(value ?? fallback, 0), MAX_TOTAL_DURATION_SECONDS);
}

function roundSeconds(value: number): number {
	return Number(value.toFixed(4));
}

function frameTimingFor({
	startFrame,
	durationFrames,
	fps,
}: {
	startFrame: number;
	durationFrames: number;
	fps: number;
}): ShotlyxMGSceneTiming {
	const startSeconds = roundSeconds(startFrame / fps);
	const durationSeconds = roundSeconds(durationFrames / fps);
	const endSeconds = roundSeconds((startFrame + durationFrames) / fps);
	return {
		startSeconds,
		endSeconds,
		durationSeconds,
		startFrame,
		durationFrames,
		display: `${startSeconds.toFixed(1)}s-${endSeconds.toFixed(1)}s`,
	};
}

function distributeSceneTimings({
	componentCount,
	requestedDurationSeconds,
	fps,
}: {
	componentCount: number;
	requestedDurationSeconds?: number;
	fps: number;
}): {
	timings: ShotlyxMGSceneTiming[];
	totalDurationSeconds: number;
	totalDurationFrames: number;
} {
	const requestedTotalSeconds = clampRequestedTotalDuration({
		value: requestedDurationSeconds,
		componentCount,
	});
	const minFramesPerScene = Math.max(
		1,
		Math.round(MIN_COMPONENT_DURATION_SECONDS * fps),
	);
	const minTotalFrames = minFramesPerScene * componentCount;
	const requestedTotalFrames = Math.round(requestedTotalSeconds * fps);
	const totalDurationFrames = Math.max(minTotalFrames, requestedTotalFrames);
	const baseFrames = Math.floor(totalDurationFrames / componentCount);
	const remainder = totalDurationFrames % componentCount;
	let cursorFrame = 0;
	const timings = Array.from({ length: componentCount }, (_, index) => {
		const durationFrames = baseFrames + (index < remainder ? 1 : 0);
		const timing = frameTimingFor({
			startFrame: cursorFrame,
			durationFrames,
			fps,
		});
		cursorFrame += durationFrames;
		return timing;
	});
	return {
		timings,
		totalDurationSeconds: roundSeconds(totalDurationFrames / fps),
		totalDurationFrames,
	};
}

function canvasSizeForAspectRatio(aspectRatio: ShotlyxMGAspectRatio): {
	width: number;
	height: number;
} {
	if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
	if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
	return { width: 1920, height: 1080 };
}

function uniqueItems(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function extractQuotedText(prompt: string): string[] {
	const snippets: string[] = [];
	const quotePattern = /[「『《“"]([^」』》”"]{1,80})[」』》”"]/g;
	for (const match of prompt.matchAll(quotePattern)) {
		const value = match[1]?.trim();
		if (value) snippets.push(value);
	}
	return uniqueItems(snippets);
}

function extractHexColors(text: string): string[] {
	const colors = text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
	return uniqueItems(colors.map((color) => color.toLowerCase()));
}

function extractNumbers(prompt: string): string[] {
	const withoutColors = prompt
		.replace(/#[0-9a-fA-F]{3,8}\b/g, " ")
		.replace(/(\d)\s*[-—–]\s*(\d)/g, "$1 $2");
	const numbers = withoutColors.match(/[-+]?\d+(?:\.\d+)?%?/g) ?? [];
	return uniqueItems(numbers);
}

function compactSubject({ prompt }: { prompt: string }): string {
	const normalized = prompt
		.replace(/\s+/g, " ")
		.replace(/工具参数[:：]\{.*$/s, "")
		.trim();
	const quoted = extractQuotedText(normalized)[0] ?? "";
	const firstClause = normalized
		.split(/[。.!！?？；;，,\n]/)
		.map((part) => part.trim())
		.find(Boolean);
	const value = quoted || firstClause || normalized || "当前需求";
	return value.length > 48 ? value.slice(0, 47).trim() : value;
}

function includesAny({
	text,
	patterns,
}: {
	text: string;
	patterns: RegExp[];
}): boolean {
	return patterns.some((pattern) => pattern.test(text));
}

function detectNoText(prompt: string): boolean {
	return includesAny({
		text: prompt,
		patterns: [
			/不出现文字/i,
			/不要文字/i,
			/无文字/i,
			/纯视觉/i,
			/no\s*text/i,
			/text-free/i,
			/without\s+text/i,
		],
	});
}

function detectTransparentBackground({
	prompt,
	transparentBackground,
}: {
	prompt: string;
	transparentBackground?: boolean;
}): boolean {
	if (transparentBackground !== undefined) return transparentBackground;
	return includesAny({
		text: prompt,
		patterns: [/透明背景/i, /transparent\s+background/i],
	});
}

function detectTimelineMode(prompt: string): ShotlyxMGTimelineMode {
	return includesAny({
		text: prompt,
		patterns: [/叠加/i, /overlay/i, /同时/i],
	})
		? "overlay"
		: "series";
}

function isRedLike(hex: string): boolean {
	const normalized = hex.replace("#", "");
	if (normalized.length < 6) return false;
	const red = Number.parseInt(normalized.slice(0, 2), 16);
	const green = Number.parseInt(normalized.slice(2, 4), 16);
	const blue = Number.parseInt(normalized.slice(4, 6), 16);
	return red > 180 && green < 120 && blue < 140;
}

function buildStyleTokens({
	prompt,
	styleGuide,
}: {
	prompt: string;
	styleGuide?: string;
}): ShotlyxMGStyleTokens {
	const source = `${prompt}\n${styleGuide ?? ""}`;
	const colors = extractHexColors(source);
	const dark = includesAny({
		text: source,
		patterns: [/深色/i, /暗色/i, /dark/i, /cyber/i],
	});
	const data = includesAny({
		text: source,
		patterns: [/数据/i, /图表/i, /chart/i, /table/i],
	});
	const pureVisual = detectNoText(source);
	const accent =
		colors.find((color) => !isRedLike(color)) ?? colors[0] ?? "#22d3ee";
	const warning =
		colors.find((color) => isRedLike(color)) ?? colors[1] ?? "#ef4444";
	return {
		theme: dark ? "dark-video-graphics" : "clean-video-graphics",
		palette: {
			background: dark ? "#000000" : "#ffffff",
			foreground: dark ? "#ffffff" : "#111111",
			accent,
			warning,
			rawHexColors: colors,
		},
		typography: {
			tone: pureVisual ? "none" : data ? "data-readable" : "editorial-clear",
			textDensity: pureVisual ? "none" : "sparse",
		},
		motion: {
			energy: includesAny({
				text: source,
				patterns: [/爆炸/i, /冲击/i, /快速/i, /burst/i],
			})
				? "high"
				: "controlled",
			continuity: includesAny({
				text: source,
				patterns: [/循环/i, /loop/i, /连续/i],
			})
				? "looping"
				: "scene-local",
		},
	};
}

function buildValidationChecks({
	prompt,
	numbers,
	quotedText,
	noText,
	transparentBackground,
}: {
	prompt: string;
	numbers: string[];
	quotedText: string[];
	noText: boolean;
	transparentBackground: boolean;
}): string[] {
	const checks = [
		"no-placeholder-text",
		"must-have-primary-subject",
		"readable-at-1080p",
	];
	if (transparentBackground) checks.push("transparent-background");
	if (noText) checks.push("no-text");
	if (
		numbers.length > 0 ||
		quotedText.length > 0 ||
		includesAny({
			text: prompt,
			patterns: [/数据/i, /指标/i, /图表/i, /人口/i, /增长/i],
		})
	) {
		checks.push("must-use-real-user-data");
	}
	return uniqueItems(checks);
}

function buildPropsIntent({
	prompt,
	subject,
	index,
	total,
	noText,
	transparentBackground,
}: {
	prompt: string;
	subject: string;
	index: number;
	total: number;
	noText: boolean;
	transparentBackground: boolean;
}): ShotlyxMGScenePropsIntent {
	return {
		subject,
		prompt,
		segmentIndex: index + 1,
		segmentCount: total,
		quotedText: extractQuotedText(prompt),
		numbers: extractNumbers(prompt),
		colors: extractHexColors(prompt),
		constraints: {
			noText,
			transparentBackground,
		},
	};
}

function buildScenePlan({
	index,
	total,
	prompt,
	subject,
	timing,
	styleTokens,
	transparentBackground,
	noText,
}: {
	index: number;
	total: number;
	prompt: string;
	subject: string;
	timing: ShotlyxMGSceneTiming;
	styleTokens: ShotlyxMGStyleTokens;
	transparentBackground: boolean;
	noText: boolean;
}): ShotlyxMGCompositionScenePlan {
	const segmentNumber = index + 1;
	const propsIntent = buildPropsIntent({
		prompt,
		subject,
		index,
		total,
		noText,
		transparentBackground,
	});
	const quotedText = propsIntent.quotedText;
	const numbers = propsIntent.numbers;
	return {
		sceneId: `custom-segment-${segmentNumber}`,
		generationMode: "custom-code",
		label: `自定义片段 ${segmentNumber}/${total}`,
		focus: [
			`根据原始需求自行设计第 ${segmentNumber}/${total} 个 MG 片段的唯一视觉意图。`,
			"不要从固定模板类型中选择，也不要把标题、指标、标注、表格、流程或总结当成默认流程。",
			"这个片段只负责一个明确的视觉动作、状态、信息变化或空间关系，并且要和其它片段避免重复。",
			`原始需求：${prompt}`,
		].join(" "),
		visualRole:
			"由子 Agent 根据原始需求自由定义；可以使用文字、数字、图形、数据可视化、粒子、路径、遮罩、镜头、纹理或其它 Remotion 代码结构，但必须服务于本片段意图。",
		timing,
		durationSeconds: timing.durationSeconds,
		screenTiming: timing.display,
		propsIntent,
		animationDirection:
			"自行设计贯穿全时长的入场、持续变化、退场或循环节奏；不要一秒动完后空等，也不要复刻其它片段的运动。",
		transitionIn: index === 0 ? "none" : "fade",
		transitionOut: index === total - 1 ? "none" : "fade",
		backgroundMode: transparentBackground ? "transparent" : "solid",
		textPolicy: noText
			? "no-text"
			: quotedText.length > 0
				? "allow-text"
				: "minimal-text",
		qualityBar: [
			"必须是针对原始需求重新设计的自定义构图和动效。",
			"不能套用内置标题/指标/标注/表格模板结构，不能保留占位文案。",
			noText ? "用户要求无文字：不要新增任何文字或文字 props。" : "",
			transparentBackground ? "用户要求透明背景：不要绘制全画布实底。" : "",
			`使用 styleTokens：${styleTokens.theme} / ${styleTokens.motion.energy}。`,
		]
			.filter(Boolean)
			.join(" "),
		validationChecks: buildValidationChecks({
			prompt,
			numbers,
			quotedText,
			noText,
			transparentBackground,
		}),
	};
}

export function createShotlyxMGCompositionPlan({
	prompt,
	componentCount,
	durationSeconds,
	styleGuide,
	aspectRatio = "16:9",
	transparentBackground,
}: CreateShotlyxMGCompositionPlanOptions): ShotlyxMGCompositionDirectorPlan {
	const safeComponentCount = Math.max(Math.floor(componentCount), 1);
	const fps = DEFAULT_FPS;
	const subject = compactSubject({ prompt });
	const size = canvasSizeForAspectRatio(aspectRatio);
	const transparent = detectTransparentBackground({
		prompt,
		transparentBackground,
	});
	const noText = detectNoText(prompt);
	const styleTokens = buildStyleTokens({ prompt, styleGuide });
	const { timings, totalDurationFrames, totalDurationSeconds } =
		distributeSceneTimings({
			componentCount: safeComponentCount,
			requestedDurationSeconds: durationSeconds,
			fps,
		});
	const scenes = timings.map((timing, index) =>
		buildScenePlan({
			index,
			total: safeComponentCount,
			prompt,
			subject,
			timing,
			styleTokens,
			transparentBackground: transparent,
			noText,
		}),
	);
	return {
		title: `${subject} · 自定义 MG`,
		visualStyle:
			styleGuide?.trim() ||
			"自定义 Remotion MG：由子 Agent 根据需求决定构图、视觉语言、数据结构和运动机制。",
		narrativeArc:
			"Director 只负责时间切片、可执行 timing、props 意图和质量约束，不枚举动画类型、不分配模板角色；每个子 Agent 必须从原始需求中自行设计本片段的视觉意图。",
		fps,
		width: size.width,
		height: size.height,
		totalDurationSeconds,
		totalDurationFrames,
		timelineMode: detectTimelineMode(prompt),
		styleTokens,
		scenes,
		components: scenes,
	};
}
