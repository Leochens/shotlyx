import type { Tool } from "@/agent/mcp/types";
import {
	optionalStringParam,
	requireStringParam,
} from "@/agent/mcp/validation";
import type { MediaAsset } from "@/media/types";
import {
	buildAnalysisPlan,
	buildSemanticAgentViews,
	buildVideoSemanticIndex,
	type ShotVisualAnalysis,
	type TranscriptSegment,
	type VideoAnalysisLevel,
	type VideoAssetInspection,
	type VideoIntent,
	type VideoSemanticIndex,
} from "@/video-analysis";
import type {
	Keyframe,
	ShotSegment,
	VideoAspectRatio,
	VideoMotionLevel,
	VideoSceneType,
} from "@/video-analysis";

type VideoMediaAsset = MediaAsset & { type: "video" };
type VideoSemanticElementRef = { trackId: string; elementId: string };
type VisualSemanticMode = "keyframes" | "full_video_fallback";
type TranscriptStrategyStatus = "used" | "empty" | "skipped_no_audio";
type VisualStrategyStatus =
	| "skipped_asr_semantic"
	| "skipped_focused_asr_semantic"
	| "used_keyframes_focus_hint"
	| "used_keyframes_visual_intent"
	| "used_keyframes_no_audio"
	| "used_keyframes_no_speech_semantics"
	| "used_full_video_fallback_no_keyframes";
type FocusTimeRange = { start: number; end: number };
type VisualStrategyDecision = {
	focusRange?: FocusTimeRange;
	visualMode?: VisualSemanticMode;
	visualStatus: VisualStrategyStatus;
};
type VideoSemanticToolEditor = {
	media: {
		getAssets: () => MediaAsset[];
	};
	selection: {
		getSelectedElements: () => VideoSemanticElementRef[];
	};
	timeline: {
		getElementsWithTracks: (input: {
			elements: VideoSemanticElementRef[];
		}) => Array<{ element: { mediaId?: string } }>;
	};
};

export interface VisualSemanticResult {
	globalSummary?: string;
	modelUsed?: string;
	shots?: ShotVisualAnalysis[];
}

export interface TranscriptSemanticResult {
	modelUsed?: string;
	transcript: TranscriptSegment[];
}

export interface VideoSemanticToolDeps {
	analyzeVisualMedia: (input: {
		analysisLevel: VideoAnalysisLevel;
		asset: VideoMediaAsset;
		fetchFn: typeof fetch;
		focusHint?: string;
		inspection: VideoAssetInspection;
		intent: VideoIntent;
		visualMode: VisualSemanticMode;
	}) => Promise<VisualSemanticResult>;
	inspectVideoAsset: (input: {
		analysisLevel: VideoAnalysisLevel;
		asset: VideoMediaAsset;
		fetchFn: typeof fetch;
	}) => Promise<VideoAssetInspection>;
	transcribeVideoAsset: (input: {
		analysisLevel: VideoAnalysisLevel;
		asset: VideoMediaAsset;
		fetchFn: typeof fetch;
		intent: VideoIntent;
	}) => Promise<TranscriptSemanticResult | null>;
	fetchFn: typeof fetch;
}

export interface BuildVideoSemanticToolsOptions {
	deps?: Partial<VideoSemanticToolDeps>;
	editor: VideoSemanticToolEditor;
}

const VIDEO_INTENTS: VideoIntent[] = [
	"summarize",
	"classify_asset",
	"find_moment",
	"extract_highlights",
	"edit_suggestion",
	"auto_edit",
	"generate_script",
	"caption",
	"voiceover",
	"mg_animation",
	"cover_select",
	"broll_match",
];
const ANALYSIS_LEVELS: VideoAnalysisLevel[] = ["basic", "standard", "deep"];
const VIDEO_ASPECT_RATIOS: VideoAspectRatio[] = [
	"16:9",
	"9:16",
	"1:1",
	"other",
];
const VIDEO_MOTION_LEVELS: VideoMotionLevel[] = ["low", "medium", "high"];
const VIDEO_SCENE_TYPES: VideoSceneType[] = [
	"talking_head",
	"screen_recording",
	"product_demo",
	"broll",
	"vlog",
	"gameplay",
	"mg_animation",
	"unknown",
];
const indexCache = new Map<string, VideoSemanticIndex>();
const VISUAL_REQUIRED_INTENTS = new Set<VideoIntent>([
	"broll_match",
	"classify_asset",
	"cover_select",
	"extract_highlights",
	"find_moment",
	"mg_animation",
]);

function isVideoIntent(value: string): value is VideoIntent {
	return VIDEO_INTENTS.some((intent) => intent === value);
}

function normalizeIntent(value: string | undefined): VideoIntent {
	if (!value) return "summarize";
	if (!isVideoIntent(value)) {
		throw new Error(
			`类型不匹配："intent" 必须为 ${VIDEO_INTENTS.join(", ")} 之一`,
		);
	}
	return value;
}

