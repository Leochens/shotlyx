import type {
	AnalysisPlan,
	Keyframe,
	SegmentCard,
	SemanticSegment,
	SemanticSegmentType,
	ShotSegment,
	SuggestedOperation,
	TranscriptSegment,
	VideoAssetInspection,
	VideoAssetProfile,
	VideoIntent,
	VideoSceneType,
	VideoSemanticAgentViews,
	VideoSemanticIndex,
} from "./types";

export interface ShotVisualAnalysis {
	shotId: string;
	visualSummary: string;
	sceneType?: VideoSceneType;
	mainObjects?: string[];
	actions?: string[];
	possibleIntent?: string;
	editSuggestions?: string[];
}

export interface BuildVideoSemanticIndexInput {
	globalSummary?: string;
	inspection: VideoAssetInspection;
	transcript?: TranscriptSegment[];
	visualAnalyses?: ShotVisualAnalysis[];
}

function seconds(value: number): string {
	return `${value.toFixed(3)}s`;
}

function clampScore(value: number): number {
	return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function overlaps({
	segment,
	shot,
}: {
	segment: TranscriptSegment;
	shot: ShotSegment;
}): boolean {
	return segment.start < shot.end && segment.end > shot.start;
}

function transcriptForShot({
	shot,
	transcript = [],
}: {
	shot: ShotSegment;
	transcript?: TranscriptSegment[];
}): string | undefined {
	const text = transcript
		.filter((segment) => overlaps({ segment, shot }))
		.map((segment) => segment.text.trim())
		.filter(Boolean)
		.join(" ");
	return text || undefined;
}

function keyframesForShot({
	keyframes,
	shotId,
}: {
	keyframes: Keyframe[];
	shotId: string;
}): Keyframe[] {
	return keyframes.filter((keyframe) => keyframe.shotId === shotId);
}

function inferRole({
	index,
	profile,
	shot,
	total,
	transcript,
	visual,
}: {
	index: number;
	profile: VideoAssetProfile;
	shot: ShotSegment;
	total: number;
	transcript?: string;
	visual?: ShotVisualAnalysis;
}): SemanticSegmentType {
	if (
		visual?.sceneType === "product_demo" ||
		profile.contentTypeGuess === "product_demo"
	) {
		return "demo";
	}
	if (visual?.sceneType === "broll") return "broll";
	const intent = visual?.possibleIntent?.toLowerCase() ?? "";
	if (index === 0 && (shot.start < 3 || intent.includes("intro"))) {
		return "intro";
	}
	if (index === total - 1 && shot.duration <= 12 && intent.includes("ending")) {
		return "ending";
	}
	if (transcript) return "explanation";
	return "unknown";
}

function fallbackVisualSummary({
	profile,
	shot,
}: {
	profile: VideoAssetProfile;
	shot: ShotSegment;
}): string {
	return `${profile.contentTypeGuess} 片段，时间 ${seconds(shot.start)}-${seconds(
		shot.end,
	)}。`;
}

function buildSpeechSummary(
	transcript: string | undefined,
): string | undefined {
	if (!transcript) return undefined;
	return transcript.length <= 32 ? transcript : `${transcript.slice(0, 32)}...`;
}

function scoreEditValue({
	profile,
	role,
	transcript,
	visual,
}: {
	profile: VideoAssetProfile;
	role: SemanticSegmentType;
	transcript?: string;
	visual?: ShotVisualAnalysis;
}): SegmentCard["editValue"] {
	const hasTranscript = Boolean(transcript);
	const hasSuggestions = (visual?.editSuggestions?.length ?? 0) > 0;
	const isDemo = role === "demo" || visual?.sceneType === "product_demo";
	const isBroll = role === "broll" || visual?.sceneType === "broll";
	return {
		keepScore: clampScore(
			0.52 + (hasTranscript ? 0.14 : 0) + (isDemo ? 0.2 : 0),
		),
		hookScore: clampScore(
			role === "intro" ? 0.72 : hasSuggestions ? 0.48 : 0.36,
		),
		highlightScore: clampScore(
			0.42 + (hasSuggestions ? 0.18 : 0) + (isDemo ? 0.16 : 0),
		),
		coverScore: clampScore(role === "intro" || isDemo ? 0.62 : 0.42),
		brollScore: clampScore(
			isBroll ? 0.82 : profile.motionLevel === "low" ? 0.58 : 0.5,
		),
		mgOpportunityScore: clampScore(isDemo ? 0.82 : hasTranscript ? 0.64 : 0.42),
	};
}

function buildSemanticSummary({
	transcript,
	visualSummary,
}: {
	transcript?: string;
	visualSummary: string;
}): string {
	return transcript
		? `${visualSummary} 语音内容：${transcript}`
		: visualSummary;
}

function sceneTypeLabel(sceneType: VideoSceneType | "mixed"): string {
	const labels: Record<VideoSceneType | "mixed", string> = {
		broll: "B-roll",
		gameplay: "游戏",
		mg_animation: "MG 动画",
		mixed: "混合类型",
		product_demo: "产品演示",
		screen_recording: "录屏",
		talking_head: "口播",
		unknown: "未知类型",
		vlog: "Vlog",
	};
	return labels[sceneType];
}

function buildSegmentCards({
	inspection,
	transcript,
	visualAnalyses = [],
}: {
	inspection: VideoAssetInspection;
	transcript?: TranscriptSegment[];
	visualAnalyses?: ShotVisualAnalysis[];
}): SegmentCard[] {
	const visualByShot = new Map(
		visualAnalyses.map((analysis) => [analysis.shotId, analysis]),
	);
	return inspection.shots.map((shot, index) => {
		const visual = visualByShot.get(shot.id);
		const transcriptText = transcriptForShot({ shot, transcript });
		const visualSummary =
			visual?.visualSummary ??
			fallbackVisualSummary({ profile: inspection.profile, shot });
		const sceneType = visual?.sceneType ?? inspection.profile.contentTypeGuess;
		const role = inferRole({
			index,
			profile: inspection.profile,
			shot,
			total: inspection.shots.length,
			transcript: transcriptText,
			visual,
		});
		const actionSummary =
			visual?.actions && visual.actions.length > 0
				? visual.actions.join("；")
				: undefined;
		return {
			id: shot.id,
			start: shot.start,
			end: shot.end,
			duration: shot.duration,
			keyframes: keyframesForShot({
				keyframes: inspection.keyframes,
				shotId: shot.id,
			}),
			transcript: transcriptText,
			speechSummary: buildSpeechSummary(transcriptText),
			visualSummary,
			actionSummary,
			sceneType,
			role,
			editValue: scoreEditValue({
				profile: inspection.profile,
				role,
				transcript: transcriptText,
				visual,
			}),
			semanticSummary: buildSemanticSummary({
				transcript: transcriptText,
				visualSummary,
			}),
		};
	});
}

function shouldMergeAdjacent({
	current,
	next,
}: {
	current: SegmentCard;
	next: SegmentCard;
}): boolean {
	return current.role === next.role && current.sceneType === next.sceneType;
}

function operationsForCards(cards: SegmentCard[]): SuggestedOperation[] {
	const maxKeep = Math.max(...cards.map((card) => card.editValue.keepScore));
	const maxMg = Math.max(
		...cards.map((card) => card.editValue.mgOpportunityScore),
	);
	const maxBroll = Math.max(...cards.map((card) => card.editValue.brollScore));
	const operations: SuggestedOperation[] = [];
	if (maxKeep >= 0.68) {
		operations.push({
			type: "keep",
			reason: "这是高保留价值的内容段落",
		});
	}
	if (maxMg >= 0.72) {
		operations.push({
			type: "add_mg_annotation",
			reason: "适合用 MG 动画或箭头强调重点操作",
		});
	}
	if (maxBroll >= 0.76) {
		operations.push({
			type: "add_broll",
			reason: "适合补充为其他段落的 B-roll 素材",
		});
	}
	return operations.length > 0
		? operations
		: [{ type: "keep", reason: "可作为普通素材保留" }];
}

function titleForSegment({
	cards,
	index,
}: {
	cards: SegmentCard[];
	index: number;
}): string {
	const type = cards[0]?.role ?? "unknown";
	const sceneType = cards[0]?.sceneType ?? "unknown";
	if (type === "demo") return `产品演示片段 ${index + 1}`;
	if (type === "intro") return `开头片段 ${index + 1}`;
	if (type === "ending") return `结尾片段 ${index + 1}`;
	return `${sceneTypeLabel(sceneType)}片段 ${index + 1}`;
}

function buildSemanticSegments(cards: SegmentCard[]): SemanticSegment[] {
	const groups: SegmentCard[][] = [];
	for (const card of cards) {
		const current = groups.at(-1);
		if (
			current &&
			shouldMergeAdjacent({ current: current.at(-1) ?? card, next: card })
		) {
			current.push(card);
		} else {
			groups.push([card]);
		}
	}
	return groups.map((group, index) => ({
		id: `sem_${String(index + 1).padStart(3, "0")}`,
		start: group[0]?.start ?? 0,
		end: group.at(-1)?.end ?? 0,
		title: titleForSegment({ cards: group, index }),
		summary: group.map((card) => card.visualSummary).join(" "),
		sourceShotIds: group.map((card) => card.id),
		type: group[0]?.role ?? "unknown",
		suggestedOperations: operationsForCards(group),
	}));
}

function inferAssetType({
	profile,
	shots,
}: {
	profile: VideoAssetProfile;
	shots: SegmentCard[];
}): VideoSceneType | "mixed" {
	const sceneTypes = new Set(
		shots
			.map((shot) => shot.sceneType)
			.filter((type): type is VideoSceneType => type !== "unknown"),
	);
	if (sceneTypes.size > 1) return "mixed";
	return sceneTypes.values().next().value ?? profile.contentTypeGuess;
}

function fallbackGlobalSummary({
	assetType,
	semanticSegments,
}: {
	assetType: VideoSceneType | "mixed";
	semanticSegments: SemanticSegment[];
}): string {
	const label = sceneTypeLabel(assetType);
	if (semanticSegments.length === 0) return `这是一个${label}视频。`;
	return `这是一个${label}视频，包含 ${semanticSegments.length} 个语义段落：${semanticSegments
		.map((segment) => segment.title)
		.join("、")}。`;
}

function uniqueModelNames(values: string[]): string[] {
	return [...new Set(values.filter(Boolean))];
}

export function buildVideoSemanticIndex({
	globalSummary,
	inspection,
	transcript,
	visualAnalyses,
}: BuildVideoSemanticIndexInput): VideoSemanticIndex {
	const shots = buildSegmentCards({
		inspection,
		transcript,
		visualAnalyses,
	});
	const semanticSegments = buildSemanticSegments(shots);
	const assetType = inferAssetType({ profile: inspection.profile, shots });
	return {
		videoId: inspection.videoId,
		profile: inspection.profile,
		globalSummary:
			globalSummary ?? fallbackGlobalSummary({ assetType, semanticSegments }),
		assetType,
		shots,
		semanticSegments,
		transcript,
		analysisMeta: {
			...inspection.analysisMeta,
			modelUsed: uniqueModelNames([
				...inspection.analysisMeta.modelUsed,
				"semantic-index",
				...(visualAnalyses && visualAnalyses.length > 0 ? ["vlm"] : []),
				...(transcript && transcript.length > 0 ? ["asr"] : []),
			]),
		},
	};
}

export function buildAnalysisPlan({
	intent,
	profile,
}: {
	intent: VideoIntent;
	profile: VideoAssetProfile;
}): AnalysisPlan {
	const highMotion = profile.motionLevel === "high";
	const strategy = highMotion
		? "high_motion"
		: profile.hasAudio
			? "speech_first"
			: profile.contentTypeGuess === "product_demo"
				? "product_demo"
				: "silent_visual";
	const isDeepIntent =
		intent === "auto_edit" ||
		intent === "extract_highlights" ||
		intent === "mg_animation" ||
		intent === "broll_match";
	const expectedOutputByIntent: Record<
		VideoIntent,
		AnalysisPlan["expectedOutput"]
	> = {
		auto_edit: "edit_plan",
		broll_match: "edit_plan",
		caption: "caption_plan",
		classify_asset: "asset_tags",
		cover_select: "moments",
		edit_suggestion: "edit_plan",
		extract_highlights: "moments",
		find_moment: "moments",
		generate_script: "summary",
		mg_animation: "mg_plan",
		summarize: "summary",
		voiceover: "summary",
	};
	return {
		intent,
		strategy,
		steps: [
			...(profile.hasAudio ? ["asr"] : []),
			"shot_detection",
			"keyframe_extraction",
			highMotion ? "motion_analysis" : "vlm_summary",
			"segment_cards",
			"semantic_merge",
			"global_summary",
		],
		budget: {
			level: isDeepIntent || !profile.hasAudio ? "medium" : "cheap",
			maxFrames: highMotion ? 60 : profile.hasAudio ? 20 : 40,
			maxVlmCalls: highMotion ? 24 : profile.hasAudio ? 10 : 20,
			allowDeepModel: intent === "auto_edit",
		},
		expectedOutput: expectedOutputByIntent[intent],
	};
}

export function buildFrameAnalysisPrompt({
	keyframeCount,
	shot,
}: {
	keyframeCount: number;
	shot: ShotSegment;
}): string {
	return `你是视频素材分析助手。
请根据这一组关键帧判断该视频片段的内容。不要假装知道没有出现在画面中的信息。

Shot: ${shot.id}
Time: ${seconds(shot.start)}-${seconds(shot.end)}
Keyframes: ${keyframeCount}

请输出 JSON：
{
  "visualSummary": "这段画面主要在展示什么",
  "sceneType": "talking_head / screen_recording / product_demo / broll / vlog / gameplay / mg_animation / unknown",
  "mainObjects": ["主要画面元素"],
  "actions": ["画面中发生的动作或变化"],
  "possibleIntent": "这个片段在视频里可能承担什么作用",
  "editSuggestions": ["剪辑上可以怎么使用"]
}`;
}

function findOperation({
	segment,
	type,
}: {
	segment: SemanticSegment;
	type: SuggestedOperation["type"];
}): SuggestedOperation | undefined {
	return segment.suggestedOperations.find((operation) => operation.type === type);
}

function flattenAdditions(
	semanticSegments: SemanticSegment[],
): VideoSemanticAgentViews["editing"]["additions"] {
	return semanticSegments.flatMap((segment) =>
		segment.suggestedOperations
			.filter(
				(operation) =>
					operation.type !== "keep" && operation.type !== "remove",
			)
			.map((operation) => ({
				reason: operation.reason,
				segmentId: segment.id,
				type: operation.type,
			})),
	);
}

function brollNeedReason(shot: SegmentCard): string {
	if (!shot.transcript) {
		return "画面信息较少，可作为补 B-roll 或被 B-roll 覆盖的候选段落";
	}
	return "这段需要补充 B-roll，让信息更具体";
}

export function buildSemanticAgentViews({
	index,
	targetDurationSeconds,
}: {
	index: VideoSemanticIndex;
	targetDurationSeconds?: number;
}): VideoSemanticAgentViews {
	const keep = index.semanticSegments.flatMap((segment) => {
		const operation = findOperation({ segment, type: "keep" });
		return operation
			? [
					{
						end: segment.end,
						reason: operation.reason,
						segmentId: segment.id,
						sourceShotIds: segment.sourceShotIds,
						start: segment.start,
						title: segment.title,
					},
				]
			: [];
	});
	const remove = index.semanticSegments.flatMap((segment) => {
		const operation = findOperation({ segment, type: "remove" });
		return operation
			? [
					{
						end: segment.end,
						reason: operation.reason,
						segmentId: segment.id,
						start: segment.start,
						title: segment.title,
					},
				]
			: [];
	});
	const transcript = index.transcript ?? [];
	const brollNeeds = index.shots
		.filter(
			(shot) => !shot.transcript || shot.editValue.brollScore >= 0.58,
		)
		.map((shot) => ({
			end: shot.end,
			reason: brollNeedReason(shot),
			score: shot.editValue.brollScore,
			segmentId: shot.id,
			start: shot.start,
		}))
		.sort((a, b) => b.score - a.score || a.start - b.start);
	const brollCandidates = index.shots
		.filter((shot) => shot.role === "broll" || shot.editValue.brollScore >= 0.76)
		.map((shot) => ({
			end: shot.end,
			reason: "可作为 B-roll 素材复用",
			score: shot.editValue.brollScore,
			segmentId: shot.id,
			start: shot.start,
		}))
		.sort((a, b) => b.score - a.score || a.start - b.start);
	return {
		broll: {
			candidates: brollCandidates,
			needs: brollNeeds,
		},
		caption: {
			hasTranscript: transcript.length > 0,
			speechSummaries: index.shots.flatMap((shot) =>
				shot.speechSummary
					? [
							{
								end: shot.end,
								segmentId: shot.id,
								start: shot.start,
								text: shot.speechSummary,
							},
						]
					: [],
			),
			transcript,
			transcriptText: transcript.map((segment) => segment.text).join("\n"),
		},
		editing: {
			...(typeof targetDurationSeconds === "number"
				? { targetDurationSeconds }
				: {}),
			additions: flattenAdditions(index.semanticSegments),
			keep,
			remove,
		},
		mg: {
			opportunities: index.shots
				.filter((shot) => shot.editValue.mgOpportunityScore >= 0.72)
				.map((shot) => ({
					end: shot.end,
					keyframeIds: shot.keyframes.map((keyframe) => keyframe.id),
					reason: shot.semanticSummary,
					score: shot.editValue.mgOpportunityScore,
					segmentId: shot.id,
					start: shot.start,
				}))
				.sort((a, b) => b.score - a.score || a.start - b.start),
		},
		summary: {
			assetType: index.assetType,
			duration: index.profile.duration,
			globalSummary: index.globalSummary,
			semanticSegments: index.semanticSegments.map((segment) => ({
				end: segment.end,
				segmentId: segment.id,
				start: segment.start,
				summary: segment.summary,
				title: segment.title,
				type: segment.type,
			})),
			videoId: index.videoId,
		},
	};
}
