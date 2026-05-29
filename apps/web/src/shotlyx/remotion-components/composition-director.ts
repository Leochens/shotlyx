export interface ShotlyxMGCompositionComponentPlan {
	id: string;
	label: string;
	focus: string;
	visualRole: string;
	durationSeconds: number;
	screenTiming: string;
	animationDirection: string;
	qualityBar: string;
}

export interface ShotlyxMGCompositionDirectorPlan {
	title: string;
	visualStyle: string;
	narrativeArc: string;
	components: ShotlyxMGCompositionComponentPlan[];
}

export interface CreateShotlyxMGCompositionPlanOptions {
	prompt: string;
	componentCount: number;
	durationSeconds?: number;
	styleGuide?: string;
}

const DEFAULT_COMPONENT_DURATION_SECONDS = 3;
const MAX_COMPONENT_DURATION_SECONDS = 120;
const MIN_COMPONENT_DURATION_SECONDS = 0.8;

function clampDuration(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_COMPONENT_DURATION_SECONDS;
	return Math.max(
		MIN_COMPONENT_DURATION_SECONDS,
		Math.min(value, MAX_COMPONENT_DURATION_SECONDS),
	);
}

function durationForComponent({
	requestedDurationSeconds,
}: {
	requestedDurationSeconds?: number;
}): number {
	return clampDuration(
		requestedDurationSeconds ?? DEFAULT_COMPONENT_DURATION_SECONDS,
	);
}

function timingFor({
	start,
	durationSeconds,
}: {
	start: number;
	durationSeconds: number;
}): string {
	const end = start + durationSeconds;
	return `${start.toFixed(1)}s-${end.toFixed(1)}s`;
}

function compactSubject({ prompt }: { prompt: string }): string {
	const normalized = prompt
		.replace(/\s+/g, " ")
		.replace(/工具参数[:：]\{.*$/s, "")
		.trim();
	const quoted =
		normalized.match(/[「『《“"]([^」』》”"]{2,48})[」』》”"]/)?.[1]?.trim() ??
		"";
	const firstClause = normalized
		.split(/[。.!！?？；;，,\n]/)
		.map((part) => part.trim())
		.find(Boolean);
	const value = quoted || firstClause || normalized || "当前需求";
	return value.length > 48 ? value.slice(0, 47).trim() : value;
}

function buildComponentPlan({
	index,
	total,
	prompt,
	durationSeconds,
	cursor,
}: {
	index: number;
	total: number;
	prompt: string;
	durationSeconds?: number;
	cursor: number;
}): ShotlyxMGCompositionComponentPlan {
	const componentDuration = durationForComponent({
		requestedDurationSeconds: durationSeconds,
	});
	const segmentNumber = index + 1;
	const screenTiming = timingFor({
		start: cursor,
		durationSeconds: componentDuration,
	});
	return {
		id: `custom-segment-${segmentNumber}`,
		label: `自定义片段 ${segmentNumber}/${total}`,
		focus: [
			`根据原始需求自行决定第 ${segmentNumber}/${total} 个 MG 片段的唯一视觉意图。`,
			"不要从固定模板类型中选择，不要默认标题、指标、标注、表格、流程或总结。",
			"这个片段只负责一个明确的视觉动作、状态、信息变化或空间关系，并且要和其它片段避免重复。",
			`原始需求：${prompt}`,
		].join(" "),
		visualRole:
			"由子 Agent 根据原始需求自由定义；可以使用文字、数字、图形、数据可视化、粒子、路径、遮罩、镜头、纹理或其它 Remotion 代码结构，但必须服务于本片段意图。",
		durationSeconds: componentDuration,
		screenTiming,
		animationDirection:
			"自行设计贯穿全时长的入场、持续变化、退场或循环节奏；不要一秒动完后空等，也不要复刻其它片段的运动。",
		qualityBar:
			"必须是针对原始需求重新设计的自定义构图和动效。不能套用内置标题/指标/标注/表格模板结构；不能保留占位文案；如果用户明确要求无文字或透明背景，必须严格遵守。",
	};
}

function buildComponentPlans({
	prompt,
	componentCount,
	durationSeconds,
}: {
	prompt: string;
	componentCount: number;
	durationSeconds?: number;
}): ShotlyxMGCompositionComponentPlan[] {
	let cursor = 0;
	return Array.from({ length: componentCount }, (_, index) => {
		const component = buildComponentPlan({
			index,
			total: componentCount,
			prompt,
			durationSeconds,
			cursor,
		});
		cursor += component.durationSeconds;
		return component;
	});
}

export function createShotlyxMGCompositionPlan({
	prompt,
	componentCount,
	durationSeconds,
	styleGuide,
}: CreateShotlyxMGCompositionPlanOptions): ShotlyxMGCompositionDirectorPlan {
	const safeComponentCount = Math.max(Math.floor(componentCount), 1);
	const subject = compactSubject({ prompt });
	return {
		title: `${subject} · 自定义 MG`,
		visualStyle:
			styleGuide?.trim() ||
			"自定义 Remotion MG：由子 Agent 根据需求决定构图、视觉语言、数据结构和运动机制。",
		narrativeArc:
			"Director 只负责切片和边界约束，不预判动画类型、不分配模板角色；每个子 Agent 必须从原始需求中自行设计本片段的视觉意图。",
		components: buildComponentPlans({
			prompt,
			componentCount: safeComponentCount,
			durationSeconds,
		}),
	};
}