function isAnalysisLevel(value: string): value is VideoAnalysisLevel {
	return ANALYSIS_LEVELS.some((level) => level === value);
}

function isVideoAspectRatio(value: string): value is VideoAspectRatio {
	return VIDEO_ASPECT_RATIOS.some((item) => item === value);
}

function isVideoMotionLevel(value: string): value is VideoMotionLevel {
	return VIDEO_MOTION_LEVELS.some((item) => item === value);
}

function isVideoSceneType(value: string): value is VideoSceneType {
	return VIDEO_SCENE_TYPES.some((item) => item === value);
}

function normalizeAnalysisLevel(value: string | undefined): VideoAnalysisLevel {
	if (!value) return "standard";
	if (!isAnalysisLevel(value)) {
		throw new Error(
			`类型不匹配："analysisLevel" 必须为 ${ANALYSIS_LEVELS.join(", ")} 之一`,
		);
	}
	return value;
}

function isVideoMediaAsset(asset: MediaAsset): asset is VideoMediaAsset {
	return asset.type === "video";
}

function resolveSelectedMediaAssetId(
	editor: VideoSemanticToolEditor,
): string | null {
	const [selected] = editor.selection.getSelectedElements();
	if (!selected) return null;
	const [resolved] = editor.timeline.getElementsWithTracks({
		elements: [selected],
	});
	if (!resolved || !("mediaId" in resolved.element)) return null;
	return resolved.element.mediaId;
}

function resolveTargetVideoAsset({
	editor,
	mediaAssetId,
}: {
	editor: VideoSemanticToolEditor;
	mediaAssetId?: string;
}): VideoMediaAsset {
	const assets = editor.media.getAssets().filter((asset) => !asset.ephemeral);
	const resolvedId = mediaAssetId ?? resolveSelectedMediaAssetId(editor);
	const asset = resolvedId
		? assets.find((item) => item.id === resolvedId)
		: assets.find(isVideoMediaAsset);

	if (!asset) {
		throw new Error("未找到可分析的视频素材。请先导入或选择一个视频。");
	}
	if (!isVideoMediaAsset(asset)) {
		throw new Error("视频语义索引只支持视频素材");
	}
	return asset;
}

function cacheKeyFor({
	analysisLevel,
	asset,
	focusHint,
	intent,
}: {
	analysisLevel: VideoAnalysisLevel;
	asset: VideoMediaAsset;
	focusHint?: string;
	intent: VideoIntent;
}): string {
	return [
		asset.id,
		asset.file.name,
		asset.file.size,
		asset.file.lastModified,
		intent,
		analysisLevel,
		focusHint ?? "",
	].join(":");
}

function transcriptText(transcript: TranscriptSegment[] | undefined): string {
	return (transcript ?? [])
		.map((segment) => segment.text.trim())
		.filter(Boolean)
		.join(" ");
}

function hasSemanticTranscript(
	transcript: TranscriptSegment[] | undefined,
): boolean {
	return transcriptText(transcript).length > 0;
}

function keyframeImageCount(inspection: VideoAssetInspection): number {
	return inspection.keyframes.filter((keyframe) => keyframe.imagePath).length;
}

function buildAsrGlobalSummary({
	transcript,
}: {
	transcript: TranscriptSegment[] | undefined;
}): string | undefined {
	const text = transcriptText(transcript);
	if (!text) return undefined;
	return `视频语音内容：${text.length > 160 ? `${text.slice(0, 160)}...` : text}`;
}

function parseClockTime(value: string): number | null {
	const parts = value
		.trim()
		.split(":")
		.map((part) => Number(part));
	if (
		parts.length === 0 ||
		parts.length > 3 ||
		parts.some((part) => !Number.isFinite(part) || part < 0)
	) {
		return null;
	}
	return parts.reduce((total, part) => total * 60 + part, 0);
}

function parseFocusHintTimeRange({
	focusHint,
}: {
	focusHint: string;
}): FocusTimeRange | null {
	const normalized = focusHint.replace(/[－–—~～至到]/g, "-");
	const timeToken = String.raw`\d+(?::\d+(?:\.\d+)?)*(?:\.\d+)?`;
	const rangeMatch = new RegExp(
		`(${timeToken})\\s*(?:秒|s)?\\s*-\\s*(${timeToken})\\s*(?:秒|s)?`,
		"i",
	).exec(normalized);
	if (rangeMatch) {
		const start = parseClockTime(rangeMatch[1] ?? "");
		const end = parseClockTime(rangeMatch[2] ?? "");
		if (start !== null && end !== null && end > start) {
			return { end, start };
		}
	}
	const openingMatch = /(?:开头|前)\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i.exec(
		focusHint,
	);
	if (openingMatch) {
		const end = Number(openingMatch[1]);
		if (Number.isFinite(end) && end > 0) return { end, start: 0 };
	}
	return null;
}

