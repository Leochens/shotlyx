import { buildShotlyxMGCompositionAgentPrompt } from "@/shotlyx/remotion-components/composition-prompt";

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
