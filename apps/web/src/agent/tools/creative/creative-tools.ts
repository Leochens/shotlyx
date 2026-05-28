import type { Tool, ToolExecutionContext } from "@/agent/mcp/types";
import {
	optionalBooleanParam,
	optionalNumberParam,
	optionalStringParam,
	requireStringParam,
} from "@/agent/mcp/validation";
import {
	createShotlyxMGCompositionPlan,
	type ShotlyxMGCompositionComponentPlan,
	type ShotlyxMGCompositionDirectorPlan,
} from "@/shotlyx/remotion-components/composition-director";
import {
	DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
	buildShotlyxMGCompositionGenerationGuidance,
	resolveMGCompositionStyleGuide,
} from "@/shotlyx/remotion-components/composition-prompt";
import { registerShotlyxMGAsset } from "@/shotlyx/remotion-components/asset-store";
import type { GenerateShotlyxMGComponentOptions } from "@/shotlyx/remotion-components/generator";
import {
	SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
	buildShotlyxMGElementFromAsset,
} from "@/shotlyx/remotion-components/project-assets";
import {
	buildRemotionSkillContextSummary,
	formatRemotionSkillSummary,
	type RemotionSkillContextSummary,
} from "@/shotlyx/remotion-components/skill-context";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	isShotlyxRemotionMGAsset,
	type ShotlyxMGAsset,
	type ShotlyxMGDocument,
	type ShotlyxMGPropDefinition,
	type ShotlyxMGPropValue,
	type ShotlyxRemotionComponentDocument,
} from "@/shotlyx/remotion-components/types";
import type { EditorCore } from "@/core";
import { motionGraphicDefinitions } from "@/graphics/definitions/motion-graphics";
import type { ProcessedMediaAsset } from "@/media/processing";
import { buildMotionGraphicManifest } from "@/motion-graphics/manifest";
import type { ParamValues } from "@/params";
import type { TimelineElement } from "@/timeline";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import {
	getCreativeAsset,
	registerCreativeAsset,
} from "./creative-asset-store";
import { searchMockVideos } from "./mock-video-provider";
import type { CreativeAsset } from "./types";

const ORIENTATIONS = ["landscape", "portrait", "square"] as const;
const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const;
const SEEDANCE_VIDEO_ASPECT_RATIOS = [
	"16:9",
	"9:16",
	"1:1",
	"4:3",
	"3:4",
] as const;
const SEEDANCE_VIDEO_DURATIONS = [5, 8, 10, 12] as const;
const IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const ZERO_CREATIVE_MEDIA_TIME = 0 as MediaTime;

type Orientation = (typeof ORIENTATIONS)[number];
type AspectRatio = (typeof ASPECT_RATIOS)[number];
type SeedanceVideoAspectRatio = (typeof SEEDANCE_VIDEO_ASPECT_RATIOS)[number];
type SeedanceVideoDuration = (typeof SEEDANCE_VIDEO_DURATIONS)[number];
type ImageSize = (typeof IMAGE_SIZES)[number];

interface ImportedCreativeAssetResult {
	mediaAssetId: string;
	name: string;
	type: CreativeAsset["type"];
	title: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
	previewUrl?: string;
	thumbnailUrl?: string;
	alreadyImported: boolean;
}

type CreativeFetchFn = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

const SHOTLYX_MG_EDITABLE_INSTANCE_PARAMS = [
	{
		key: "opacity",
		label: "Opacity",
		type: "number",
		min: 0,
		max: 1,
		step: 0.01,
	},
] as const;

interface CreativeToolDeps {
	fetchFn: CreativeFetchFn;
	processMediaAssetsFn: (args: {
		files: FileList | File[];
	}) => Promise<ProcessedMediaAsset[]>;
	generateShotlyxMGComponentFn?: (
		args: GenerateShotlyxMGComponentOptions,
	) => Promise<ShotlyxRemotionComponentDocument>;
}

interface ShotlyxMGJobEvent {
	type:
		| "started"
		| "progress"
		| "component-complete"
		| "completed"
		| "cancelled"
		| "error";
	jobId: string;
	label?: string;
	status?: "running" | "success" | "error";
	detail?: string;
	index?: number;
	total?: number;
	taskId?: string;
	taskLabel?: string;
	document?: ShotlyxRemotionComponentDocument;
	documents?: ShotlyxRemotionComponentDocument[];
	error?: string;
}

interface ShotlyxMGJobFollowResult {
	status: "completed";
	documents: ShotlyxRemotionComponentDocument[];
	saved: Array<{
		assetId: string;
		name: string;
		trackId?: string;
		elementId?: string;
	}>;
}

class ShotlyxMGJobTerminalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ShotlyxMGJobTerminalError";
	}
}

async function defaultProcessMediaAssetsFn(args: {
	files: FileList | File[];
}): Promise<ProcessedMediaAsset[]> {
	const { processMediaAssets } = await import("@/media/processing");
	return processMediaAssets(args);
}

function isOrientation(value: string): value is Orientation {
	return ORIENTATIONS.some((item) => item === value);
}

function isAspectRatio(value: string): value is AspectRatio {
	return ASPECT_RATIOS.some((item) => item === value);
}

function isSeedanceVideoAspectRatio(
	value: string,
): value is SeedanceVideoAspectRatio {
	return SEEDANCE_VIDEO_ASPECT_RATIOS.some((item) => item === value);
}

function isSeedanceVideoDuration(
	value: number,
): value is SeedanceVideoDuration {
	return SEEDANCE_VIDEO_DURATIONS.some((item) => item === value);
}

function isImageSize(value: string): value is ImageSize {
	return IMAGE_SIZES.some((item) => item === value);
}

function requirePositiveInteger({
	value,
	key,
	max,
}: {
	value: number;
	key: string;
	max?: number;
}): number {
	if (
		!Number.isInteger(value) ||
		value < 1 ||
		(max !== undefined && value > max)
	) {
		throw new Error(
			max === undefined
				? `类型不匹配："${key}" 必须为大于等于 1 的整数`
				: `类型不匹配："${key}" 必须为 1 到 ${max} 的整数`,
		);
	}
	return value;
}

function optionalOrientationParam(
	params: Record<string, unknown>,
): Orientation | undefined {
	const value = optionalStringParam(params, "orientation");
	if (value === undefined) return undefined;
	if (!isOrientation(value)) {
		throw new Error(
			`类型不匹配："orientation" 必须为以下之一：${ORIENTATIONS.join(", ")}`,
		);
	}
	return value;
}

function optionalAspectRatioParam(
	params: Record<string, unknown>,
): AspectRatio | undefined {
	const value = optionalStringParam(params, "aspectRatio");
	if (value === undefined) return undefined;
	if (!isAspectRatio(value)) {
		throw new Error(
			`类型不匹配："aspectRatio" 必须为以下之一：${ASPECT_RATIOS.join(", ")}`,
		);
	}
	return value;
}

function optionalSeedanceVideoAspectRatioParam(
	params: Record<string, unknown>,
): SeedanceVideoAspectRatio | undefined {
	const value = optionalStringParam(params, "aspectRatio");
	if (value === undefined) return undefined;
	if (!isSeedanceVideoAspectRatio(value)) {
		throw new Error(
			`类型不匹配："aspectRatio" 必须为以下之一：${SEEDANCE_VIDEO_ASPECT_RATIOS.join(", ")}`,
		);
	}
	return value;
}

function optionalSeedanceVideoDurationParam(
	params: Record<string, unknown>,
): SeedanceVideoDuration | undefined {
	const value = optionalNumberParam(params, "durationSeconds");
	if (value === undefined) return undefined;
	if (!isSeedanceVideoDuration(value)) {
		throw new Error(
			`类型不匹配："durationSeconds" 必须为以下之一：${SEEDANCE_VIDEO_DURATIONS.join(", ")}`,
		);
	}
	return value;
}

function optionalNonEmptyStringParam({
	params,
	key,
}: {
	params: Record<string, unknown>;
	key: string;
}): string | undefined {
	const value = optionalStringParam(params, key)?.trim();
	return value ? value : undefined;
}

function optionalImageSizeParam(
	params: Record<string, unknown>,
): ImageSize | undefined {
	const value = optionalStringParam(params, "size");
	if (value === undefined) return undefined;
	if (!isImageSize(value)) {
		throw new Error(
			`类型不匹配："size" 必须为以下之一：${IMAGE_SIZES.join(", ")}`,
		);
	}
	return value;
}

function resolveImageSize({
	aspectRatio,
	size,
}: {
	aspectRatio?: AspectRatio;
	size?: ImageSize;
}): ImageSize {
	if (size) return size;

	switch (aspectRatio) {
		case "16:9":
			return "1536x1024";
		case "9:16":
			return "1024x1536";
		case "1:1":
		default:
			return "1024x1024";
	}
}

function dimensionsFromSize(size: ImageSize): {
	width: number;
	height: number;
} {
	const [width, height] = size.split("x").map((value) => Number(value));
	return { width, height };
}

function extensionFromContentType({
	contentType,
	fallback,
}: {
	contentType: string;
	fallback: "png" | "mp4";
}): string {
	if (contentType === "image/jpeg") return "jpg";
	if (contentType === "image/webp") return "webp";
	if (contentType === "image/png") return "png";
	if (contentType === "video/quicktime") return "mov";
	if (contentType === "video/webm") return "webm";
	if (contentType === "video/mp4") return "mp4";
	return fallback;
}

function sanitizeFilenamePart(value: string): string {
	const sanitized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return sanitized || "creative-asset";
}

function buildGeneratedImageTitle({
	prompt,
	index,
}: {
	prompt: string;
	index: number;
}): string {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	if (!normalized) return `Generated image ${index + 1}`;
	const title =
		normalized.length > 48 ? normalized.slice(0, 48).trim() : normalized;
	return index === 0 ? title : `${title} ${index + 1}`;
}

function buildGeneratedVideoTitle({ prompt }: { prompt: string }): string {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	if (!normalized) return "Seedance video";
	const title =
		normalized.length > 48 ? normalized.slice(0, 48).trim() : normalized;
	return `${title} · Seedance`;
}

function buildCompositionName({ prompt }: { prompt: string }): string {
	const normalized = prompt.trim().replace(/\s+/g, " ");
	if (!normalized) return "Shotlyx MG 组合";
	const title =
		normalized.length > 40 ? normalized.slice(0, 40).trim() : normalized;
	return `${title} · MG 组合`;
}

function buildShotlyxMGJobComponentAssetId({
	jobId,
	index,
}: {
	jobId: string;
	index: number;
}): string {
	return `shotlyx-mg-job-${jobId}-component-${index + 1}`;
}

function buildCompositionComponentPrompt({
	prompt,
	directorPlan,
	component,
	componentIndex,
	totalComponents,
	aspectRatio,
	styleGuide,
	transparentBackground,
}: {
	prompt: string;
	directorPlan: ShotlyxMGCompositionDirectorPlan;
	component: ShotlyxMGCompositionComponentPlan;
	componentIndex: number;
	totalComponents: number;
	aspectRatio: string;
	styleGuide?: string;
	transparentBackground: boolean;
}): string {
	return [
		buildShotlyxMGCompositionGenerationGuidance({
			description: prompt,
			aspectRatio,
			durationSeconds: component.durationSeconds,
			componentCount: totalComponents,
			styleGuide,
			transparentBackground,
		}),
		`组合式 Shotlyx MG 总需求：${prompt}`,
		`Director 总体概念：${directorPlan.title}`,
		`Director 视觉风格：${directorPlan.visualStyle}`,
		`Director 叙事弧线：${directorPlan.narrativeArc}`,
		`现在只生成第 ${componentIndex + 1}/${totalComponents} 个小组件：${component.label}。`,
		`组件职责：${component.focus}`,
		`视觉角色：${component.visualRole}`,
		`组件建议时长：${component.durationSeconds.toFixed(1)}s`,
		`时间位置：${component.screenTiming}`,
		`动效方向：${component.animationDirection}`,
		`质量底线：${component.qualityBar}`,
		"节奏要求：短促标注/箭头/圆圈可以只做 1-2 秒，不要为了填满默认时长而空等；如果该组件持续多秒，必须包含入场、保持期的轻微运动或强调、以及必要的退场，不能 1 秒动完后剩余时间空白。",
		"这个组件会和其他小组件叠加使用，所以只输出自己负责的视觉层，不要试图完成整个动画。",
		transparentBackground
			? "背景模式：透明。不要绘制全画布黑底/实底，只输出可叠加到视频上的局部图形、文字、线条和强调层。"
			: "背景模式：允许根据设计需要绘制完整背景。",
		"所有用户后续可能修改的文字、颜色、数据、数值和显示开关都必须进入 propsSchema。",
	].join("\n");
}