function focusRangeForHint({
	focusHint,
	inspection,
}: {
	focusHint?: string;
	inspection: VideoAssetInspection;
}): FocusTimeRange | null {
	const hint = focusHint?.trim();
	if (!hint) return null;
	const shot = inspection.shots.find((candidate) => hint.includes(candidate.id));
	if (shot) return { end: shot.end, start: shot.start };
	return parseFocusHintTimeRange({ focusHint: hint });
}

function transcriptSegmentsInRange({
	range,
	transcript,
}: {
	range: FocusTimeRange;
	transcript: TranscriptSegment[] | undefined;
}): TranscriptSegment[] {
	return (transcript ?? []).filter(
		(segment) =>
			segment.text.trim().length > 0 &&
			segment.start < range.end &&
			segment.end > range.start,
	);
}

function chooseVisualStrategy({
	focusHint,
	inspection,
	intent,
	transcript,
}: {
	focusHint?: string;
	inspection: VideoAssetInspection;
	intent: VideoIntent;
	transcript: TranscriptSegment[] | undefined;
}): VisualStrategyDecision {
	const semanticTranscript = hasSemanticTranscript(transcript);
	const hasKeyframes = keyframeImageCount(inspection) > 0;
	const focusRange = focusRangeForHint({ focusHint, inspection });
	const hasFocusHint = Boolean(focusHint?.trim());
	if (inspection.profile.hasAudio && semanticTranscript) {
		if (!VISUAL_REQUIRED_INTENTS.has(intent)) {
			if (!hasFocusHint) {
				return { visualStatus: "skipped_asr_semantic" };
			}
			if (
				focusRange &&
				transcriptSegmentsInRange({ range: focusRange, transcript }).length > 0
			) {
				return {
					focusRange,
					visualStatus: "skipped_focused_asr_semantic",
				};
			}
		}
	}
	const keyframeStatus: VisualStrategyStatus = hasFocusHint
		? "used_keyframes_focus_hint"
		: VISUAL_REQUIRED_INTENTS.has(intent)
			? "used_keyframes_visual_intent"
			: !inspection.profile.hasAudio
				? "used_keyframes_no_audio"
				: "used_keyframes_no_speech_semantics";
	return hasKeyframes
		? {
				focusRange: focusRange ?? undefined,
				visualMode: "keyframes",
				visualStatus: keyframeStatus,
			}
		: {
				focusRange: focusRange ?? undefined,
				visualMode: "full_video_fallback",
				visualStatus: "used_full_video_fallback_no_keyframes",
			};
}

function transcriptForAsrSummary({
	transcript,
	visualStrategy,
}: {
	transcript: TranscriptSegment[] | undefined;
	visualStrategy: VisualStrategyDecision;
}): TranscriptSegment[] | undefined {
	if (
		visualStrategy.visualStatus === "skipped_focused_asr_semantic" &&
		visualStrategy.focusRange
	) {
		return transcriptSegmentsInRange({
			range: visualStrategy.focusRange,
			transcript,
		});
	}
	return transcript;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = null;
	}
	if (!response.ok) {
		const errorCode =
			isRecord(body) && typeof body.error === "string"
				? body.error
				: "provider_error";
		const detail =
			isRecord(body) && typeof body.message === "string"
				? body.message
				: undefined;
		const message = detail
			? `${errorCode}: ${detail}`
			: `${errorCode}: request failed with ${response.status}`;
		throw new Error(message);
	}
	return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString({
	key,
	value,
}: {
	key: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`provider_error: inspection.${key} must be a string`);
	}
	return value;
}

function requiredNumber({
	key,
	value,
}: {
	key: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`provider_error: inspection.${key} must be a number`);
	}
	return value;
}

function parseShot(value: unknown): ShotSegment {
	if (!isRecord(value)) {
		throw new Error("provider_error: inspection shot must be an object");
	}
	return {
		duration: requiredNumber({ key: "shot.duration", value: value.duration }),
		end: requiredNumber({ key: "shot.end", value: value.end }),
		id: requiredString({ key: "shot.id", value: value.id }),
		method: "ffmpeg_scene",
		start: requiredNumber({ key: "shot.start", value: value.start }),
		...(typeof value.confidence === "number"
			? { confidence: value.confidence }
			: {}),
	};
}

function parseKeyframe(value: unknown): Keyframe {
	if (!isRecord(value)) {
		throw new Error("provider_error: inspection keyframe must be an object");
	}
	return {
		id: requiredString({ key: "keyframe.id", value: value.id }),
		...(typeof value.imagePath === "string"
			? { imagePath: value.imagePath }
			: {}),
		shotId: requiredString({ key: "keyframe.shotId", value: value.shotId }),
		time: requiredNumber({ key: "keyframe.time", value: value.time }),
	};
}

