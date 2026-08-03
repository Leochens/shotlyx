import { buildShotlyxMGCompositionAgentPrompt } from "@/shotlyx/remotion-components/composition-prompt";
import {
	buildShotlyxMGGenerationRequest,
	extractMGColors,
	extractMGFontFamilies,
	hasConcreteMGSubject,
} from "@/shotlyx/remotion-components/generation-request";

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
	return buildShotlyxMGCompositionAgentPrompt({
		description,
		templateLabel,
		styleGuide,
		componentCount,
		aspectRatio,
		durationSeconds,
		templateMode,
		templateId,
	});
}

export function buildRemotionMGPrompt({
	description,
	aspectRatio,
	duration,
	primaryColor,
	fontFamily,
}: {
	description: string;
	aspectRatio: "16:9" | "9:16" | "1:1";
	duration: "auto" | number;
	primaryColor?: string;
	fontFamily?: string;
}): string {
	if (!hasConcreteMGSubject({ prompt: description })) {
		return [
			"用户提出了 MG 需求，但没有给出可识别的主题、文字、数据或视觉对象。",
			`用户原话：${description.trim()}`,
			"只追问一次核心内容，例如要展示的标题、数据、步骤或视觉对象。不要调用任何生成工具，也不要自行补造内容。",
		].join("\n");
	}
	const promptColors = extractMGColors(description);
	const promptFonts = extractMGFontFamilies(description);
	const preferenceText = [
		primaryColor && promptColors.length === 0
			? `用户在生成器中锁定主色 ${primaryColor}`
			: "",
		fontFamily?.trim() && promptFonts.length === 0
			? `用户在生成器中锁定字体 ${fontFamily.trim()}`
			: "",
	]
		.filter(Boolean)
		.join("；");
	const enrichedDescription = [description, preferenceText]
		.filter(Boolean)
		.join("。\n");
	const request = buildShotlyxMGGenerationRequest({
		prompt: enrichedDescription,
		duration,
		aspectRatio,
	});
	if (request.mode === "sequence" && !request.componentCount) {
		return [
			"用户明确要求多个 MG 或 MG 拼接，但没有指定数量。",
			`需求：${enrichedDescription}`,
			`画幅：${aspectRatio}；目标总时长：${request.durationSeconds}s。`,
			"请先按语义给出一个简短分镜，列出每段名称和时长，然后只问一次是否按此生成。用户确认前不要调用生成工具。",
		].join("\n");
	}
	const toolName =
		request.mode === "sequence"
			? "shotlyx_generate_mg_composition"
			: "shotlyx_generate_mg_component";
	const toolArgs = {
		prompt: enrichedDescription,
		durationSeconds: request.durationSeconds,
		aspectRatio,
		transparentBackground: true,
		insertToTimeline: false,
		...(request.componentCount
			? { componentCount: request.componentCount }
			: {}),
	};
	return [
		request.mode === "single"
			? "生成一个完整、可编辑的 Shotlyx Remotion MG 动画资产。一个资产内部可以包含多个节奏段，但不要拆成多个 MG。"
			: `用户明确要求 MG 拼接，生成 ${request.componentCount} 个语义分段。`,
		`需求：${enrichedDescription}`,
		`参数：${JSON.stringify(toolArgs)}`,
		`请调用 ${toolName}。默认只保存到素材库；只有用户明确要求时才插入时间线。`,
		"颜色、字体与风格优先级：当前聊天明确指定 > 生成器选择 > 项目品牌/参考素材 > 自动设计。明确值必须锁定，修复时不可换掉。",
		"内容型 MG 必须实际显示来自可编辑属性的文字；只有纯视觉效果或用户明确要求无文字时才可省略。不要使用固定视觉模板，也不要生成占位文案或虚构数据。",
		"若需求没有任何可识别的主题、文字、数据或视觉对象，只追问一次核心内容，不要直接生成空泛动画。字体只能使用本地或随应用打包且覆盖所需字符的字体，最多两种。",
	].join("\n");
}

export function buildRemotionMGSubmission(
	options: Parameters<typeof buildRemotionMGPrompt>[0],
): { displayPrompt: string; requestPrompt: string } {
	return {
		displayPrompt: options.description.trim(),
		requestPrompt: buildRemotionMGPrompt(options),
	};
}