function emitToolProgress({
	context,
	stage,
	label,
	status,
	detail,
	current,
	total,
	jobId,
	taskId,
	taskLabel,
	taskIndex,
}: {
	context?: ToolExecutionContext;
	stage: string;
	label: string;
	status: "running" | "success" | "error";
	detail?: string;
	current?: number;
	total?: number;
	jobId?: string;
	taskId?: string;
	taskLabel?: string;
	taskIndex?: number;
}): void {
	context?.onProgress?.({
		stage,
		label,
		status,
		detail,
		current,
		total,
		jobId,
		taskId,
		taskLabel,
		taskIndex,
	});
}

function emitRemotionSkillProgress({
	context,
	summary,
}: {
	context?: ToolExecutionContext;
	summary: RemotionSkillContextSummary;
}): void {
	emitToolProgress({
		context,
		stage: "skill-context",
		label: "已加载 Remotion Skill",
		status: "success",
		detail: formatRemotionSkillSummary({ summary }),
		current: summary.selectedRules.length,
		total: summary.selectedRules.length,
	});
}

function getToolErrorDetail(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "生成失败";
}

function getMGDefinition({ definitionId }: { definitionId: string }) {
	const definition = motionGraphicDefinitions.find(
		(item) => item.id === definitionId,
	);
	if (!definition) {
		throw new Error(`资源不存在：找不到 MG 定义 "${definitionId}"`);
	}
	return definition;
}

function isShotlyxMGDefinitionId({ definitionId }: { definitionId: string }) {
	return definitionId === SHOTLYX_MG_GRAPHIC_DEFINITION_ID;
}

function requireShotlyxMGAssetForElement({
	editor,
	element,
}: {
	editor: EditorCore;
	element: TimelineElement;
}) {
	if (
		element.type !== "graphic" ||
		!isShotlyxMGDefinitionId({ definitionId: element.definitionId }) ||
		!element.motionGraphicAssetId
	) {
		throw new Error("类型不匹配：目标不是 Shotlyx MG 动画");
	}
	const asset = editor.project.getShotlyxMGAsset?.({
		id: element.motionGraphicAssetId,
	});
	if (!asset) {
		throw new Error(
			`资源不存在：找不到 Shotlyx MG 资源 "${element.motionGraphicAssetId}"`,
		);
	}
	return asset;
}

function mediaTimeFromSecondsForCreative({
	seconds,
}: {
	seconds: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}

function mediaTimeFromTicksForCreative({
	ticks,
}: {
	ticks: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(ticks) as MediaTime;
}

function getExplicitStartTime({
	params,
}: {
	params: Record<string, unknown>;
}): MediaTime | null {
	const startTimeSeconds = optionalNumberParam(params, "startTimeSeconds");
	return startTimeSeconds === undefined
		? null
		: mediaTimeFromSecondsForCreative({ seconds: startTimeSeconds });
}

function getStartTime({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): MediaTime {
	const explicitStartTime = getExplicitStartTime({ params });
	if (explicitStartTime !== null) return explicitStartTime;

	const currentTime = editor.playback.getCurrentTime();
	return typeof currentTime === "number"
		? currentTime
		: ZERO_CREATIVE_MEDIA_TIME;
}

function listTimelineElements({ editor }: { editor: EditorCore }): Array<{
	trackId: string;
	trackType: string;
	element: TimelineElement;
}> {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return [];
	return [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	].flatMap((track) =>
		track.elements.map((element) => ({
			trackId: track.id,
			trackType: track.type,
			element,
		})),
	);
}

interface ShotlyxMGTimelinePlacementState {
	trackId: string | null;
	nextStartTime: MediaTime;
}

function isShotlyxMGTimelineElement({
	element,
}: {
	element: TimelineElement;
}): boolean {
	return (
		element.type === "graphic" &&
		isShotlyxMGDefinitionId({ definitionId: element.definitionId })
	);
}

function getTimelineElementEndTime({
	element,
}: {
	element: TimelineElement | Omit<TimelineElement, "id">;
}): number {
	return Number(element.startTime) + Number(element.duration);
}

function findPreferredShotlyxMGTrackId({
	editor,
}: {
	editor: EditorCore;
}): string | null {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return null;
	const existingMGTrack = scene.tracks.overlay.find(
		(track) =>
			track.type === "graphic" &&
			track.elements.some((element) => isShotlyxMGTimelineElement({ element })),
	);
	if (existingMGTrack) return existingMGTrack.id;
	const existingGraphicTrack = scene.tracks.overlay.find(
		(track) => track.type === "graphic",
	);
	return existingGraphicTrack?.id ?? null;
}

function ensureShotlyxMGTimelineTrackId({
	editor,
}: {
	editor: EditorCore;
}): string | null {
	const existingTrackId = findPreferredShotlyxMGTrackId({ editor });
	if (existingTrackId) return existingTrackId;
	if (!editor.scenes.getActiveSceneOrNull()) return null;
	return editor.timeline.addTrack({ type: "graphic", index: 0 });
}

function getLatestTrackEndTime({
	editor,
	trackId,
}: {
	editor: EditorCore;
	trackId: string | null;
}): number {
	if (!trackId) return 0;
	return listTimelineElements({ editor }).reduce((latestEnd, item) => {
		if (item.trackId !== trackId) return latestEnd;
		return Math.max(
			latestEnd,
			getTimelineElementEndTime({ element: item.element }),
		);
	}, 0);
}

function findFirstSubtitleCueTime({ editor }: { editor: EditorCore }): number {
	let earliest = Number.POSITIVE_INFINITY;
	for (const { element } of listTimelineElements({ editor })) {
		if (element.type !== "subtitle") continue;
		for (const cue of element.cues) {
			earliest = Math.min(
				earliest,
				Number(element.startTime) +
					Math.round(cue.startTime * MEDIA_TIME_TICKS_PER_SECOND),
			);
		}
	}
	return Number.isFinite(earliest) ? earliest : 0;
}

function createShotlyxMGTimelinePlacementState({
	editor,
	params,
	startTime,
}: {
	editor: EditorCore;
	params?: Record<string, unknown>;
	startTime?: MediaTime;
}): ShotlyxMGTimelinePlacementState {
	const trackId = ensureShotlyxMGTimelineTrackId({ editor });
	const explicitStartTime = params ? getExplicitStartTime({ params }) : null;
	if (explicitStartTime !== null || startTime !== undefined) {
		return {
			trackId,
			nextStartTime: explicitStartTime ?? startTime ?? ZERO_CREATIVE_MEDIA_TIME,
		};
	}
	const currentTime = editor.playback.getCurrentTime();
	const playheadTime =
		typeof currentTime === "number" ? currentTime : ZERO_CREATIVE_MEDIA_TIME;
	return {
		trackId,
		nextStartTime: mediaTimeFromTicksForCreative({
			ticks: Math.max(
				Number(playheadTime),
				findFirstSubtitleCueTime({ editor }),
				getLatestTrackEndTime({ editor, trackId }),
			),
		}),
	};
}

function getShotlyxMGInsertPlacement({
	placement,
}: {
	placement: ShotlyxMGTimelinePlacementState;
}) {
	return placement.trackId
		? ({ mode: "explicit", trackId: placement.trackId } as const)
		: ({ mode: "auto", trackType: "graphic" } as const);
}

function buildNextShotlyxMGTimelineElement({
	asset,
	placement,
}: {
	asset: ShotlyxMGAsset;
	placement: ShotlyxMGTimelinePlacementState;
}) {
	const element = buildShotlyxMGElementFromAsset({
		asset,
		startTime: placement.nextStartTime,
	});
	placement.nextStartTime = mediaTimeFromTicksForCreative({
		ticks: getTimelineElementEndTime({ element }),
	});
	return element;
}

function findInsertedElement({
	editor,
	beforeIds,
}: {
	editor: EditorCore;
	beforeIds: Set<string>;
}): { trackId: string; elementId: string } | null {
	const selection = editor.selection.getSelectedElements();
	const selected = selection[0];
	if (selected) {
		return selected;
	}

	const item = listTimelineElements({ editor }).find(
		(candidate) => !beforeIds.has(candidate.element.id),
	);
	return item ? { trackId: item.trackId, elementId: item.element.id } : null;
}

function requireParamValuesObject(value: unknown): ParamValues {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("参数格式错误：props 必须为对象");
	}
	const props: ParamValues = {};
	for (const [key, nextValue] of Object.entries(value)) {
		if (
			typeof nextValue !== "string" &&
			typeof nextValue !== "number" &&
			typeof nextValue !== "boolean"
		) {
			throw new Error(
				`类型不匹配：MG 参数 "${key}" 必须为字符串、数字或布尔值`,
			);
		}
		if (typeof nextValue === "number" && Number.isNaN(nextValue)) {
			throw new Error(`类型不匹配：MG 参数 "${key}" 不能为 NaN`);
		}
		props[key] = nextValue;
	}
	return props;
}

function isShotlyxMGPropValue(value: unknown): value is ShotlyxMGPropValue {
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return !(typeof value === "number" && Number.isNaN(value));
	}
	if (!Array.isArray(value)) return false;
	return value.every((row) => {
		if (typeof row !== "object" || row === null || Array.isArray(row)) {
			return false;
		}
		return Object.values(row).every(
			(item) =>
				typeof item === "string" ||
				typeof item === "number" ||
				typeof item === "boolean",
		);
	});
}

function requireShotlyxMGPropsObject({
	asset,
	value,
}: {
	asset: ShotlyxMGAsset;
	value: unknown;
}): Record<string, ShotlyxMGPropValue> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("参数格式错误：props 必须为对象");
	}
	const editableKeys = new Set(
		asset.document.propsSchema.map((prop) => prop.key),
	);
	const props: Record<string, ShotlyxMGPropValue> = {};
	for (const [key, nextValue] of Object.entries(value)) {
		if (!editableKeys.has(key)) {
			throw new Error(`参数不存在：Shotlyx MG 不包含属性 "${key}"`);
		}
		if (!isShotlyxMGPropValue(nextValue)) {
			throw new Error(
				`类型不匹配：Shotlyx MG 参数 "${key}" 必须为字符串、数字、布尔值或表格数组`,
			);
		}
		props[key] = nextValue;
	}
	return props;
}

function isTransparentColorValue(value: unknown): boolean {
	if (typeof value !== "string") return false;
	const normalized = value.trim().toLowerCase().replace(/\s+/g, "");
	return (
		normalized === "transparent" ||
		normalized === "#0000" ||
		normalized === "#00000000" ||
		normalized === "rgba(0,0,0,0)" ||
		normalized === "hsla(0,0%,0%,0)"
	);
}

function isShotlyxMGBackgroundColorProp({
	prop,
}: {
	prop: Pick<ShotlyxMGPropDefinition, "key" | "label" | "type">;
}): boolean {
	if (prop.type !== "color") return false;
	const text = `${prop.key} ${prop.label}`.toLowerCase();
	return (
		text.includes("background") ||
		text.includes("backdrop") ||
		text.includes("canvas") ||
		/\bbg\b/.test(text)
	);
}

function getShotlyxMGBackgroundPropKeys({
	asset,
}: {
	asset: ShotlyxMGAsset;
}): string[] {
	return asset.document.propsSchema
		.filter((prop) => isShotlyxMGBackgroundColorProp({ prop }))
		.map((prop) => prop.key);
}

function solidBackgroundFallbackForProp({
	prop,
	currentValue,
}: {
	prop: ShotlyxMGPropDefinition;
	currentValue: unknown;
}): string {
	if (
		typeof currentValue === "string" &&
		!isTransparentColorValue(currentValue)
	) {
		return currentValue;
	}
	if (
		typeof prop.default === "string" &&
		!isTransparentColorValue(prop.default)
	) {
		return prop.default;
	}
	return "#0f172a";
}