function parseInspection(value: unknown): VideoAssetInspection {
	if (!isRecord(value)) {
		throw new Error(
			"provider_error: semantic inspection response must be an object",
		);
	}
	const profile = isRecord(value.profile) ? value.profile : null;
	const analysisMeta = isRecord(value.analysisMeta) ? value.analysisMeta : null;
	if (!profile || !analysisMeta) {
		throw new Error(
			"provider_error: inspection response is missing profile/meta",
		);
	}
	const modelUsed = Array.isArray(analysisMeta.modelUsed)
		? analysisMeta.modelUsed.filter(
				(item): item is string => typeof item === "string",
			)
		: [];
	return {
		analysisMeta: {
			analysisLevel:
				analysisMeta.analysisLevel === "basic" ||
				analysisMeta.analysisLevel === "standard" ||
				analysisMeta.analysisLevel === "deep"
					? analysisMeta.analysisLevel
					: "basic",
			createdAt:
				typeof analysisMeta.createdAt === "string"
					? analysisMeta.createdAt
					: new Date(0).toISOString(),
			modelUsed,
		},
		keyframes: Array.isArray(value.keyframes)
			? value.keyframes.map(parseKeyframe)
			: [],
		profile: {
			aspectRatio:
				typeof profile.aspectRatio === "string" &&
				isVideoAspectRatio(profile.aspectRatio)
					? profile.aspectRatio
					: "other",
			contentTypeGuess:
				typeof profile.contentTypeGuess === "string" &&
				isVideoSceneType(profile.contentTypeGuess)
					? profile.contentTypeGuess
					: "unknown",
			duration: requiredNumber({
				key: "profile.duration",
				value: profile.duration,
			}),
			fps: requiredNumber({ key: "profile.fps", value: profile.fps }),
			hasAudio: profile.hasAudio === true,
			height: requiredNumber({ key: "profile.height", value: profile.height }),
			motionLevel:
				typeof profile.motionLevel === "string" &&
				isVideoMotionLevel(profile.motionLevel)
					? profile.motionLevel
					: "low",
			sceneChangeDensity: requiredNumber({
				key: "profile.sceneChangeDensity",
				value: profile.sceneChangeDensity,
			}),
			silenceRatio: requiredNumber({
				key: "profile.silenceRatio",
				value: profile.silenceRatio,
			}),
			speechRatio: requiredNumber({
				key: "profile.speechRatio",
				value: profile.speechRatio,
			}),
			videoId: requiredString({
				key: "profile.videoId",
				value: profile.videoId,
			}),
			width: requiredNumber({ key: "profile.width", value: profile.width }),
		},
		shots: Array.isArray(value.shots) ? value.shots.map(parseShot) : [],
		videoId: requiredString({ key: "videoId", value: value.videoId }),
	};
}

function extractJsonObject(value: string): unknown {
	const trimmed = value.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
		if (fenced?.[1]) {
			try {
				return JSON.parse(fenced[1]);
			} catch {
				return null;
			}
		}
		const start = trimmed.indexOf("{");
		const end = trimmed.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(trimmed.slice(start, end + 1));
			} catch {
				return null;
			}
		}
		return null;
	}
}

function parseVisualShot(value: unknown): ShotVisualAnalysis | null {
	if (!isRecord(value)) return null;
	const shotId = typeof value.shotId === "string" ? value.shotId : "";
	const visualSummary =
		typeof value.visualSummary === "string" ? value.visualSummary : "";
	if (!shotId || !visualSummary) return null;
	const sceneType =
		typeof value.sceneType === "string" && isVideoSceneType(value.sceneType)
			? value.sceneType
			: undefined;
	return {
		shotId,
		visualSummary,
		...(Array.isArray(value.actions)
			? {
					actions: value.actions.filter(
						(item): item is string => typeof item === "string",
					),
				}
			: {}),
		...(Array.isArray(value.editSuggestions)
			? {
					editSuggestions: value.editSuggestions.filter(
						(item): item is string => typeof item === "string",
					),
				}
			: {}),
		...(Array.isArray(value.mainObjects)
			? {
					mainObjects: value.mainObjects.filter(
						(item): item is string => typeof item === "string",
					),
				}
			: {}),
		...(typeof value.possibleIntent === "string"
			? { possibleIntent: value.possibleIntent }
			: {}),
		...(sceneType ? { sceneType } : {}),
	};
}

function parseVisionResponse(value: unknown): VisualSemanticResult {
	if (!isRecord(value)) return {};
	const analysis =
		typeof value.analysis === "string" ? value.analysis : undefined;
	const parsed = analysis ? extractJsonObject(analysis) : null;
	if (isRecord(parsed)) {
		const shots = Array.isArray(parsed.shots)
			? parsed.shots.flatMap((item) => {
					const shot = parseVisualShot(item);
					return shot ? [shot] : [];
				})
			: [];
		return {
			globalSummary:
				typeof parsed.globalSummary === "string"
					? parsed.globalSummary
					: analysis,
			modelUsed:
				typeof value.model === "string"
					? value.model
					: typeof value.provider === "string"
						? value.provider
						: undefined,
			shots,
		};
	}
	return {
		globalSummary: analysis,
		modelUsed:
			typeof value.model === "string"
				? value.model
				: typeof value.provider === "string"
					? value.provider
					: undefined,
	};
}

