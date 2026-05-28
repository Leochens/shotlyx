export function buildSeedanceMediaPrompt({
	description,
	aspectRatio,
	durationSeconds,
	hasReferences,
}: {
	description: string;
	aspectRatio: string;
	durationSeconds: number;
	hasReferences: boolean;
}): string {
	return [
		"使用 Seedance 生成一段视频。",
		`描述：${description}`,
		`参数：视频比例 ${aspectRatio}，时长 ${durationSeconds}s。`,
		"请调用 creative_generate_seedance_video，并将生成结果保存到媒体库。",
		hasReferences
			? "参考图：使用我附加的素材引用作为参考图。"
			: "参考图：无，只根据描述生成。",
	].join("\n");
}

export function buildRemotionMGCompositionPrompt({
	description,
	templateLabel,
	styleGuide,
	componentCount,
	aspectRatio,
	durationSeconds,
}: {
	description: string;
	templateLabel: string;
	styleGuide: string;
	componentCount: number;
	aspectRatio: string;
	durationSeconds: number;
}): string {
	const toolArgs = {
		aspectRatio,
		durationSeconds,
		componentCount,
		styleGuide,
		transparentBackground: true,
		insertToTimeline: true,
	};
	return [
		"使用 Shotlyx Remotion Component 组合生成复杂 MG 动画。",
		"只允许使用 Remotion / Shotlyx Component；不要使用 HTML、GSAP 或旧模板覆盖层。",
		`描述：${description}`,
		`模板：${templateLabel}。`,
		`参数：比例 ${aspectRatio}，小组件目标/上限 ${durationSeconds}s，透明背景 true。短促箭头、圆圈、框选、关键词打点可以自动缩短到 1-2s。`,
		`工具参数：${JSON.stringify(toolArgs)}`,
		"如果描述缺少具体业务内容、关键文案、数据或视觉方向，只问一个简短问题让用户选择风格/目标；不要直接生成空模板或占位内容。",
		"请调用 shotlyx_generate_mg_composition，并把生成的 Remotion MG 组件插入当前时间线。startTimeSeconds 可以省略让工具自动排队；如果传入则必须是数字，不能传 undefined。",
		"按需求拆成 3-5 个连续小组件，每个小组件只负责一个明确视觉意图：标题大字、重点指标、箭头/圆圈/方框标注、数据图表/表格、步骤流程或结论收束。",
		"所有业务文字、数值、表格行、颜色、开关和动效强度都必须进入 propsSchema/defaultProps；每个 propsSchema 项必须有稳定唯一 key、清晰 label，table columns 必须是字符串数组。",
		"不能保留“标题”“标题强调”“Subtitle”“Focus here”“指标名”“数值”“Lorem”“Example”等占位文案；如果用户没有给具体文案，先用需求中可推断的业务词，不要直接照抄模板。",
		"视觉风格要求：像高质量视频图形包装，而不是网页卡片或后台 dashboard 截图；优先大层级、强对比、留白、细描边、扫描线、计数动效、路径/描边动画和清晰数据对齐。若组件持续多秒，必须有轻微持续动效或退场，不能 1 秒动完后空等。",
	].join("\n");
}