function buildShotlyxMGBackgroundPropUpdates({
	asset,
	transparentBackground,
	currentProps,
}: {
	asset: ShotlyxMGAsset;
	transparentBackground?: boolean;
	currentProps?: Record<string, unknown>;
}): {
	props: Record<string, ShotlyxMGPropValue>;
	backgroundPropKeys: string[];
} {
	if (transparentBackground === undefined) {
		return { props: {}, backgroundPropKeys: [] };
	}
	const props: Record<string, ShotlyxMGPropValue> = {};
	const backgroundProps = asset.document.propsSchema.filter((prop) =>
		isShotlyxMGBackgroundColorProp({ prop }),
	);
	for (const prop of backgroundProps) {
		props[prop.key] = transparentBackground
			? "transparent"
			: solidBackgroundFallbackForProp({
					prop,
					currentValue:
						currentProps?.[prop.key] ?? asset.document.defaultProps[prop.key],
				});
	}
	return {
		props,
		backgroundPropKeys: backgroundProps.map((prop) => prop.key),
	};
}

function mergeTransparentBackgroundProps({
	props,
	backgroundProps,
	transparentBackground,
}: {
	props: Record<string, ShotlyxMGPropValue>;
	backgroundProps: Record<string, ShotlyxMGPropValue>;
	transparentBackground?: boolean;
}): Record<string, ShotlyxMGPropValue> {
	if (transparentBackground === undefined) return props;
	return transparentBackground
		? { ...props, ...backgroundProps }
		: { ...backgroundProps, ...props };
}

function requireShotlyxMGUpdatePropsObject({
	asset,
	value,
}: {
	asset: ShotlyxMGAsset;
	value: unknown;
}): {
	props: Record<string, ShotlyxMGPropValue>;
	instanceParams: Record<string, string | number | boolean>;
} {
	if (value === undefined) {
		return { props: {}, instanceParams: {} };
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("参数格式错误：props 必须为对象");
	}
	const editableKeys = new Set(
		asset.document.propsSchema.map((prop) => prop.key),
	);
	const props: Record<string, ShotlyxMGPropValue> = {};
	const instanceParams: Record<string, string | number | boolean> = {};
	for (const [key, nextValue] of Object.entries(value)) {
		if (editableKeys.has(key)) {
			if (!isShotlyxMGPropValue(nextValue)) {
				throw new Error(
					`类型不匹配：Shotlyx MG 参数 "${key}" 必须为字符串、数字、布尔值或表格数组`,
				);
			}
			props[key] = nextValue;
			continue;
		}
		if (key === "opacity") {
			if (
				typeof nextValue !== "number" ||
				Number.isNaN(nextValue) ||
				nextValue < 0 ||
				nextValue > 1
			) {
				throw new Error('类型不匹配："opacity" 必须在 0 到 1 之间');
			}
			instanceParams.opacity = nextValue;
			continue;
		}
		throw new Error(`参数不存在：Shotlyx MG 不包含属性 "${key}"`);
	}
	return { props, instanceParams };
}

function getShotlyxMGInstanceParams({
	element,
}: {
	element: TimelineElement;
}): Record<string, string | number | boolean> {
	const params: Record<string, string | number | boolean> = {};
	for (const definition of SHOTLYX_MG_EDITABLE_INSTANCE_PARAMS) {
		const value = element.params[definition.key];
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			params[definition.key] = value;
		}
	}
	return params;
}

function resolveMGElementFromParams({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): { trackId: string; element: TimelineElement } {
	const elementId = optionalStringParam(params, "elementId");
	const trackId = optionalStringParam(params, "trackId");
	const name = optionalStringParam(params, "name")?.toLowerCase();
	const elements = listTimelineElements({ editor });

	const direct = elementId
		? elements.find(
				(item) =>
					item.element.id === elementId &&
					(trackId ? item.trackId === trackId : true),
			)
		: null;
	if (direct) {
		return direct;
	}

	const named = name
		? elements.find(
				(item) =>
					item.element.name.toLowerCase().includes(name) ||
					name.includes(item.element.name.toLowerCase()),
			)
		: null;
	if (named) {
		return named;
	}

	const selected = editor.selection.getSelectedElements()[0];
	const selectedItem = selected
		? elements.find(
				(item) =>
					item.trackId === selected.trackId &&
					item.element.id === selected.elementId,
			)
		: null;
	if (selectedItem) {
		return selectedItem;
	}

	throw new Error(
		"无法确定 MG 动画：请提供 elementId/name，或先选中一个 MG 动画",
	);
}

function resolveShotlyxMGAssetFromParams({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): ShotlyxMGAsset | null {
	const assetId = optionalStringParam(params, "motionGraphicAssetId");
	if (assetId) {
		return editor.project.getShotlyxMGAsset?.({ id: assetId }) ?? null;
	}

	const assetName = optionalStringParam(params, "assetName")?.toLowerCase();
	if (assetName) {
		const asset = editor.project
			.getShotlyxMGAssets?.()
			.find(
				(item) =>
					item.name.toLowerCase().includes(assetName) ||
					assetName.includes(item.name.toLowerCase()),
			);
		if (asset) return asset;
	}

	try {
		const { element } = resolveMGElementFromParams({ editor, params });
		if (
			element.type === "graphic" &&
			isShotlyxMGDefinitionId({ definitionId: element.definitionId })
		) {
			return requireShotlyxMGAssetForElement({ editor, element });
		}
	} catch {
		return null;
	}

	return null;
}

function resolveMGAssetFromParams({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}) {
	const assetId = optionalStringParam(params, "motionGraphicAssetId");
	if (assetId) {
		const asset = editor.project.getMotionGraphicAsset({ id: assetId });
		if (!asset) {
			throw new Error(`资源不存在：找不到 MG 资源 "${assetId}"`);
		}
		return asset;
	}

	const assetName = optionalStringParam(params, "assetName")?.toLowerCase();
	if (assetName) {
		const asset = editor.project
			.getMotionGraphicAssets()
			.find(
				(item) =>
					item.name.toLowerCase().includes(assetName) ||
					assetName.includes(item.name.toLowerCase()),
			);
		if (asset) {
			return asset;
		}
	}

	const { element } = resolveMGElementFromParams({ editor, params });
	if (element.type !== "graphic" || !element.motionGraphicAssetId) {
		throw new Error("无法确定 MG 资源：目标不是项目级 MG 资源实例");
	}

	const asset = editor.project.getMotionGraphicAsset({
		id: element.motionGraphicAssetId,
	});
	if (!asset) {
		throw new Error(
			`资源不存在：找不到 MG 资源 "${element.motionGraphicAssetId}"`,
		);
	}
	return asset;
}

function getShotlyxMGEditableProps({ asset }: { asset: ShotlyxMGAsset }) {
	return asset.document.propsSchema.map((prop) => ({
		key: prop.key,
		label: prop.label,
		type: prop.type,
		role: prop.role,
		default: prop.default,
		options: prop.options,
		columns: prop.columns,
	}));
}

function buildShotlyxMGSchemaResult({ asset }: { asset: ShotlyxMGAsset }) {
	const manifest =
		asset.runtime === SHOTLYX_REMOTION_COMPONENT_RUNTIME
			? (asset.document.manifest ?? null)
			: null;

	return {
		shotlyxMGAssetId: asset.id,
		motionGraphicAssetId: asset.id,
		name: asset.name,
		definitionId: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
		durationSeconds: asset.document.durationSeconds,
		transparentBackground: asset.document.transparentBackground ?? false,
		backgroundPropKeys: getShotlyxMGBackgroundPropKeys({ asset }),
		params: asset.document.defaultProps,
		manifest,
		editableProps: getShotlyxMGEditableProps({ asset }),
		renderer: asset.runtime,
	};
}

function buildFilename({
	asset,
	contentType,
}: {
	asset: CreativeAsset;
	contentType: string;
}): string {
	const extension = extensionFromContentType({
		contentType,
		fallback: asset.type === "image" ? "png" : "mp4",
	});
	return `${sanitizeFilenamePart(asset.title)}.${extension}`;
}

async function parseImageGenerationResponse(response: Response): Promise<{
	images: Array<{
		url: string;
		model: string;
		prompt: string;
		provider: "openai-compatible";
	}>;
}> {
	try {
		const payload: unknown = await response.json();
		if (
			typeof payload !== "object" ||
			payload === null ||
			!("images" in payload) ||
			!Array.isArray(payload.images)
		) {
			throw new Error("provider_error: invalid image generation response");
		}

		const images = payload.images.map((item) => {
			if (typeof item !== "object" || item === null) {
				throw new Error("provider_error: invalid image generation response");
			}

			const url = "url" in item ? item.url : undefined;
			const model = "model" in item ? item.model : undefined;
			const prompt = "prompt" in item ? item.prompt : undefined;

			if (
				typeof url !== "string" ||
				typeof model !== "string" ||
				typeof prompt !== "string"
			) {
				throw new Error("provider_error: invalid image generation response");
			}

			return {
				url,
				model,
				prompt,
				provider: "openai-compatible" as const,
			};
		});

		return { images };
	} catch {
		throw new Error("provider_error: invalid image generation response");
	}
}

async function readRouteError(response: Response): Promise<string> {
	try {
		const payload: unknown = await response.json();
		if (
			typeof payload === "object" &&
			payload !== null &&
			"error" in payload &&
			typeof payload.error === "string" &&
			payload.error.length > 0
		) {
			return payload.error;
		}
	} catch {
		// Fallback to generic provider_error when the route error payload is invalid.
	}

	return "provider_error";
}

async function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("媒体处理失败：无法读取参考图"));
		};
		reader.onerror = () => reject(new Error("媒体处理失败：无法读取参考图"));
		reader.readAsDataURL(file);
	});
}

async function referenceImageUrlFromMediaAsset({
	editor,
	mediaAssetId,
}: {
	editor: EditorCore;
	mediaAssetId?: string;
}): Promise<string | undefined> {
	if (!mediaAssetId) return undefined;
	const asset = editor.media
		.getAssets()
		.find((item) => item.id === mediaAssetId);
	if (!asset) {
		throw new Error(`资源不存在：找不到参考图 "${mediaAssetId}"`);
	}
	if (asset.type !== "image") {
		throw new Error("类型不匹配：Seedance 参考素材必须是图片资源");
	}
	return fileToDataUrl(asset.file);
}

async function parseSeedanceCreateResponse(response: Response): Promise<{
	id: string;
	model: string;
	prompt: string;
	aspectRatio?: string;
	durationSeconds?: number;
}> {
	try {
		const payload: unknown = await response.json();
		if (
			typeof payload !== "object" ||
			payload === null ||
			!("id" in payload) ||
			!("model" in payload) ||
			!("prompt" in payload) ||
			typeof payload.id !== "string" ||
			typeof payload.model !== "string" ||
			typeof payload.prompt !== "string"
		) {
			throw new Error("provider_error: invalid Seedance create response");
		}
		return {
			id: payload.id,
			model: payload.model,
			prompt: payload.prompt,
			aspectRatio:
				"aspectRatio" in payload && typeof payload.aspectRatio === "string"
					? payload.aspectRatio
					: undefined,
			durationSeconds:
				"durationSeconds" in payload &&
				typeof payload.durationSeconds === "number"
					? payload.durationSeconds
					: undefined,
		};
	} catch {
		throw new Error("provider_error: invalid Seedance create response");
	}
}