function parseTranscriptionResponse(
	value: unknown,
): TranscriptSemanticResult | null {
	if (!isRecord(value)) return null;
	if (Array.isArray(value.transcript)) {
		const transcript = value.transcript.flatMap((segment) => {
			if (!isRecord(segment)) return [];
			const text = typeof segment.text === "string" ? segment.text : "";
			const start = typeof segment.start === "number" ? segment.start : 0;
			const end = typeof segment.end === "number" ? segment.end : start;
			if (!text || end <= start) return [];
			return [{ end, start, text }];
		});
		return transcript.length > 0
			? {
					modelUsed:
						typeof value.modelUsed === "string" ? value.modelUsed : "asr",
					transcript,
				}
			: null;
	}
	if (!Array.isArray(value.cues)) return null;
	const transcript = value.cues.flatMap((cue) => {
		if (!isRecord(cue)) return [];
		const text = typeof cue.text === "string" ? cue.text : "";
		const start =
			typeof cue.startTimeSeconds === "number"
				? cue.startTimeSeconds
				: typeof cue.startTime === "number"
					? cue.startTime
					: 0;
		const duration =
			typeof cue.durationSeconds === "number"
				? cue.durationSeconds
				: typeof cue.duration === "number"
					? cue.duration
					: 0;
		if (!text || duration <= 0) return [];
		return [{ start, end: start + duration, text }];
	});
	return transcript.length > 0
		? {
				modelUsed:
					typeof value.model === "string"
						? value.model
						: typeof value.provider === "string"
							? value.provider
							: "asr",
				transcript,
			}
		: null;
}

async function defaultInspectVideoAsset({
	analysisLevel,
	asset,
	fetchFn,
}: {
	analysisLevel: VideoAnalysisLevel;
	asset: VideoMediaAsset;
	fetchFn: typeof fetch;
}): Promise<VideoAssetInspection> {
	const payload = encodeURIComponent(
		JSON.stringify({
			analysisLevel,
			name: asset.name || asset.file.name,
			videoId: asset.id,
		}),
	);
	const response = await fetchFn(
		`/api/desktop/media/analyze?payload=${payload}`,
		{
			body: asset.file,
			headers: {
				"Content-Type": asset.file.type || "video/mp4",
			},
			method: "POST",
		},
	);
	return parseInspection(await parseJsonResponse(response));
}

async function defaultAnalyzeVisualMedia({
	analysisLevel,
	asset,
	fetchFn,
	focusHint,
	inspection,
	intent,
	visualMode,
}: {
	analysisLevel: VideoAnalysisLevel;
	asset: VideoMediaAsset;
	fetchFn: typeof fetch;
	focusHint?: string;
	inspection: VideoAssetInspection;
	intent: VideoIntent;
	visualMode: VisualSemanticMode;
}): Promise<VisualSemanticResult> {
	if (visualMode === "keyframes") {
		return analyzeKeyframeVisualMedia({
			analysisLevel,
			asset,
			fetchFn,
			focusHint,
			inspection,
			intent,
		}).catch(() =>
			analyzeFullVideoVisualMedia({
				analysisLevel,
				asset,
				fetchFn,
				focusHint,
				inspection,
				intent,
			}),
		);
	}
	return analyzeFullVideoVisualMedia({
		analysisLevel,
		asset,
		fetchFn,
		focusHint,
		inspection,
		intent,
	});
}

async function analyzeFullVideoVisualMedia({
	analysisLevel,
	asset,
	fetchFn,
	focusHint,
	inspection,
	intent,
}: {
	analysisLevel: VideoAnalysisLevel;
	asset: VideoMediaAsset;
	fetchFn: typeof fetch;
	focusHint?: string;
	inspection: VideoAssetInspection;
	intent: VideoIntent;
}): Promise<VisualSemanticResult> {
	const shotFacts = inspection.shots
		.map((shot) => {
			const keyframes = inspection.keyframes
				.filter((keyframe) => keyframe.shotId === shot.id)
				.map((keyframe) => `${keyframe.id}@${keyframe.time.toFixed(3)}s`)
				.join(", ");
			return `${shot.id}: ${shot.start.toFixed(3)}s-${shot.end.toFixed(
				3,
			)}s, keyframes=[${keyframes || "none"}]`;
		})
		.join("\n");
	const payload = encodeURIComponent(
		JSON.stringify({
			analysisType:
				intent === "classify_asset" ? "visual_summary" : "editing_suggestions",
			detail: analysisLevel === "deep" ? "high" : "default",
			fps: analysisLevel === "deep" ? 2 : 1,
			media: {
				mediaAssetId: asset.id,
				name: asset.name,
				type: "video",
				mimeType: asset.file.type || "video/mp4",
				durationSeconds: asset.duration,
				width: asset.width,
				height: asset.height,
			},
			prompt: `请基于这个视频生成 Shotlyx Video Semantic Index 所需的结构化视觉信息。
用户意图: ${intent}
${focusHint ? `用户指定片段/关注范围: ${focusHint}\n` : ""}当前上传的是完整原视频，不是裁剪后的小片段。请结合下面的镜头边界和关键帧时间点聚焦分析对应片段。
已切分镜头:
${shotFacts}

请只输出 JSON：
{
  "globalSummary": "这个视频整体在讲什么",
  "shots": [
    {
      "shotId": "shot_001",
      "visualSummary": "这段画面主要在展示什么",
      "sceneType": "talking_head / screen_recording / product_demo / broll / vlog / gameplay / mg_animation / unknown",
      "mainObjects": ["主要画面元素"],
      "actions": ["画面中发生的动作或变化"],
      "possibleIntent": "这个片段在视频里可能承担什么作用",
      "editSuggestions": ["剪辑上可以怎么使用"]
    }
  ]
}`,
		}),
	);
	const response = await fetchFn(
		`/api/agent/vision/analyze?payload=${payload}`,
		{
			body: asset.file,
			headers: {
				"Content-Type": asset.file.type || "video/mp4",
			},
			method: "POST",
		},
	);
	return parseVisionResponse(await parseJsonResponse(response));
}

