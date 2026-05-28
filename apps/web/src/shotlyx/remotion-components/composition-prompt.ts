export const SMART_MG_COMPOSITION_TEMPLATE_LABEL = "智能组合";

export const SMART_MG_COMPOSITION_STYLE_GUIDE =
	"Remotion 视频图形包装风格。根据需求自动拆分标题、重点强调、标注、数据图表、步骤流程和结论收束；避免网页卡片感，优先大层级、强对比、可读数据、细描边、留白和克制动效。";

export const DEFAULT_MG_COMPOSITION_COMPONENT_COUNT = 4;

const SHORT_BEAT_RULE = "短促箭头、圆圈、框选、关键词打点可以自动缩短到 1-2s。";

const COMPONENT_ROLES_RULE =
	"按需求拆成 3-5 个连续小组件，每个小组件只负责一个明确视觉意图：内容型动画可用标题大字、重点指标、箭头/圆圈/方框标注、数据图表/表格、步骤流程或结论收束；纯视觉/粒子/转场/无文字特效应拆成聚集、爆发、扩散、余韵等视觉阶段，不要硬套标题/指标/图表模板。";

const EDITABLE_PROPS_RULE =
	"所有业务文字、数值、表格行、颜色、开关和动效强度都必须进入 propsSchema/defaultProps；每个 propsSchema 项必须有稳定唯一 key、清晰 label，table columns 必须是字符串数组。";

const PLACEHOLDER_RULE =
	"不能保留“标题”“标题强调”“Subtitle”“Focus here”“指标名”“数值”“Lorem”“Example”等占位文案；如果用户没有给具体文案，先用需求中可推断的业务词，不要直接照抄模板；如果用户明确要求纯视觉或无文字，不要新增任何文字 props。";

const VIDEO_GRAPHICS_STYLE_RULE =
	"视觉风格要求：像高质量视频图形包装，而不是网页卡片或后台 dashboard 截图；优先大层级、强对比、留白、细描边、扫描线、计数动效、路径/描边动画和清晰数据对齐。若组件持续多秒，必须有轻微持续动效或退场，不能 1 秒动完后空等。";

const AUTO_TEMPLATE_RULE =
	'默认不要使用内置模板。只有用户在模板选择器里明确选中模板时，才传 templateMode:"force" 和 templateId；其它所有 MG 需求都传 templateMode:"off" 或省略模板参数，让工具自定义生成 Remotion Component。';

export function resolveMGCompositionStyleGuide({
	styleGuide,
	componentCount,
}: {
	styleGuide?: string;
	componentCount: number;
}): string | undefined {
	const trimmed = styleGuide?.trim();
	if (trimmed) return trimmed;
	return componentCount > 1 ? SMART_MG_COMPOSITION_STYLE_GUIDE : undefined;
}

export function buildShotlyxMGCompositionAgentPrompt({
	description,
	templateLabel,
	styleGuide,
	componentCount,
	aspectRatio,
	durationSeconds,
	templateMode,
	templateId,
}: {
	description: string;
	templateLabel: string;
	styleGuide: string;
	componentCount: number;
	aspectRatio: string;
	durationSeconds: number;
	templateMode?: "off" | "auto" | "force";
	templateId?: string;
}): string {
	const resolvedTemplateMode = templateId ? "force" : templateMode;
	const toolArgs = {
		aspectRatio,
		durationSeconds,
		componentCount,
		styleGuide,
		transparentBackground: true,
		insertToTimeline: false,
		...(resolvedTemplateMode ? { templateMode: resolvedTemplateMode } : {}),
		...(templateId ? { templateId } : {}),
	};
	return [
		"使用 Shotlyx Remotion Component 组合生成复杂 MG 动画。",
		"只允许使用 Remotion / Shotlyx Component；不要使用 HTML、GSAP 或旧模板覆盖层。",
		`描述：${description}`,
		`模板：${templateLabel}。`,
		`参数：比例 ${aspectRatio}，小组件目标/上限 ${durationSeconds}s，透明背景 true。${SHORT_BEAT_RULE}`,
		`工具参数：${JSON.stringify(toolArgs)}`,
		templateId
			? `用户已选择内置模板 ${templateId}；调用工具时必须传入 templateMode:"force" 和 templateId，不要改成其它模板或自由生成。`
			: "",
		AUTO_TEMPLATE_RULE,
		"如果描述缺少具体业务内容、关键文案、数据或视觉方向，只问一个简短问题让用户选择风格/目标；不要直接生成空模板或占位内容。",
		"请调用 shotlyx_generate_mg_composition。默认先把生成的 Remotion MG 组件保存到素材库，不要插入当前时间线；只有用户明确说要放到时间线时，才传 insertToTimeline:true。startTimeSeconds 可以省略让工具自动排队；如果传入则必须是数字，不能传 undefined。",
		COMPONENT_ROLES_RULE,
		EDITABLE_PROPS_RULE,
		PLACEHOLDER_RULE,
		VIDEO_GRAPHICS_STYLE_RULE,
	].join("\n");
}

export function buildShotlyxMGCompositionGenerationGuidance({
	description,
	aspectRatio,
	durationSeconds,
	componentCount,
	styleGuide,
	transparentBackground,
}: {
	description: string;
	aspectRatio: string;
	durationSeconds?: number;
	componentCount: number;
	styleGuide?: string;
	transparentBackground: boolean;
}): string {
	const resolvedStyleGuide =
		resolveMGCompositionStyleGuide({ styleGuide, componentCount }) ??
		SMART_MG_COMPOSITION_STYLE_GUIDE;
	const durationText =
		typeof durationSeconds === "number" ? `${durationSeconds}s` : "按内容决定";
	return [
		"Shotlyx Remotion Component MG 生成规范：",
		"只允许使用 Remotion / Shotlyx Component；不要使用 HTML、GSAP 或旧模板覆盖层。",
		`描述：${description}`,
		`参数：比例 ${aspectRatio}，小组件目标/上限 ${durationText}，透明背景 ${transparentBackground ? "true" : "false"}。${SHORT_BEAT_RULE}`,
		`风格：${resolvedStyleGuide}`,
		COMPONENT_ROLES_RULE,
		EDITABLE_PROPS_RULE,
		PLACEHOLDER_RULE,
		VIDEO_GRAPHICS_STYLE_RULE,
	].join("\n");
}