async function parseSeedanceTaskResponse(response: Response): Promise<{
	id: string;
	model?: string;
	status: string;
	videoUrl?: string;
	lastFrameUrl?: string;
	error?: string;
	aspectRatio?: string;
	durationSeconds?: number;
}> {
	try {
		const payload: unknown = await response.json();
		if (
			typeof payload !== "object" ||
			payload === null ||
			!("id" in payload) ||
			!("status" in payload) ||
			typeof payload.id !== "string" ||
			typeof payload.status !== "string"
		) {
			throw new Error("provider_error: invalid Seedance task response");
		}
		return {
			id: payload.id,
			status: payload.status,
			model:
				"model" in payload && typeof payload.model === "string"
					? payload.model
					: undefined,
			videoUrl:
				"videoUrl" in payload && typeof payload.videoUrl === "string"
					? payload.videoUrl
					: undefined,
			lastFrameUrl:
				"lastFrameUrl" in payload && typeof payload.lastFrameUrl === "string"
					? payload.lastFrameUrl
					: undefined,
			error:
				"error" in payload && typeof payload.error === "string"
					? payload.error
					: undefined,
			aspectRatio:
				"aspectRatio" in payload && typeof payload.aspectRatio === "string"
					? payload.aspectRatio
					: undefined,
			durationSeconds:
				"durationSeconds" in payload &&
				typeof payload.durationSeconds === "number"
					? payload.durationSeconds
					: undefined,
		};
	} catch {
		throw new Error("provider_error: invalid Seedance task response");
	}
}

function waitForSeedancePoll({
	ms,
	signal,
}: {
	ms: number;
	signal?: AbortSignal;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("工具调用已停止"));
			return;
		}
		const timeout = globalThis.setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				globalThis.clearTimeout(timeout);
				reject(new Error("工具调用已停止"));
			},
			{ once: true },
		);
	});
}

function proxiedSeedanceDownloadUrl(videoUrl: string): string {
	return `/api/agent/creative/video/seedance/download?url=${encodeURIComponent(videoUrl)}`;
}

function isShotlyxRemotionComponentDocument(
	value: unknown,
): value is ShotlyxRemotionComponentDocument {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const version: unknown = Reflect.get(value, "version");
	const runtime: unknown = Reflect.get(value, "runtime");
	const name: unknown = Reflect.get(value, "name");
	const durationSeconds: unknown = Reflect.get(value, "durationSeconds");
	const fps: unknown = Reflect.get(value, "fps");
	const width: unknown = Reflect.get(value, "width");
	const height: unknown = Reflect.get(value, "height");
	const aspectRatio: unknown = Reflect.get(value, "aspectRatio");
	const componentSource: unknown = Reflect.get(value, "componentSource");
	const compiledModule: unknown = Reflect.get(value, "compiledModule");
	const propsSchema: unknown = Reflect.get(value, "propsSchema");
	const defaultProps: unknown = Reflect.get(value, "defaultProps");
	return (
		version === 1 &&
		runtime === SHOTLYX_REMOTION_COMPONENT_RUNTIME &&
		typeof name === "string" &&
		typeof durationSeconds === "number" &&
		typeof fps === "number" &&
		typeof width === "number" &&
		typeof height === "number" &&
		typeof aspectRatio === "string" &&
		typeof componentSource === "string" &&
		typeof compiledModule === "string" &&
		Array.isArray(propsSchema) &&
		typeof defaultProps === "object" &&
		defaultProps !== null &&
		!Array.isArray(defaultProps)
	);
}

async function parseShotlyxMGJobStartResponse(response: Response): Promise<{
	jobId: string;
}> {
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new Error("provider_error: invalid Shotlyx MG job response");
	}
	if (
		typeof payload !== "object" ||
		payload === null ||
		!("jobId" in payload) ||
		typeof payload.jobId !== "string"
	) {
		throw new Error("provider_error: invalid Shotlyx MG job response");
	}
	return { jobId: payload.jobId };
}

function buildShotlyxMGJobRouteBody({
	args,
	componentCount,
}: {
	args: GenerateShotlyxMGComponentOptions;
	componentCount: number;
}): Record<string, unknown> {
	return {
		prompt: args.prompt,
		durationSeconds: args.durationSeconds,
		aspectRatio: args.aspectRatio,
		styleGuide: args.styleGuide,
		transparentBackground: args.transparentBackground,
		componentCount,
		repairAttempts: args.repairAttempts,
		preferPlainJson: args.preferPlainJson,
		maxOutputTokens: args.maxOutputTokens,
	};
}

async function startShotlyxMGJobViaRoute({
	args,
	fetchFn,
	componentCount,
}: {
	args: GenerateShotlyxMGComponentOptions;
	fetchFn: CreativeFetchFn;
	componentCount: number;
}): Promise<{ jobId: string }> {
	let response: Response;
	try {
		response = await fetchFn("/api/agent/creative/mg-jobs", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(
				buildShotlyxMGJobRouteBody({
					args,
					componentCount,
				}),
			),
			signal: args.abortSignal,
		});
	} catch {
		throw new Error("provider_error: Shotlyx MG job request failed");
	}

	if (!response.ok) {
		throw new Error(await readRouteError(response));
	}

	return parseShotlyxMGJobStartResponse(response);
}

function parseShotlyxMGJobEvent(value: unknown): ShotlyxMGJobEvent | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const type = Reflect.get(value, "type");
	const jobId = Reflect.get(value, "jobId");
	const documents = Reflect.get(value, "documents");
	if (
		!(
			type === "started" ||
			type === "progress" ||
			type === "component-complete" ||
			type === "completed" ||
			type === "cancelled" ||
			type === "error"
		) ||
		typeof jobId !== "string"
	) {
		return null;
	}
	const document = Reflect.get(value, "document");
	return {
		type,
		jobId,
		label:
			typeof Reflect.get(value, "label") === "string"
				? Reflect.get(value, "label")
				: undefined,
		status:
			Reflect.get(value, "status") === "success" ||
			Reflect.get(value, "status") === "error" ||
			Reflect.get(value, "status") === "running"
				? Reflect.get(value, "status")
				: undefined,
		detail:
			typeof Reflect.get(value, "detail") === "string"
				? Reflect.get(value, "detail")
				: undefined,
		index:
			typeof Reflect.get(value, "index") === "number"
				? Reflect.get(value, "index")
				: undefined,
		total:
			typeof Reflect.get(value, "total") === "number"
				? Reflect.get(value, "total")
				: undefined,
		taskId:
			typeof Reflect.get(value, "taskId") === "string"
				? Reflect.get(value, "taskId")
				: undefined,
		taskLabel:
			typeof Reflect.get(value, "taskLabel") === "string"
				? Reflect.get(value, "taskLabel")
				: undefined,
		document: isShotlyxRemotionComponentDocument(document)
			? document
			: undefined,
		documents: Array.isArray(documents)
			? documents.filter(isShotlyxRemotionComponentDocument)
			: undefined,
		error:
			typeof Reflect.get(value, "error") === "string"
				? Reflect.get(value, "error")
				: undefined,
	};
}

function readSSEEventData({ chunk }: { chunk: string }): unknown | null {
	const dataLines = chunk
		.split("\n")
		.filter((line) => line.startsWith("data: "))
		.map((line) => line.slice("data: ".length));
	if (dataLines.length === 0) return null;
	try {
		return JSON.parse(dataLines.join("\n"));
	} catch {
		return null;
	}
}

async function followShotlyxMGJob({
	jobId,
	fetchFn,
	signal,
	onEvent,
}: {
	jobId: string;
	fetchFn: CreativeFetchFn;
	signal?: AbortSignal;
	onEvent: (event: ShotlyxMGJobEvent) => void;
}): Promise<void> {
	const response = await fetchFn(
		`/api/agent/creative/mg-jobs/${jobId}/events`,
		{
			method: "GET",
			signal,
		},
	);
	if (!response.ok) {
		throw new Error(await readRouteError(response));
	}
	if (!response.body) {
		throw new Error("provider_error: Shotlyx MG job stream missing body");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const chunks = buffer.split("\n\n");
		buffer = chunks.pop() ?? "";
		for (const chunk of chunks) {
			const parsed = readSSEEventData({ chunk });
			const event = parseShotlyxMGJobEvent(parsed);
			if (!event) continue;
			onEvent(event);
			if (
				event.type === "completed" ||
				event.type === "cancelled" ||
				event.type === "error"
			) {
				return;
			}
		}
	}

	if (buffer.trim()) {
		const parsed = readSSEEventData({ chunk: buffer });
		const event = parseShotlyxMGJobEvent(parsed);
		if (event) onEvent(event);
	}
}

