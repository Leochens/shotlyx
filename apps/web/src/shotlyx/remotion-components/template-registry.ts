export type ShotlyxMGTemplateId =
	| "title-reveal"
	| "metric-emphasis"
	| "annotation-callout"
	| "data-table";

export type ShotlyxMGTemplateCategory =
	| "title"
	| "emphasis"
	| "annotation"
	| "data";

export interface ShotlyxMGTemplateMetadata {
	id: ShotlyxMGTemplateId;
	name: string;
	category: ShotlyxMGTemplateCategory;
	description: string;
	slots: string[];
	params: string[];
	variants: string[];
}

export const SHOTLYX_MG_TEMPLATE_IDS = [
	"title-reveal",
	"metric-emphasis",
	"annotation-callout",
	"data-table",
] as const satisfies readonly ShotlyxMGTemplateId[];

const BUILTIN_TEMPLATES: ShotlyxMGTemplateMetadata[] = [
	{
		id: "title-reveal",
		name: "标题大字展示",
		category: "title",
		description: "大标题、副标题、标签和高亮扫线的透明 MG 标题模板。",
		slots: ["title", "subtitle", "kicker"],
		params: ["accentColor", "fontFamily", "intensity", "entrance"],
		variants: ["center", "left", "stacked", "label-top"],
	},
	{
		id: "metric-emphasis",
		name: "重点指标突出",
		category: "emphasis",
		description: "大数字、短标签、说明文字和强调光效的指标模板。",
		slots: ["metricValue", "metricLabel", "caption"],
		params: ["accentColor", "fontFamily", "glow"],
		variants: ["counter", "badge", "hero-number"],
	},
	{
		id: "annotation-callout",
		name: "圆圈方框标注",
		category: "annotation",
		description: "目标文本、圆圈/方框、箭头和 callout 标签模板。",
		slots: ["targetText", "calloutText"],
		params: ["shape", "accentColor", "fontFamily"],
		variants: ["circle", "box", "underline"],
	},
	{
		id: "data-table",
		name: "数据表格图",
		category: "data",
		description: "表头、逐行入场、高亮行和三列表格的结构化数据模板。",
		slots: ["title", "rows"],
		params: ["accentColor", "fontFamily", "highlightRow"],
		variants: ["highlight-row", "ranking", "compact"],
	},
];

const TASK_TEMPLATE_MAP: Record<string, ShotlyxMGTemplateId> = {
	"agent-concept": "title-reveal",
	"agent-loop": "annotation-callout",
	"agent-memory": "data-table",
	"agent-summary": "title-reveal",
	"agent-tools": "annotation-callout",
	callouts: "annotation-callout",
	concept: "title-reveal",
	"data-table": "data-table",
	"final-summary": "title-reveal",
	"main-mechanism": "metric-emphasis",
	"metric-emphasis": "metric-emphasis",
	"annotation-callout": "annotation-callout",
	"title-reveal": "title-reveal",
};

export function listShotlyxMGTemplates(): ShotlyxMGTemplateMetadata[] {
	return BUILTIN_TEMPLATES.map((template) => ({ ...template }));
}

export function resolveShotlyxMGTemplateForTask({
	taskId,
}: {
	taskId: string;
}): ShotlyxMGTemplateId | null {
	const normalized = taskId.replace(/-\d+$/, "");
	if (normalized in TASK_TEMPLATE_MAP) {
		return TASK_TEMPLATE_MAP[normalized] ?? null;
	}
	for (const templateId of Object.values(TASK_TEMPLATE_MAP)) {
		if (normalized === templateId || normalized.startsWith(`${templateId}-`)) {
			return templateId;
		}
	}
	return null;
}
