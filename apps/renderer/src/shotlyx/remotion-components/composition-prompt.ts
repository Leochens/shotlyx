export const SMART_MG_COMPOSITION_TEMPLATE_LABEL = "智能组合";

export const SMART_MG_COMPOSITION_STYLE_GUIDE =
	"Remotion 视频图形包装风格。根据用户需求自行设计每个片段的视觉意图、构图、运动机制和信息层级；避免网页卡片感，优先强主体、强对比、可读信息、细节克制和持续动效。";

export const DEFAULT_MG_COMPOSITION_COMPONENT_COUNT = 4;

const SHORT_BEAT_RULE =
	"短促局部强调、轨迹、脉冲或关键词打点可以自动缩短到 1-2s。";

const COMPONENT_ROLES_RULE =
	"按需求拆成多个连续小组件。Director 只负责切片，不指定模板类型；每个小组件都要由子 Agent 从原始需求中自行决定一个唯一视觉意图，不能默认套用标题、指标、标注、表格、流程、结论等固定角色。";

const EDITABLE_PROPS_RULE =
	"所有业务文字、数值、表格行、颜色、开关和动效强度都必须进入 propsSchema/defaultProps；每个 propsSchema 项必须有稳定唯一 key、清晰 label，table columns 必须是字符串数组。";

const PLACEHOLDER_RULE =
	"不能保留任何占位文案；如果用户没有给具体文案，先用需求中可推断的业务词；如果用户明确要求纯视觉或无文字，不要新增任何文字 props。";

const VIDEO_GRAPHICS_STYLE_RULE =
	"视觉风格要求：像高质量视频图形包装，而不是网页卡片或后台 dashboard 截图；使用与需求匹配的层级、对比、留白、路径、粒子、图形、数据或文字系统。若组件持续多秒，必须有轻微持续动效或退场，不能 1 秒动完后空等。";

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
		`参数：比例 ${aspectRatio}，组合总时长/目标 ${durationSeconds}s，透明背景 true。${SHORT_BEAT_RULE}`,
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
		`参数：比例 ${aspectRatio}，当前小组件时长 ${durationText}，透明背景 ${transparentBackground ? "true" : "false"}。${SHORT_BEAT_RULE}`,
		`风格：${resolvedStyleGuide}`,
		COMPONENT_ROLES_RULE,
		EDITABLE_PROPS_RULE,
		PLACEHOLDER_RULE,
		VIDEO_GRAPHICS_STYLE_RULE,
	].join("\n");
}