function keyframesForVisualAnalysis(
	inspection: VideoAssetInspection,
): Array<Keyframe & { imagePath: string }> {
	const seenShots = new Set<string>();
	const selected: Array<Keyframe & { imagePath: string }> = [];
	for (const keyframe of inspection.keyframes) {
		if (!keyframe.imagePath || seenShots.has(keyframe.shotId)) continue;
		seenShots.add(keyframe.shotId);
		selected.push({ ...keyframe, imagePath: keyframe.imagePath });
	}
	return selected.slice(0, 12);
}

function shotForKeyframe({
	inspection,
	keyframe,
}: {
	inspection: VideoAssetInspection;
	keyframe: Keyframe;
}): ShotSegment | null {
	return inspection.shots.find((shot) => shot.id === keyframe.shotId) ?? null;
}

async function fetchKeyframeDataUrl({
	fetchFn,
	keyframe,
}: {
	fetchFn: typeof fetch;
	keyframe: Keyframe & { imagePath: string };
}): Promise<{ dataUrl: string; mimeType: string; name: string }> {
	const payload = encodeURIComponent(
		JSON.stringify({
			imagePath: keyframe.imagePath,
			name: `${keyframe.id}.jpg`,
		}),
	);
	const response = await fetchFn(
		`/api/desktop/media/keyframe?payload=${payload}`,
		{ method: "GET" },
	);
	const body = await parseJsonResponse(response);
	if (!isRecord(body)) {
		throw new Error("provider_error: keyframe response must be an object");
	}
	if (
		typeof body.dataUrl !== "string" ||
		typeof body.mimeType !== "string" ||
		typeof body.name !== "string"
	) {
		throw new Error("provider_error: invalid keyframe response");
	}
	return {
		dataUrl: body.dataUrl,
		mimeType: body.mimeType,
		name: body.name,
	};
}

async function analyzeKeyframeVisualMedia({
	analysisLevel,
	asset,
	fetchFn,
	focusHint,
	inspection,
	intent,
}: {
	analysisLevel: VideoAnalysisLevel;
	asset: VideoMediaAsset;
	fetchFn: typeof fetch;
	focusHint?: string;
	inspection: VideoAssetInspection;
	intent: VideoIntent;
}): Promise<VisualSemanticResult> {
	const keyframes = keyframesForVisualAnalysis(inspection);
	if (keyframes.length === 0) {
		throw new Error("provider_error: no extracted keyframes available");
	}
	const shots: ShotVisualAnalysis[] = [];
	const summaries: string[] = [];
	const models: string[] = [];
	for (const keyframe of keyframes) {
		const shot = shotForKeyframe({ inspection, keyframe });
		if (!shot) continue;
		const image = await fetchKeyframeDataUrl({ fetchFn, keyframe });
		const response = await fetchFn("/api/agent/vision/analyze", {
			body: JSON.stringify({
				analysisType: "visual_summary",
				detail: analysisLevel === "deep" ? "high" : "default",
				maxLongSidePixel: 1024,
				media: {
					dataUrl: image.dataUrl,
					mediaAssetId: `${asset.id}:${keyframe.id}`,
					mimeType: image.mimeType,
					name: image.name,
					type: "image",
					width: asset.width,
					height: asset.height,
				},
				prompt: `请基于这一张视频关键帧生成 Shotlyx Video Semantic Index 的结构化视觉信息。
当前不是整段视频理解，而是抽帧判断。不要假装知道关键帧之外的动作。
用户意图: ${intent}
${focusHint ? `用户指定片段/关注范围: ${focusHint}\n` : ""}Shot: ${shot.id}
Time: ${shot.start.toFixed(3)}s-${shot.end.toFixed(3)}s
Keyframe: ${keyframe.id}@${keyframe.time.toFixed(3)}s

请只输出 JSON：
{
  "globalSummary": "这张关键帧显示的视频内容",
  "shots": [
    {
      "shotId": "${shot.id}",
      "visualSummary": "这段画面主要在展示什么",
      "sceneType": "talking_head / screen_recording / product_demo / broll / vlog / gameplay / mg_animation / unknown",
      "mainObjects": ["主要画面元素"],
      "actions": ["画面中能确认的动作或状态"],
      "possibleIntent": "这个片段在视频里可能承担什么作用",
      "editSuggestions": ["剪辑上可以怎么使用"]
    }
  ]
}`,
				stream: false,
			}),
			headers: {
				"Content-Type": "application/json",
			},
			method: "POST",
		});
		const parsed = parseVisionResponse(await parseJsonResponse(response));
		if (parsed.globalSummary) summaries.push(parsed.globalSummary);
		if (parsed.modelUsed) models.push(parsed.modelUsed);
		shots.push(...(parsed.shots ?? []));
	}
	return {
		globalSummary: summaries.length > 0 ? summaries.join(" ") : undefined,
		modelUsed: models.length > 0 ? [...new Set(models)].join(",") : undefined,
		shots,
	};
}