async function cancelShotlyxMGJobViaRoute({
	jobId,
	fetchFn,
}: {
	jobId: string;
	fetchFn: CreativeFetchFn;
}): Promise<void> {
	const response = await fetchFn(`/api/agent/creative/mg-jobs/${jobId}`, {
		method: "DELETE",
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(await readRouteError(response));
	}
}

function saveShotlyxMGDocumentToProject({
	editor,
	document,
	sourcePrompt,
	startTime,
	placementState,
	insertToTimeline,
	assetId,
}: {
	editor: EditorCore;
	document: ShotlyxMGDocument;
	sourcePrompt: string;
	startTime: MediaTime;
	placementState?: ShotlyxMGTimelinePlacementState;
	insertToTimeline: boolean;
	assetId?: string;
}): { assetId: string; name: string; trackId?: string; elementId?: string } {
	const existingAsset = assetId
		? editor.project.getShotlyxMGAsset?.({ id: assetId })
		: null;
	const asset =
		existingAsset ??
		registerShotlyxMGAsset({
			id: assetId,
			document,
			sourcePrompt: document.sourcePrompt ?? sourcePrompt,
		});
	if (!existingAsset) {
		editor.project.upsertShotlyxMGAsset({ asset });
	}

	if (!insertToTimeline) {
		return { assetId: asset.id, name: asset.name };
	}
	const existingElement = listTimelineElements({ editor }).find(
		(item) =>
			item.element.type === "graphic" &&
			item.element.motionGraphicAssetId === asset.id,
	);
	if (existingElement) {
		return {
			assetId: asset.id,
			name: asset.name,
			trackId: existingElement.trackId,
			elementId: existingElement.element.id,
		};
	}

	const beforeIds = new Set(
		listTimelineElements({ editor }).map((item) => item.element.id),
	);
	const placement =
		placementState ??
		createShotlyxMGTimelinePlacementState({ editor, startTime });
	const element = buildNextShotlyxMGTimelineElement({ asset, placement });

	editor.timeline.insertElement({
		element,
		placement: getShotlyxMGInsertPlacement({ placement }),
	});

	const inserted = findInsertedElement({ editor, beforeIds });
	return {
		assetId: asset.id,
		name: asset.name,
		trackId: inserted?.trackId,
		elementId: inserted?.elementId,
	};
}

async function followShotlyxMGJobToCompletion({
	editor,
	fetchFn,
	jobId,
	sourcePrompt,
	startTime,
	placementState,
	insertToTimeline,
	context,
}: {
	editor: EditorCore;
	fetchFn: CreativeFetchFn;
	jobId: string;
	sourcePrompt: string;
	startTime: MediaTime;
	placementState?: ShotlyxMGTimelinePlacementState;
	insertToTimeline: boolean;
	context?: ToolExecutionContext;
}): Promise<ShotlyxMGJobFollowResult> {
	const completedComponentDocuments = new Map<
		number,
		{
			document: ShotlyxRemotionComponentDocument;
			label?: string;
			taskId?: string;
			taskLabel?: string;
		}
	>();
	const savedComponentIndexes = new Set<number>();
	let terminalEvent: ShotlyxMGJobEvent | null = null;
	let completedDocuments: ShotlyxRemotionComponentDocument[] = [];
	let savedComponents: ShotlyxMGJobFollowResult["saved"] = [];
	const saveCompletedDocuments = ({
		documents,
		total,
	}: {
		documents: ShotlyxRemotionComponentDocument[];
		total?: number;
	}): ShotlyxMGJobFollowResult["saved"] => {
		const savedResults: ShotlyxMGJobFollowResult["saved"] = [];
		for (const [index, document] of documents.entries()) {
			if (savedComponentIndexes.has(index)) continue;
			savedComponentIndexes.add(index);
			const componentMeta = completedComponentDocuments.get(index);
			const saved = saveShotlyxMGDocumentToProject({
				editor,
				document,
				sourcePrompt,
				startTime,
				placementState,
				insertToTimeline,
				assetId: buildShotlyxMGJobComponentAssetId({
					jobId,
					index,
				}),
			});
			emitToolProgress({
				context,
				stage: "generation",
				label: componentMeta?.label ?? `已生成${saved.name}`,
				status: "success",
				current: index + 1,
				total: total ?? documents.length,
				jobId,
				taskId: componentMeta?.taskId,
				taskLabel: componentMeta?.taskLabel,
				taskIndex: index,
			});
			savedResults.push(saved);
		}
		return savedResults;
	};
	const handleAbort = () => {
		void cancelShotlyxMGJobViaRoute({ jobId, fetchFn }).catch((error) => {
			emitToolProgress({
				context,
				stage: "cancelled",
				label: "停止 MG 子智能体失败",
				status: "error",
				detail: getToolErrorDetail(error),
			});
		});
	};
	const emitCancelledProgress = () => {
		emitToolProgress({
			context,
			stage: "cancelled",
			label: "MG 子智能体已停止",
			status: "error",
			jobId,
		});
	};
	if (context?.signal?.aborted) {
		handleAbort();
		emitCancelledProgress();
		throw new ShotlyxMGJobTerminalError("MG 子智能体已停止");
	} else {
		context?.signal?.addEventListener("abort", handleAbort, { once: true });
	}

	try {
		await followShotlyxMGJob({
			jobId,
			fetchFn,
			signal: context?.signal,
			onEvent: (event) => {
				if (event.type === "component-complete" && event.document) {
					const componentIndex = event.index ?? 0;
					if (!completedComponentDocuments.has(componentIndex)) {
						completedComponentDocuments.set(componentIndex, {
							document: event.document,
							label: event.label,
							taskId: event.taskId,
							taskLabel: event.taskLabel,
						});
					}
					emitToolProgress({
						context,
						stage: "generation",
						label: event.label ?? `已生成${event.document.name}`,
						status: "success",
						current:
							event.index === undefined ? undefined : event.index + 1,
						total: event.total,
						jobId: event.jobId,
						taskId: event.taskId,
						taskLabel: event.taskLabel,
						taskIndex: componentIndex,
					});
					return;
				}
				if (event.type === "completed") {
					terminalEvent = event;
					completedDocuments =
						event.documents && event.documents.length > 0
							? event.documents
							: [...completedComponentDocuments.entries()]
									.sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
									.map(([, item]) => item.document);
					savedComponents = saveCompletedDocuments({
						documents: completedDocuments,
						total: event.total,
					});
					emitToolProgress({
						context,
						stage: event.type,
						label: event.label ?? "MG 子智能体已完成",
						status: event.status ?? "success",
						detail: event.detail,
						current: event.index,
						total: event.total,
						jobId: event.jobId,
					});
					return;
				}
				if (event.type === "error") {
					terminalEvent = event;
					emitToolProgress({
						context,
						stage: "generation",
						label: event.label ?? "MG 子智能体失败",
						status: "error",
						detail: event.error,
						jobId: event.jobId,
					});
					return;
				}
				if (event.type === "cancelled") {
					terminalEvent = event;
				}
				emitToolProgress({
					context,
					stage: event.type,
					label:
						event.label ??
						(event.type === "cancelled"
							? "MG 子智能体已停止"
							: "MG 子智能体运行中"),
					status:
						event.status ??
						(event.type === "cancelled" ? "error" : "running"),
					detail: event.detail,
					current: event.index === undefined ? undefined : event.index + 1,
					total: event.total,
					jobId: event.jobId,
					taskId: event.taskId,
					taskLabel: event.taskLabel,
					taskIndex: event.index,
				});
			},
		});
	} catch (error) {
		if (context?.signal?.aborted) {
			emitCancelledProgress();
			throw new ShotlyxMGJobTerminalError("MG 子智能体已停止");
		}
		throw error;
	} finally {
		context?.signal?.removeEventListener("abort", handleAbort);
	}

	if (!terminalEvent) {
		throw new Error(
			"provider_error: Shotlyx MG job ended without terminal status",
		);
	}
	if (terminalEvent.type === "completed") {
		return {
			status: "completed",
			documents: completedDocuments,
			saved: savedComponents,
		};
	}
	if (terminalEvent.type === "cancelled") {
		throw new ShotlyxMGJobTerminalError(
			terminalEvent.detail ?? terminalEvent.label ?? "MG 子智能体已停止",
		);
	}
	throw new ShotlyxMGJobTerminalError(
		terminalEvent.error ??
			terminalEvent.detail ??
			terminalEvent.label ??
			"MG 子智能体失败",
	);
}

function followShotlyxMGJobInBackground({
	editor,
	fetchFn,
	jobId,
	sourcePrompt,
	startTime,
	placementState,
	insertToTimeline,
	context,
}: {
	editor: EditorCore;
	fetchFn: CreativeFetchFn;
	jobId: string;
	sourcePrompt: string;
	startTime: MediaTime;
	placementState?: ShotlyxMGTimelinePlacementState;
	insertToTimeline: boolean;
	context?: ToolExecutionContext;
}): void {
	void followShotlyxMGJobToCompletion({
		editor,
		fetchFn,
		jobId,
		sourcePrompt,
		startTime,
		placementState,
		insertToTimeline,
		context,
	}).catch((error) => {
		if (
			context?.signal?.aborted ||
			error instanceof ShotlyxMGJobTerminalError
		) {
			return;
		}
		emitToolProgress({
			context,
			stage: "generation",
			label: "MG 子智能体连接失败",
			status: "error",
			detail: getToolErrorDetail(error),
		});
	});
}

export function resumeShotlyxMGJobInBackground({
	editor,
	fetchFn = globalThis.fetch.bind(globalThis),
	jobId,
	sourcePrompt,
	startTimeSeconds = 0,
	insertToTimeline,
	signal,
	onProgress,
}: {
	editor: EditorCore;
	fetchFn?: CreativeFetchFn;
	jobId: string;
	sourcePrompt: string;
	startTimeSeconds?: number;
	insertToTimeline: boolean;
	signal?: AbortSignal;
	onProgress?: ToolExecutionContext["onProgress"];
}): void {
	const startTime = mediaTimeFromSecondsForCreative({
		seconds: startTimeSeconds,
	});
	followShotlyxMGJobInBackground({
		editor,
		fetchFn,
		jobId,
		sourcePrompt,
		startTime,
		placementState: insertToTimeline
			? createShotlyxMGTimelinePlacementState({ editor, startTime })
			: undefined,
		insertToTimeline,
		context: { signal, onProgress },
	});
}

async function importCreativeAsset({
	editor,
	asset,
	deps,
}: {
	editor: EditorCore;
	asset: CreativeAsset;
	deps: CreativeToolDeps;
}): Promise<ImportedCreativeAssetResult> {
	if (asset.mediaAssetId) {
		return {
			mediaAssetId: asset.mediaAssetId,
			name: asset.name ?? asset.title,
			type: asset.type,
			title: asset.title,
			sizeBytes: asset.sizeBytes,
			width: asset.width,
			height: asset.height,
			previewUrl: asset.previewUrl,
			thumbnailUrl: asset.thumbnailUrl,
			alreadyImported: true,
		};
	}

	const project = editor.project.getActiveOrNull();
	if (!project) {
		throw new Error("状态错误：未加载项目，无法导入创意资源");
	}

	const source = asset.downloadUrl ?? asset.url;

	let response: Response;
	try {
		response = await deps.fetchFn(source, { method: "GET" });
	} catch {
		throw new Error("网络错误：无法下载创意资源");
	}

	if (!response.ok) {
		throw new Error(`网络错误：无法下载创意资源 (${response.status})`);
	}

	const blob = await response.blob();
	const file = new File(
		[blob],
		buildFilename({
			asset,
			contentType: blob.type,
		}),
		{
			type: blob.type,
		},
	);

	const processed = await deps.processMediaAssetsFn({ files: [file] });
	const mediaAsset = processed[0];
	if (!mediaAsset) {
		throw new Error("媒体处理失败：无法处理创意资源");
	}

	const result = await editor.media.addMediaAsset({
		projectId: project.metadata.id,
		asset: {
			...mediaAsset,
			ephemeral: false,
		},
	});
	if (!result) {
		throw new Error("媒体导入失败：保存创意资源时出错");
	}

	return {
		mediaAssetId: result.id,
		name: result.name,
		type: asset.type,
		title: asset.title,
		sizeBytes: result.file.size,
		width: result.width,
		height: result.height,
		previewUrl: result.url,
		thumbnailUrl: result.thumbnailUrl,
		alreadyImported: false,
	};
}

export function buildCreativeTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps?: Partial<CreativeToolDeps>;
}): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;
	const creativeDeps: CreativeToolDeps = {
		fetchFn,
		processMediaAssetsFn:
			deps?.processMediaAssetsFn ?? defaultProcessMediaAssetsFn,
		generateShotlyxMGComponentFn: deps?.generateShotlyxMGComponentFn,
	};
	return [
		{
			name: "creative_search_video",
			description: "搜索 mock 视频素材，返回候选资源，不修改项目状态",
			parameters: {
				query: {
					type: "string",
					description: "搜索关键词",
				},
				orientation: {
					type: "string",
					description: "画幅方向：landscape、portrait、square",
					optional: true,
				},
				durationSeconds: {
					type: "number",
					description: "最大时长秒数",
					optional: true,
				},
				count: {
					type: "number",
					description: "返回数量，默认 5，最大 10",
					optional: true,
				},
			},
			handler: (params) => {
				const query = requireStringParam(params, "query");
				const orientation = optionalOrientationParam(params);
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				const countValue = optionalNumberParam(params, "count");
				const count =
					countValue === undefined
						? undefined
						: requirePositiveInteger({
								value: countValue,
								key: "count",
								max: 10,
							});
				const result = searchMockVideos({
					query,
					orientation,
					durationSeconds,
					count,
				});

				return {
					candidates: result.candidates.map((candidate) => {
						const { id: _id, ...input } = candidate;
						return registerCreativeAsset(input);
					}),
				};
			},
		},
		{
			name: "creative_generate_image",
			description:
				"调用服务端 OpenAI-compatible 生图 API 生成图片，并自动保存到 Shotlyx 媒体资源库",
			parameters: {
				prompt: {
					type: "string",
					description: "生图 prompt",
				},
				aspectRatio: {
					type: "string",
					description: "画幅比例：1:1、16:9、9:16",
					optional: true,
				},
				size: {
					type: "string",
					description: "图片尺寸：1024x1024、1536x1024、1024x1536",
					optional: true,
				},
				count: {
					type: "number",
					description: "生成数量，默认 1，最大 4",
					optional: true,
				},
			},
			handler: async (params) => {
				const prompt = requireStringParam(params, "prompt");
				const aspectRatio = optionalAspectRatioParam(params);
				const requestedSize = optionalImageSizeParam(params);
				const countValue = optionalNumberParam(params, "count");
				const count =
					countValue === undefined
						? 1
						: requirePositiveInteger({
								value: countValue,
								key: "count",
								max: 4,
							});
				const size = resolveImageSize({
					aspectRatio,
					size: requestedSize,
				});

				let response: Response;
				try {
					response = await creativeDeps.fetchFn("/api/agent/creative/image", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							prompt,
							size,
							count,
						}),
					});
				} catch {
					throw new Error("provider_error: image generation request failed");
				}

				if (!response.ok) {
					throw new Error(await readRouteError(response));
				}

				const result = await parseImageGenerationResponse(response);
				const { width, height } = dimensionsFromSize(size);

				const images: Array<{
					id: string;
					type: CreativeAsset["type"];
					provider: CreativeAsset["provider"];
					title: string;
					name?: string;
					sizeBytes?: number;
					width?: number;
					height?: number;
					mediaAssetId?: string;
					previewUrl?: string;
					thumbnailUrl?: string;
					model?: string;
					imported: boolean;
				}> = [];
				for (const [index, image] of result.images.entries()) {
					const title = buildGeneratedImageTitle({
						prompt: image.prompt,
						index,
					});
					const asset = registerCreativeAsset({
						type: "image",
						provider: "openai-compatible",
						title,
						url: image.url,
						previewUrl: image.url,
						prompt: image.prompt,
						model: image.model,
						width,
						height,
					});
					const imported = await importCreativeAsset({
						editor,
						asset,
						deps: creativeDeps,
					});

					asset.mediaAssetId = imported.mediaAssetId;
					asset.name = imported.name;
					asset.sizeBytes = imported.sizeBytes;
					asset.width = imported.width ?? asset.width;
					asset.height = imported.height ?? asset.height;
					asset.previewUrl = imported.previewUrl ?? asset.previewUrl;
					asset.thumbnailUrl = imported.thumbnailUrl ?? asset.thumbnailUrl;

					images.push({
						id: asset.id,
						type: asset.type,
						provider: asset.provider,
						title: asset.title,
						name: asset.name,
						sizeBytes: asset.sizeBytes,
						width: asset.width,
						height: asset.height,
						mediaAssetId: asset.mediaAssetId,
						previewUrl: asset.previewUrl,
						thumbnailUrl: asset.thumbnailUrl,
						model: asset.model,
						imported: true,
					});
				}

				return { images };
			},
		},
		{
			name: "creative_generate_seedance_video",
			description:
				"调用服务端 Volcengine Ark Seedance 视频生成 API 生成视频，轮询完成后自动保存到 Shotlyx 媒体资源库",
			parameters: {
				prompt: {
					type: "string",
					description: "视频生成 prompt，描述画面、动作、镜头、风格和声音需求",
				},
				aspectRatio: {
					type: "string",
					description: "视频比例：16:9、9:16、1:1、4:3、3:4，默认 16:9",
					optional: true,
				},
				durationSeconds: {
					type: "number",
					description: "视频时长秒数：5、8、10、12，默认 5",
					optional: true,
				},
				referenceMediaAssetId: {
					type: "string",
					description:
						"可选参考图媒体资源 ID。用户附加参考图或明确说使用某张图片时传入图片素材 ID",
					optional: true,
				},
				referenceImageUrl: {
					type: "string",
					description:
						"可选参考图 URL。仅当用户明确提供外部图片 URL 时使用；项目内图片优先用 referenceMediaAssetId",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const prompt = requireStringParam(params, "prompt");
				const aspectRatio =
					optionalSeedanceVideoAspectRatioParam(params) ?? "16:9";
				const durationSeconds = optionalSeedanceVideoDurationParam(params) ?? 5;
				const referenceMediaAssetId = optionalNonEmptyStringParam({
					params,
					key: "referenceMediaAssetId",
				});
				const explicitReferenceImageUrl = optionalNonEmptyStringParam({
					params,
					key: "referenceImageUrl",
				});
				const referenceImageUrl =
					explicitReferenceImageUrl ??
					(await referenceImageUrlFromMediaAsset({
						editor,
						mediaAssetId: referenceMediaAssetId,
					}));

				emitToolProgress({
					context,
					stage: "seedance-submit",
					label: "正在提交 Seedance 视频生成任务",
					status: "running",
					detail: `${aspectRatio} · ${durationSeconds}s`,
				});

				let response: Response;
				try {
					response = await creativeDeps.fetchFn(
						"/api/agent/creative/video/seedance",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								prompt,
								aspectRatio,
								durationSeconds,
								referenceImageUrl,
							}),
							signal: context?.signal,
						},
					);
				} catch (error) {
					throw new Error(
						`provider_error: Seedance request failed${
							error instanceof Error ? `: ${error.message}` : ""
						}`,
					);
				}

				if (!response.ok) {
					throw new Error(await readRouteError(response));
				}

				const task = await parseSeedanceCreateResponse(response);
				emitToolProgress({
					context,
					stage: "seedance-submit",
					label: "Seedance 任务已创建",
					status: "success",
					detail: task.id,
				});

				const startedAt = Date.now();
				const timeoutMs = 10 * 60 * 1000;
				let currentTask: Awaited<ReturnType<typeof parseSeedanceTaskResponse>> =
					{
						id: task.id,
						status: "queued",
					};
				while (Date.now() - startedAt < timeoutMs) {
					emitToolProgress({
						context,
						stage: "seedance-poll",
						label: "正在等待 Seedance 生成视频",
						status: "running",
						detail: currentTask.status,
					});
					await waitForSeedancePoll({ ms: 5_000, signal: context?.signal });

					const pollResponse = await creativeDeps.fetchFn(
						`/api/agent/creative/video/seedance/${encodeURIComponent(task.id)}`,
						{ signal: context?.signal },
					);
					if (!pollResponse.ok) {
						throw new Error(await readRouteError(pollResponse));
					}
					currentTask = await parseSeedanceTaskResponse(pollResponse);
					if (currentTask.status === "succeeded") break;
					if (
						currentTask.status === "failed" ||
						currentTask.status === "cancelled"
					) {
						throw new Error(
							currentTask.error ??
								`provider_error: Seedance task ${currentTask.status}`,
						);
					}
				}

				if (currentTask.status !== "succeeded") {
					throw new Error("provider_error: Seedance task timed out");
				}
				if (!currentTask.videoUrl) {
					throw new Error("provider_error: Seedance task missing video URL");
				}

				emitToolProgress({
					context,
					stage: "seedance-import",
					label: "Seedance 视频已生成，正在导入资源库",
					status: "running",
					detail: currentTask.videoUrl,
				});

				const title = buildGeneratedVideoTitle({ prompt });
				const asset = registerCreativeAsset({
					type: "video",
					provider: "volcengine-seedance",
					title,
					url: currentTask.videoUrl,
					downloadUrl: proxiedSeedanceDownloadUrl(currentTask.videoUrl),
					previewUrl: currentTask.videoUrl,
					thumbnailUrl: currentTask.lastFrameUrl,
					prompt,
					model: task.model,
					duration: currentTask.durationSeconds ?? durationSeconds,
				});
				const imported = await importCreativeAsset({
					editor,
					asset,
					deps: creativeDeps,
				});
				asset.mediaAssetId = imported.mediaAssetId;
				asset.name = imported.name;
				asset.sizeBytes = imported.sizeBytes;
				asset.width = imported.width;
				asset.height = imported.height;
				asset.previewUrl = imported.previewUrl ?? asset.previewUrl;
				asset.thumbnailUrl = imported.thumbnailUrl ?? asset.thumbnailUrl;

				emitToolProgress({
					context,
					stage: "seedance-import",
					label: "Seedance 视频已保存到资源库",
					status: "success",
					detail: imported.name,
				});

				return {
					videos: [
						{
							id: asset.id,
							type: asset.type,
							provider: asset.provider,
							title: asset.title,
							name: asset.name,
							sizeBytes: asset.sizeBytes,
							width: asset.width,
							height: asset.height,
							duration: asset.duration,
							mediaAssetId: asset.mediaAssetId,
							previewUrl: asset.previewUrl,
							thumbnailUrl: asset.thumbnailUrl,
							model: asset.model,
							taskId: task.id,
							imported: true,
						},
					],
				};
			},
		},
		{
			name: "shotlyx_generate_mg_composition",
			description:
				"默认 MG 生成工具。将复杂自定义 MG 拆成多个可编辑 Shotlyx Remotion Component 小组件逐个生成、保存到 Assets，并可叠加插入时间线。用于标题大字、重点突出、箭头/圆圈/方框标注、数据可视化、数据表格、图表和多层讲解动画。",
			parameters: {
				prompt: {
					type: "string",
					description:
						"整体 MG 动画需求描述，包含主题、内容、数据、风格或节奏要求",
				},
				durationSeconds: {
					type: "number",
					description:
						"每个小组件的动画时长秒数，默认由生成器决定，最大 120 秒",
					optional: true,
				},
				aspectRatio: {
					type: "string",
					description: "画幅比例：16:9、9:16、1:1，默认 16:9",
					optional: true,
				},
				styleGuide: {
					type: "string",
					description:
						"可选风格或品牌约束。省略时使用智能组合的 Shotlyx Remotion 视频图形包装风格。",
					optional: true,
				},
				componentCount: {
					type: "number",
					description: "拆分生成的小组件数量，默认 4。没有固定上限",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description:
						"插入时间线的开始时间。省略时会分析现有 MG/字幕/播放头并自动排队",
					optional: true,
				},
				transparentBackground: {
					type: "boolean",
					description:
						"是否生成透明背景 MG，默认 true。用于叠加到视频素材上；只有用户明确要完整背景时设为 false。",
					optional: true,
				},
				insertToTimeline: {
					type: "boolean",
					description: "是否自动插入时间线，默认 true",
					optional: true,
				},
			},
			mutating: true,
			// Tool handlers use the MCP runtime signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const prompt = requireStringParam(params, "prompt");
				if (!editor.project.getActiveOrNull()) {
					throw new Error("状态错误：未加载项目，无法保存 Shotlyx MG 资产");
				}
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				if (
					durationSeconds !== undefined &&
					(durationSeconds <= 0 || durationSeconds > 120)
				) {
					throw new Error(
						"类型不匹配：durationSeconds 必须大于 0 且不超过 120",
					);
				}
				const componentCountValue = optionalNumberParam(
					params,
					"componentCount",
				);
				const componentCount = requirePositiveInteger({
					value: componentCountValue ?? DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
					key: "componentCount",
				});
				const aspectRatio = optionalAspectRatioParam(params) ?? "16:9";
				const styleGuide = resolveMGCompositionStyleGuide({
					styleGuide: optionalStringParam(params, "styleGuide"),
					componentCount,
				});
				const transparentBackground =
					optionalBooleanParam(params, "transparentBackground") ?? true;
				const insertToTimeline =
					optionalBooleanParam(params, "insertToTimeline") ?? true;
				if (insertToTimeline && !editor.scenes.getActiveSceneOrNull()) {
					throw new Error("状态错误：未加载场景，无法插入 Shotlyx MG 动画");
				}
				const placementState = insertToTimeline
					? createShotlyxMGTimelinePlacementState({ editor, params })
					: undefined;
				const startTime =
					placementState?.nextStartTime ?? getStartTime({ editor, params });
				const remotionSkill = buildRemotionSkillContextSummary({
					prompt,
					styleGuide,
				});
				emitRemotionSkillProgress({
					context,
					summary: remotionSkill,
				});
				const directorPlan = createShotlyxMGCompositionPlan({
					prompt,
					componentCount,
					durationSeconds,
					styleGuide,
				});
				emitToolProgress({
					context,
					stage: "director",
					label: "已规划 MG Director 分镜",
					status: "success",
					detail: `${directorPlan.title} · ${directorPlan.components
						.map((component) => component.label)
						.join(" / ")}`,
					current: 0,
					total: directorPlan.components.length,
				});

				if (!creativeDeps.generateShotlyxMGComponentFn) {
					const { jobId } = await startShotlyxMGJobViaRoute({
						args: {
							prompt,
							durationSeconds,
							aspectRatio,
							styleGuide,
							transparentBackground,
							abortSignal: context?.signal,
							repairAttempts: 1,
							preferPlainJson: false,
							maxOutputTokens: 8000,
						},
						fetchFn: creativeDeps.fetchFn,
						componentCount,
					});
					emitToolProgress({
						context,
						stage: "started",
						label: "MG 子智能体已启动",
						status: "running",
						current: 0,
						total: componentCount,
					});
					const jobResult = await followShotlyxMGJobToCompletion({
						editor,
						fetchFn: creativeDeps.fetchFn,
						jobId,
						sourcePrompt: prompt,
						startTime,
						placementState,
						insertToTimeline,
						context,
					});
					if (jobResult.documents.length === 0) {
						throw new Error(
							"provider_error: Shotlyx MG job completed without components",
						);
					}
					return {
						jobId,
						name: buildCompositionName({ prompt }),
						runtime: "shotlyx-mg-job-v1",
						status: jobResult.status,
						inserted: insertToTimeline,
						startTimeSeconds: Number(startTime) / MEDIA_TIME_TICKS_PER_SECOND,
						componentCount: jobResult.documents.length,
						components: jobResult.saved,
						transparentBackground,
						remotionSkill,
						directorPlan,
					};
				}

				const components = [];
				const timelineElements = [];
				const componentPlans = directorPlan.components;
				const compositionName = buildCompositionName({ prompt });

				emitToolProgress({
					context,
					stage: "planning",
					label: "规划 MG 小组件",
					status: "running",
					current: 0,
					total: componentPlans.length,
				});
				emitToolProgress({
					context,
					stage: "planning",
					label: `已规划 ${componentPlans.length} 个小组件`,
					status: "success",
					current: 0,
					total: componentPlans.length,
				});

				for (const [index, component] of componentPlans.entries()) {
					emitToolProgress({
						context,
						stage: "generation",
						label: `生成${component.label}`,
						status: "running",
						detail: component.focus,
						current: index + 1,
						total: componentPlans.length,
					});

					let document: ShotlyxRemotionComponentDocument;
					try {
						document = await creativeDeps.generateShotlyxMGComponentFn({
							prompt: buildCompositionComponentPrompt({
								prompt,
								directorPlan,
								component,
								componentIndex: index,
								totalComponents: componentPlans.length,
								aspectRatio,
								styleGuide,
								transparentBackground,
							}),
							durationSeconds: component.durationSeconds,
							aspectRatio,
							styleGuide,
							transparentBackground,
							abortSignal: context?.signal,
							repairAttempts: 1,
							preferPlainJson: false,
							maxOutputTokens: 8000,
						});
					} catch (error) {
						emitToolProgress({
							context,
							stage: "generation",
							label: `生成${component.label}失败`,
							status: "error",
							detail: getToolErrorDetail(error),
							current: index + 1,
							total: componentPlans.length,
						});
						throw error;
					}

					const asset = registerShotlyxMGAsset({
						document,
						sourcePrompt: document.sourcePrompt ?? prompt,
					});
					editor.project.upsertShotlyxMGAsset({ asset });

					let inserted: { trackId: string; elementId: string } | null = null;
					if (insertToTimeline) {
						if (!placementState) {
							throw new Error("状态错误：无法确定 MG 插入轨道");
						}
						const beforeIds = new Set(
							listTimelineElements({ editor }).map((item) => item.element.id),
						);
						const element = buildNextShotlyxMGTimelineElement({
							asset,
							placement: placementState,
						});

						editor.timeline.insertElement({
							element,
							placement: getShotlyxMGInsertPlacement({
								placement: placementState,
							}),
						});

						inserted = findInsertedElement({ editor, beforeIds });
						if (inserted) {
							timelineElements.push(inserted);
						}
					}

					const componentResult = {
						componentId: component.id,
						label: component.label,
						focus: component.focus,
						visualRole: component.visualRole,
						qualityBar: component.qualityBar,
						shotlyxMGAssetId: asset.id,
						name: asset.name,
						durationSeconds: asset.document.durationSeconds,
						aspectRatio: asset.document.aspectRatio,
						transparentBackground:
							asset.document.transparentBackground ?? transparentBackground,
						trackId: inserted?.trackId,
						elementId: inserted?.elementId,
						editableProps: asset.document.propsSchema.map((prop) => ({
							key: prop.key,
							label: prop.label,
							type: prop.type,
							role: prop.role,
						})),
					};
					components.push(componentResult);

					emitToolProgress({
						context,
						stage: "generation",
						label: `已生成${asset.name}`,
						status: "success",
						current: index + 1,
						total: componentPlans.length,
					});
				}

				emitToolProgress({
					context,
					stage: "complete",
					label: "组合 MG 已完成",
					status: "success",
					current: componentPlans.length,
					total: componentPlans.length,
				});

				return {
					name: compositionName,
					runtime: "shotlyx-mg-composition-v1",
					inserted: insertToTimeline,
					componentCount: components.length,
					transparentBackground,
					components,
					timelineElements,
					remotionSkill,
					directorPlan,
					validationReport: {
						status: "passed",
						renderer: "shotlyx-remotion-component-v1",
					},
				};
			},
		},
		{
			name: "shotlyx_generate_mg_component",
			description:
				"生成任意 Shotlyx Component MG 动画资产，保存到项目 Assets，并可插入时间线。用于自定义 MG、数据可视化、讲解动画、信息图动画，不使用固定模板。",
			parameters: {
				prompt: {
					type: "string",
					description: "MG 动画需求描述，包含主题、内容、数据、风格或节奏要求",
				},
				durationSeconds: {
					type: "number",
					description: "动画时长秒数，默认由生成器决定，最大 120 秒",
					optional: true,
				},
				aspectRatio: {
					type: "string",
					description: "画幅比例：16:9、9:16、1:1，默认 16:9",
					optional: true,
				},
				styleGuide: {
					type: "string",
					description:
						"可选风格或品牌约束。只有用户明确给出、项目已有品牌上下文，或上层 Agent 判断必须确认时才提供。",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description:
						"插入时间线的开始时间。省略时会分析现有 MG/字幕/播放头并自动排队",
					optional: true,
				},
				transparentBackground: {
					type: "boolean",
					description:
						"是否生成透明背景 MG，默认 true。用于叠加到视频素材上；只有用户明确要完整背景时设为 false。",
					optional: true,
				},
				insertToTimeline: {
					type: "boolean",
					description: "是否自动插入时间线，默认 true",
					optional: true,
				},
			},
			mutating: true,
			// Tool handlers use the MCP runtime signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const prompt = requireStringParam(params, "prompt");
				if (!editor.project.getActiveOrNull()) {
					throw new Error("状态错误：未加载项目，无法保存 Shotlyx MG 资产");
				}
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				if (
					durationSeconds !== undefined &&
					(durationSeconds <= 0 || durationSeconds > 120)
				) {
					throw new Error(
						"类型不匹配：durationSeconds 必须大于 0 且不超过 120",
					);
				}
				const aspectRatio = optionalAspectRatioParam(params) ?? "16:9";
				const styleGuide = optionalStringParam(params, "styleGuide");
				const transparentBackground =
					optionalBooleanParam(params, "transparentBackground") ?? true;
				const insertToTimeline =
					optionalBooleanParam(params, "insertToTimeline") ?? true;
				if (insertToTimeline && !editor.scenes.getActiveSceneOrNull()) {
					throw new Error("状态错误：未加载场景，无法插入 Shotlyx MG 动画");
				}
				const placementState = insertToTimeline
					? createShotlyxMGTimelinePlacementState({ editor, params })
					: undefined;
				const startTime =
					placementState?.nextStartTime ?? getStartTime({ editor, params });

				if (!creativeDeps.generateShotlyxMGComponentFn) {
					const { jobId } = await startShotlyxMGJobViaRoute({
						args: {
							prompt,
							durationSeconds,
							aspectRatio,
							styleGuide,
							transparentBackground,
							abortSignal: context?.signal,
							repairAttempts: 2,
							preferPlainJson: false,
							maxOutputTokens: 8000,
						},
						fetchFn: creativeDeps.fetchFn,
						componentCount: 1,
					});
					emitToolProgress({
						context,
						stage: "started",
						label: "MG 子智能体已启动",
						status: "running",
						current: 0,
						total: 1,
					});
					const jobResult = await followShotlyxMGJobToCompletion({
						editor,
						fetchFn: creativeDeps.fetchFn,
						jobId,
						sourcePrompt: prompt,
						startTime,
						placementState,
						insertToTimeline,
						context,
					});
					const savedComponent = jobResult.saved[0];
					if (!savedComponent) {
						throw new Error(
							"provider_error: Shotlyx MG job completed without components",
						);
					}
					return {
						jobId,
						name: savedComponent.name,
						runtime: "shotlyx-mg-job-v1",
						status: jobResult.status,
						inserted: insertToTimeline,
						startTimeSeconds: Number(startTime) / MEDIA_TIME_TICKS_PER_SECOND,
						componentCount: jobResult.documents.length,
						shotlyxMGAssetId: savedComponent.assetId,
						trackId: savedComponent.trackId,
						elementId: savedComponent.elementId,
						transparentBackground,
					};
				}

				const document = await creativeDeps.generateShotlyxMGComponentFn({
					prompt,
					durationSeconds,
					aspectRatio,
					styleGuide,
					transparentBackground,
					abortSignal: context?.signal,
					repairAttempts: 2,
					preferPlainJson: false,
					maxOutputTokens: 8000,
				});
				const asset = registerShotlyxMGAsset({
					document,
					sourcePrompt: document.sourcePrompt ?? prompt,
				});
				editor.project.upsertShotlyxMGAsset({ asset });

				if (!insertToTimeline) {
					return {
						shotlyxMGAssetId: asset.id,
						name: asset.name,
						runtime: "shotlyx-mg-component-v1",
						inserted: false,
						durationSeconds: asset.document.durationSeconds,
						aspectRatio: asset.document.aspectRatio,
						transparentBackground:
							asset.document.transparentBackground ?? transparentBackground,
						editableProps: asset.document.propsSchema.map((prop) => ({
							key: prop.key,
							label: prop.label,
							type: prop.type,
							role: prop.role,
						})),
						validationReport: {
							status: "passed",
							renderer: "shotlyx-remotion-component-v1",
						},
					};
				}

				const scene = editor.scenes.getActiveSceneOrNull();
				if (!scene) {
					throw new Error("状态错误：未加载场景，无法插入 Shotlyx MG 动画");
				}
				const beforeIds = new Set(
					listTimelineElements({ editor }).map((item) => item.element.id),
				);
				if (!placementState) {
					throw new Error("状态错误：无法确定 MG 插入轨道");
				}
				const element = buildNextShotlyxMGTimelineElement({
					asset,
					placement: placementState,
				});

				editor.timeline.insertElement({
					element,
					placement: getShotlyxMGInsertPlacement({ placement: placementState }),
				});

				const inserted = findInsertedElement({ editor, beforeIds });
				return {
					shotlyxMGAssetId: asset.id,
					name: asset.name,
					runtime: "shotlyx-mg-component-v1",
					inserted: true,
					trackId: inserted?.trackId,
					elementId: inserted?.elementId,
					durationSeconds: asset.document.durationSeconds,
					aspectRatio: asset.document.aspectRatio,
					transparentBackground:
						asset.document.transparentBackground ?? transparentBackground,
					editableProps: asset.document.propsSchema.map((prop) => ({
						key: prop.key,
						label: prop.label,
						type: prop.type,
						role: prop.role,
					})),
					validationReport: {
						status: "passed",
						renderer: "shotlyx-remotion-component-v1",
					},
				};
			},
		},
		{
			name: "creative_update_mg_animation",
			description:
				"修改已插入时间线的 MG 动画实例参数。可用于改文字、颜色、字体、数值，不需要重新生成资源。",
			parameters: {
				trackId: {
					type: "string",
					description: "MG 动画所在轨道 ID。可省略并使用当前选中元素",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "MG 动画元素 ID。可省略并使用当前选中元素",
					optional: true,
				},
				name: {
					type: "string",
					description: "按名称模糊匹配 MG 动画",
					optional: true,
				},
				props: {
					type: "object",
					description:
						'要修改的参数对象，例如 { "title": "新标题", "accentColor": "#76b900", "opacity": 0.8 }',
					optional: true,
				},
				transparentBackground: {
					type: "boolean",
					description:
						"是否把这个时间线实例的背景切为透明。true 会把可编辑背景色 prop 设置为 transparent；false 会恢复为非透明背景色。",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, element } = resolveMGElementFromParams({
					editor,
					params,
				});
				if (element.type !== "graphic") {
					throw new Error("类型不匹配：目标片段不是 graphic/MG 动画");
				}
				if (isShotlyxMGDefinitionId({ definitionId: element.definitionId })) {
					const asset = requireShotlyxMGAssetForElement({ editor, element });
					const transparentBackground = optionalBooleanParam(
						params,
						"transparentBackground",
					);
					const parsedProps = requireShotlyxMGUpdatePropsObject({
						asset,
						value: params.props,
					});
					if (
						params.props === undefined &&
						transparentBackground === undefined
					) {
						throw new Error("参数缺失：请提供 props 或 transparentBackground");
					}
					const backgroundUpdate = buildShotlyxMGBackgroundPropUpdates({
						asset,
						transparentBackground,
						currentProps: {
							...asset.document.defaultProps,
							...element.params,
						},
					});
					const props = mergeTransparentBackgroundProps({
						props: parsedProps.props,
						backgroundProps: backgroundUpdate.props,
						transparentBackground,
					});
					const instanceParams = parsedProps.instanceParams;
					editor.timeline.updateElements({
						updates: [
							{
								trackId,
								elementId: element.id,
								patch: {
									// Shotlyx table props are valid runtime values even though
									// the generic ParamValues type only models primitive controls.
									// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
									params: {
										...element.params,
										...props,
										...instanceParams,
									} as unknown as ParamValues,
								},
							},
						],
					});
					return {
						updated: true,
						trackId,
						elementId: element.id,
						definitionId: element.definitionId,
						motionGraphicAssetId: element.motionGraphicAssetId,
						props,
						instanceParams,
						transparentBackground,
						backgroundPropKeys: backgroundUpdate.backgroundPropKeys,
						editableProps: getShotlyxMGEditableProps({ asset }),
						renderer: "shotlyx-remotion-component-v1",
					};
				}
				const definition = getMGDefinition({
					definitionId: element.definitionId,
				});
				if (definition.category !== "motion-graphic") {
					throw new Error("类型不匹配：目标 graphic 不是 MG 动画");
				}
				const props = requireParamValuesObject(params.props);
				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId: element.id,
							patch: {
								params: props,
							},
						},
					],
				});
				return {
					updated: true,
					trackId,
					elementId: element.id,
					definitionId: element.definitionId,
					motionGraphicAssetId: element.motionGraphicAssetId,
					props,
				};
			},
		},
		{
			name: "creative_update_mg_asset",
			description:
				"修改资源库中的项目级 MG 预制件本体。会同步更新所有引用该资源的时间线实例基础参数。",
			parameters: {
				motionGraphicAssetId: {
					type: "string",
					description: "项目级 MG 资源 ID。可省略并通过当前选中实例推断",
					optional: true,
				},
				assetName: {
					type: "string",
					description: "按资源名称模糊匹配 MG 资源",
					optional: true,
				},
				trackId: {
					type: "string",
					description: "引用该资源的时间线实例轨道 ID",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "引用该资源的时间线实例元素 ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "按时间线实例名称模糊匹配",
					optional: true,
				},
				newName: {
					type: "string",
					description: "新的 MG 资源名称",
					optional: true,
				},
				durationSeconds: {
					type: "number",
					description: "新的 MG 资源时长秒数",
					optional: true,
				},
				props: {
					type: "object",
					description:
						'要修改的资源基础参数对象，例如 { "title": "新标题", "accentColor": "#76b900" }',
					optional: true,
				},
				transparentBackground: {
					type: "boolean",
					description:
						"是否把这个 MG 资源本体的背景切为透明。true 会把可编辑背景色 prop 设置为 transparent；false 会恢复为非透明背景色。",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const shotlyxAsset = resolveShotlyxMGAssetFromParams({
					editor,
					params,
				});
				if (shotlyxAsset) {
					const transparentBackground = optionalBooleanParam(
						params,
						"transparentBackground",
					);
					const requestedProps =
						params.props === undefined
							? {}
							: requireShotlyxMGPropsObject({
									asset: shotlyxAsset,
									value: params.props,
								});
					const backgroundUpdate = buildShotlyxMGBackgroundPropUpdates({
						asset: shotlyxAsset,
						transparentBackground,
						currentProps: shotlyxAsset.document.defaultProps,
					});
					const props = mergeTransparentBackgroundProps({
						props: requestedProps,
						backgroundProps: backgroundUpdate.props,
						transparentBackground,
					});
					const durationSeconds = optionalNumberParam(
						params,
						"durationSeconds",
					);
					if (
						durationSeconds !== undefined &&
						(durationSeconds <= 0 || durationSeconds > 120)
					) {
						throw new Error(
							"类型不匹配：durationSeconds 必须大于 0 且不超过 120",
						);
					}
					const newName = optionalStringParam(params, "newName");
					const nextName = newName?.trim() || shotlyxAsset.name;
					const nextDuration =
						durationSeconds ?? shotlyxAsset.document.durationSeconds;
					const nextTransparentBackground =
						transparentBackground ??
						shotlyxAsset.document.transparentBackground;
					const nextDefaultProps = {
						...shotlyxAsset.document.defaultProps,
						...props,
					};
					if (!isShotlyxRemotionMGAsset(shotlyxAsset)) {
						throw new Error(
							"状态错误：旧版 MG 生成入口已移除，请重新生成 Remotion MG 资产后再编辑",
						);
					}
					const updatedAt = new Date().toISOString();
					const nextAsset: ShotlyxMGAsset = {
						...shotlyxAsset,
						name: nextName,
						document: {
							...shotlyxAsset.document,
							name: nextName,
							durationSeconds: nextDuration,
							transparentBackground: nextTransparentBackground,
							defaultProps: nextDefaultProps,
							manifest: shotlyxAsset.document.manifest
								? {
										...shotlyxAsset.document.manifest,
										name: nextName,
										durationSeconds: nextDuration,
										transparentBackground: nextTransparentBackground,
										durationInFrames: Math.round(
											nextDuration * shotlyxAsset.document.fps,
										),
									}
								: undefined,
						},
						updatedAt,
					};
					editor.project.upsertShotlyxMGAsset({ asset: nextAsset });
					return {
						updated: true,
						...buildShotlyxMGSchemaResult({ asset: nextAsset }),
						props,
						transparentBackground:
							nextAsset.document.transparentBackground ?? false,
						backgroundPropKeys: backgroundUpdate.backgroundPropKeys,
					};
				}

				const asset = resolveMGAssetFromParams({ editor, params });
				const definition = getMGDefinition({
					definitionId: asset.definitionId,
				});
				const props =
					params.props === undefined
						? {}
						: requireParamValuesObject(params.props);
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				if (
					durationSeconds !== undefined &&
					(durationSeconds <= 0 || durationSeconds > 120)
				) {
					throw new Error(
						"类型不匹配：durationSeconds 必须大于 0 且不超过 120",
					);
				}
				const newName = optionalStringParam(params, "newName");
				const nextParams = {
					...asset.params,
					...props,
				};
				const now = new Date().toISOString();
				const nextAsset = {
					...asset,
					name: newName?.trim() || asset.name,
					duration:
						durationSeconds === undefined
							? asset.duration
							: mediaTimeFromSecondsForCreative({
									seconds: durationSeconds,
								}),
					params: nextParams,
					manifest: buildMotionGraphicManifest({
						definition,
						kind: asset.kind,
						params: nextParams,
						sourcePrompt: asset.sourcePrompt,
						generatedAt: asset.manifest?.generatedAt ?? asset.createdAt,
						updatedAt: now,
					}),
					updatedAt: now,
				};
				editor.project.upsertMotionGraphicAsset({ asset: nextAsset });
				return {
					updated: true,
					motionGraphicAssetId: nextAsset.id,
					name: nextAsset.name,
					definitionId: nextAsset.definitionId,
					durationSeconds:
						durationSeconds ?? nextAsset.duration / MEDIA_TIME_TICKS_PER_SECOND,
					props,
					manifest: nextAsset.manifest,
				};
			},
		},
		{
			name: "creative_get_mg_asset_schema",
			description:
				"查看资源库中项目级 MG 预制件的可编辑 manifest/schema，用于按资源本体继续修改。",
			parameters: {
				motionGraphicAssetId: {
					type: "string",
					description: "项目级 MG 资源 ID。可省略并通过当前选中实例推断",
					optional: true,
				},
				assetName: {
					type: "string",
					description: "按资源名称模糊匹配 MG 资源",
					optional: true,
				},
				trackId: {
					type: "string",
					description: "引用该资源的时间线实例轨道 ID",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "引用该资源的时间线实例元素 ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "按时间线实例名称模糊匹配并推断资源",
					optional: true,
				},
			},
			handler: (params) => {
				const shotlyxAsset = resolveShotlyxMGAssetFromParams({
					editor,
					params,
				});
				if (shotlyxAsset) {
					return buildShotlyxMGSchemaResult({ asset: shotlyxAsset });
				}

				const asset = resolveMGAssetFromParams({ editor, params });
				const definition = getMGDefinition({
					definitionId: asset.definitionId,
				});
				const manifest =
					asset.manifest ??
					buildMotionGraphicManifest({
						definition,
						kind: asset.kind,
						params: asset.params,
						sourcePrompt: asset.sourcePrompt,
						generatedAt: asset.createdAt,
						updatedAt: asset.updatedAt,
					});
				return {
					motionGraphicAssetId: asset.id,
					name: asset.name,
					definitionId: asset.definitionId,
					kind: asset.kind,
					durationSeconds: asset.duration / MEDIA_TIME_TICKS_PER_SECOND,
					params: asset.params,
					manifest,
				};
			},
		},
		{
			name: "creative_get_mg_animation_schema",
			description:
				"查看已选中或指定 MG 动画的可编辑参数 schema，帮助后续精确修改。",
			parameters: {
				trackId: {
					type: "string",
					description: "MG 动画所在轨道 ID。可省略并使用当前选中元素",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "MG 动画元素 ID。可省略并使用当前选中元素",
					optional: true,
				},
				name: {
					type: "string",
					description: "按名称模糊匹配 MG 动画",
					optional: true,
				},
			},
			handler: (params) => {
				const { trackId, element } = resolveMGElementFromParams({
					editor,
					params,
				});
				if (element.type !== "graphic") {
					throw new Error("类型不匹配：目标片段不是 graphic/MG 动画");
				}
				if (isShotlyxMGDefinitionId({ definitionId: element.definitionId })) {
					const asset = requireShotlyxMGAssetForElement({ editor, element });
					const resolvedProps = { ...asset.document.defaultProps };
					for (const prop of asset.document.propsSchema) {
						const value = element.params[prop.key];
						if (isShotlyxMGPropValue(value)) {
							resolvedProps[prop.key] = value;
						}
					}
					return {
						trackId,
						elementId: element.id,
						...buildShotlyxMGSchemaResult({ asset }),
						instanceParams: getShotlyxMGInstanceParams({ element }),
						editableInstanceParams: SHOTLYX_MG_EDITABLE_INSTANCE_PARAMS,
						params: resolvedProps,
					};
				}
				const definition = getMGDefinition({
					definitionId: element.definitionId,
				});
				if (definition.category !== "motion-graphic") {
					throw new Error("类型不匹配：目标 graphic 不是 MG 动画");
				}
				const asset = element.motionGraphicAssetId
					? editor.project.getMotionGraphicAsset({
							id: element.motionGraphicAssetId,
						})
					: null;
				const resolvedParams = {
					...(element.motionGraphicBaseParams ?? {}),
					...element.params,
				};
				const manifest =
					asset?.manifest ??
					buildMotionGraphicManifest({
						definition,
						kind: asset?.kind,
						params: asset?.params ?? resolvedParams,
						sourcePrompt: asset?.sourcePrompt,
						generatedAt: asset?.createdAt,
						updatedAt: asset?.updatedAt,
					});
				return {
					trackId,
					elementId: element.id,
					motionGraphicAssetId: element.motionGraphicAssetId,
					definitionId: element.definitionId,
					name: element.name,
					baseParams: element.motionGraphicBaseParams ?? null,
					instanceParams: element.params,
					params: resolvedParams,
					manifest,
					editableParams: definition.params.map((param) => ({
						key: param.key,
						label: param.label,
						type: param.type,
						default: param.default,
					})),
				};
			},
		},
		{
			name: "creative_import_asset",
			description: "将 creative asset candidate 导入 Shotlyx 媒体库",
			parameters: {
				assetId: {
					type: "string",
					description: "creative asset ID",
				},
			},
			mutating: true,
			handler: async (params) => {
				const assetId = requireStringParam(params, "assetId");
				const asset = getCreativeAsset({ id: assetId });
				if (!asset) {
					throw new Error(`资源不存在：找不到 creative asset "${assetId}"`);
				}

				const imported = await importCreativeAsset({
					editor,
					asset,
					deps: creativeDeps,
				});
				asset.mediaAssetId = imported.mediaAssetId;
				asset.name = imported.name;
				asset.sizeBytes = imported.sizeBytes;
				asset.width = imported.width ?? asset.width;
				asset.height = imported.height ?? asset.height;
				asset.previewUrl = imported.previewUrl ?? asset.previewUrl;
				asset.thumbnailUrl = imported.thumbnailUrl ?? asset.thumbnailUrl;
				return imported;
			},
		},
	];
}
