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

export function buildHyperFramesMGPrompt({
	description,
	templateId,
	templateLabel,
	aspectRatio,
	durationSeconds,
}: {
	description: string;
	templateId: string;
	templateLabel: string;
	aspectRatio: string;
	durationSeconds: number;
}): string {
	return [
		"使用 HyperFrames 生成一个可编辑 MG 动画覆盖层。",
		`描述：${description}`,
		`模板：${templateLabel} (${templateId})。`,
		`参数：比例 ${aspectRatio}，时长 ${durationSeconds}s，透明背景 true。`,
		`工具参数：{ "templateId": "${templateId}", "aspectRatio": "${aspectRatio}", "durationSeconds": ${durationSeconds}, "transparentBackground": true, "insertToTimeline": true }`,
		"请调用 shotlyx_generate_hyperframes_overlay，并把生成的 MG 动画插入当前时间线。",
	].join("\n");
}