async function defaultTranscribeVideoAsset({
	asset,
	fetchFn,
}: {
	asset: VideoMediaAsset;
	fetchFn: typeof fetch;
}): Promise<TranscriptSemanticResult | null> {
	const payload = encodeURIComponent(
		JSON.stringify({
			name: asset.name || asset.file.name,
			videoId: asset.id,
		}),
	);
	const response = await fetchFn(
		`/api/desktop/media/transcript?payload=${payload}`,
		{
			body: asset.file,
			headers: {
				"Content-Type": asset.file.type || "video/mp4",
			},
			method: "POST",
		},
	);
	return parseTranscriptionResponse(await parseJsonResponse(response));
}

function mergeModelUsed({
	index,
	models,
}: {
	index: VideoSemanticIndex;
	models: Array<string | undefined>;
}): VideoSemanticIndex {
	return {
		...index,
		analysisMeta: {
			...index.analysisMeta,
			modelUsed: [
				...new Set(
					[...index.analysisMeta.modelUsed, ...models].filter(Boolean),
				),
			],
		},
	};
}

export function buildVideoSemanticTools({
	deps,
	editor,
}: BuildVideoSemanticToolsOptions): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;
	const inspectVideoAsset = deps?.inspectVideoAsset ?? defaultInspectVideoAsset;
	const analyzeVisualMedia =
		deps?.analyzeVisualMedia ?? defaultAnalyzeVisualMedia;
	const transcribeVideoAsset =
		deps?.transcribeVideoAsset ?? defaultTranscribeVideoAsset;

	return [
		{
			name: "video_semantic_index_analyze",
			description:
				"把项目中的视频素材分析成 Video Semantic Index。子 Agent 应先读取这个索引，再基于 semanticSegments、SegmentCard、transcript 和 editValue 生成总结、剪辑计划、字幕/MG/B-roll 建议。",
			parameters: {
				analysisLevel: {
					type: "string",
					description: "分析深度：basic、standard 或 deep。默认 standard。",
					optional: true,
				},
				intent: {
					type: "string",
					description:
						"用户意图：summarize、classify_asset、find_moment、extract_highlights、edit_suggestion、auto_edit、generate_script、caption、voiceover、mg_animation、cover_select、broll_match。默认 summarize。",
					optional: true,
				},
				mediaAssetId: {
					type: "string",
					description:
						"视频媒体资源 ID。可来自 media_get_all、media_search 或 Agent References；留空时优先分析当前选中的视频，否则使用资源库中的第一个视频。",
					optional: true,
				},
				focusHint: {
					type: "string",
					description:
						"可选片段提示或关注范围，例如 0:10-0:18、shot_003、开头 5 秒。当前不会裁剪上传小片段，而是先检查该片段 ASR，再用关键帧聚焦分析，必要时才整段视频兜底。",
					optional: true,
				},
			},
			// Tool handlers use the MCP Tool interface's positional signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const mediaAssetId = optionalStringParam(params, "mediaAssetId");
				const asset = resolveTargetVideoAsset({ editor, mediaAssetId });
				const intent = normalizeIntent(optionalStringParam(params, "intent"));
				const analysisLevel = normalizeAnalysisLevel(
					optionalStringParam(params, "analysisLevel"),
				);
				const focusHint = optionalStringParam(params, "focusHint");
				const cacheKey = cacheKeyFor({
					analysisLevel,
					asset,
					focusHint,
					intent,
				});
				const cached = indexCache.get(cacheKey);
				if (cached) {
					return {
						analysisPlan: buildAnalysisPlan({
							intent,
							profile: cached.profile,
						}),
						agentViews: buildSemanticAgentViews({ index: cached }),
						cached: true,
						...(focusHint ? { focusHint } : {}),
						index: cached,
						mediaAssetId: asset.id,
					};
				}

				context?.onProgress?.({
					current: 1,
					label: "正在按镜头片段体检视频并切分镜头",
					stage: "semantic-inspection",
					status: "running",
					total: 4,
				});
				const inspection = await inspectVideoAsset({
					analysisLevel,
					asset,
					fetchFn,
				});
				const plan = buildAnalysisPlan({ intent, profile: inspection.profile });

				context?.onProgress?.({
					current: 2,
					label: inspection.profile.hasAudio
						? "正在通过 ASR 定位语义片段"
						: "检测到无音轨，准备抽帧理解画面",
					stage: "semantic-transcript",
					status: "running",
					total: 4,
				});
				const transcript = inspection.profile.hasAudio
					? await transcribeVideoAsset({
							analysisLevel,
							asset,
							fetchFn,
							intent,
						}).catch(() => null)
					: null;
				const transcriptStatus: TranscriptStrategyStatus =
					inspection.profile.hasAudio
						? hasSemanticTranscript(transcript?.transcript)
							? "used"
							: "empty"
						: "skipped_no_audio";
				const visualStrategy = chooseVisualStrategy({
					focusHint,
					inspection,
					intent,
					transcript: transcript?.transcript,
				});

				context?.onProgress?.({
					current: 3,
					label: visualStrategy.visualMode
						? visualStrategy.visualMode === "keyframes"
							? "正在用关键帧判断必要画面内容"
							: "关键帧不可用，正在整段视频理解兜底"
						: visualStrategy.visualStatus === "skipped_focused_asr_semantic"
							? "ASR 已覆盖片段，跳过视频理解上传"
							: "ASR 已提供语义，跳过视频理解上传",
					stage: "semantic-vision",
					status: visualStrategy.visualMode ? "running" : "success",
					total: 4,
				});
				const visual = visualStrategy.visualMode
					? await analyzeVisualMedia({
							analysisLevel,
							asset,
							fetchFn,
							focusHint,
							inspection,
							intent,
							visualMode: visualStrategy.visualMode,
						}).catch(() => ({}))
					: {};
				const globalSummary =
					visual.globalSummary ??
					(visualStrategy.visualMode
						? undefined
						: buildAsrGlobalSummary({
								transcript: transcriptForAsrSummary({
									transcript: transcript?.transcript,
									visualStrategy,
								}),
							}));

				const index = mergeModelUsed({
					index: buildVideoSemanticIndex({
						globalSummary,
						inspection,
						transcript: transcript?.transcript,
						visualAnalyses: visual.shots,
					}),
					models: [visual.modelUsed, transcript?.modelUsed],
				});
				indexCache.set(cacheKey, index);
				context?.onProgress?.({
					current: 4,
					label: "视频语义索引已生成",
					stage: "semantic-index",
					status: "success",
					total: 4,
				});
				return {
					agentViews: buildSemanticAgentViews({ index }),
					analysisPlan: plan,
					analysisStrategy: {
						transcript: transcriptStatus,
						visual: visualStrategy.visualStatus,
					},
					cached: false,
					...(focusHint ? { focusHint } : {}),
					index,
					mediaAssetId: asset.id,
				};
			},
		},
		{
			name: "video_semantic_index_get",
			description:
				"读取最近缓存的视频语义索引。用于后续 Summary、Editing、Caption、MG、B-roll 子 Agent 在不重新看原视频的情况下复用分析结果。",
			parameters: {
				analysisLevel: {
					type: "string",
					description: "分析深度：basic、standard 或 deep。默认 standard。",
					optional: true,
				},
				intent: {
					type: "string",
					description: "索引生成时使用的意图，默认 summarize。",
					optional: true,
				},
				mediaAssetId: {
					type: "string",
					description: "视频媒体资源 ID",
				},
				focusHint: {
					type: "string",
					description:
						"索引生成时使用的片段提示或关注范围；如果分析时传过 focusHint，读取缓存时也传同一个值。",
					optional: true,
				},
			},
			handler: (params) => {
				const mediaAssetId = requireStringParam(params, "mediaAssetId");
				const asset = resolveTargetVideoAsset({ editor, mediaAssetId });
				const intent = normalizeIntent(optionalStringParam(params, "intent"));
				const analysisLevel = normalizeAnalysisLevel(
					optionalStringParam(params, "analysisLevel"),
				);
				const focusHint = optionalStringParam(params, "focusHint");
				const cached = indexCache.get(
					cacheKeyFor({ analysisLevel, asset, focusHint, intent }),
				);
				if (!cached) {
					throw new Error(
						"未找到缓存的视频语义索引，请先调用 video_semantic_index_analyze",
					);
				}
				return {
					agentViews: buildSemanticAgentViews({ index: cached }),
					cached: true,
					...(focusHint ? { focusHint } : {}),
					index: cached,
					mediaAssetId: asset.id,
				};
			},
		},
	];
}
