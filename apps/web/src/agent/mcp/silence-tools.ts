import { useAgentContextStore } from "@/agent/context/store";
import type { EditorCore } from "@/core";
import { DEFAULT_SILENCE_DETECTION_OPTIONS } from "@/silence/constants";
import type {
	SilenceAnalysisResult,
	SilenceCutTarget,
	SilenceDetectionOptions,
} from "@/silence/types";
import type {
	ElementRef,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalStringParam,
} from "./validation";

const DEFAULT_SCOPE = "auto";
const MAX_PLAN_AGE_MS = 30 * 60 * 1000;
const MAX_STORED_PLANS = 12;
const MAX_TARGETS_FOR_MODEL = 12;
const MAX_SEGMENTS_PER_TARGET_FOR_MODEL = 8;

type SilenceScope = "auto" | "selection" | "timeline" | "element";

interface AnalyzeSilenceForElementsFnInput {
	elements: Array<{ track: TimelineTrack; element: TimelineElement }>;
	mediaAssets: ReturnType<EditorCore["media"]["getAssets"]>;
	options: SilenceDetectionOptions;
}

type AnalyzeSilenceForElementsFn = (
	input: AnalyzeSilenceForElementsFnInput,
) => Promise<SilenceAnalysisResult>;

interface StoredSilencePlan {
	id: string;
	createdAt: number;
	targets: SilenceCutTarget[];
	options: SilenceDetectionOptions;
	analyzedClipCount: number;
	segmentCount: number;
	totalSilenceSeconds: number;
	summaryTargets: ReturnType<typeof summarizeTargetsForModel>;
}

interface BuildSilenceToolsOptions {
	editor: EditorCore;
	deps?: {
		analyzeSilenceForElements?: AnalyzeSilenceForElementsFn;
		now?: () => number;
		createId?: () => string;
	};
}

const storedPlans = new Map<string, StoredSilencePlan>();
let latestPlanId: string | null = null;

export function buildSilenceTools({
	editor,
	deps = {},
}: BuildSilenceToolsOptions): Tool[] {
	const analyzeFn =
		deps.analyzeSilenceForElements ?? defaultAnalyzeSilenceForElements;
	const now = deps.now ?? (() => Date.now());
	const createId = deps.createId ?? createPlanId;

	return [
		{
			name: "silence_analyze_timeline",
			description:
				"分析当前引用、选中片段或整条时间线里的视频/音频静音段，生成可确认的剪辑计划；不会修改时间线。剪静音前优先调用这个工具。",
			parameters: {
				scope: {
					type: "string",
					description:
						"分析范围：auto、selection、timeline、element。默认 auto：优先 Agent 引用，其次选中片段，最后整条时间线。",
					optional: true,
				},
				trackId: {
					type: "string",
					description: "当 scope 为 element 时的轨道 ID，可与 elementId 一起指定单个片段。",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "当 scope 为 element 时的片段 ID。",
					optional: true,
				},
				elementRefs: {
					type: "array",
					description:
						"可选的片段引用数组，每项为 { trackId, elementId }。提供后优先于 scope。",
					items: {
						type: "object",
						description: "片段引用",
						properties: {
							trackId: { type: "string", description: "轨道 ID" },
							elementId: { type: "string", description: "片段 ID" },
						},
					},
					optional: true,
				},
				thresholdDb: {
					type: "number",
					description: "静音阈值 dB，默认 -40。数值越高越容易判定为静音。",
					optional: true,
				},
				minSilenceMs: {
					type: "number",
					description: "最短静音时长毫秒，默认 350。",
					optional: true,
				},
				paddingMs: {
					type: "number",
					description: "删除静音时保留的前后呼吸毫秒，默认 100。",
					optional: true,
				},
				mergeGapMs: {
					type: "number",
					description: "相邻静音段合并间隔毫秒，默认 120。",
					optional: true,
				},
				windowMs: {
					type: "number",
					description: "分析窗口毫秒，默认 20。通常不需要修改。",
					optional: true,
				},
			},
			// Tool handlers use the MCP Tool interface's positional signature.
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				prunePlans({ now: now() });
				const options = resolveOptions({ params });
				const elements = resolveAnalysisElements({ editor, params });

				context?.onProgress?.({
					stage: "silence-analysis",
					label: "正在分析静音片段",
					status: "running",
					detail: `${elements.length} clips`,
				});

				const analysis = await analyzeFn({
					elements,
					mediaAssets: editor.media.getAssets(),
					options,
				});
				const segmentCount = countSegments(analysis);
				const totalSilenceSeconds = mediaTimeToSeconds({
					time: analysis.totalSilenceDuration,
				});
				const targets = analysis.targets.map((target) => ({
					trackId: target.trackId,
					elementId: target.elementId,
					ranges: target.segments.map((segment) => ({
						startTime: segment.startTime,
						endTime: segment.endTime,
					})),
				}));
				const plan = storePlan({
					id: createId(),
					createdAt: now(),
					targets,
					options,
					analyzedClipCount: elements.length,
					segmentCount,
					totalSilenceSeconds,
					summaryTargets: summarizeTargetsForModel({ analysis }),
				});

				context?.onProgress?.({
					stage: "silence-analysis",
					label: "静音分析完成",
					status: "success",
					detail: `${segmentCount} segments`,
				});

				return {
					planId: plan.id,
					analyzedClipCount: plan.analyzedClipCount,
					targetCount: plan.targets.length,
					segmentCount: plan.segmentCount,
					totalSilenceSeconds: plan.totalSilenceSeconds,
					options: plan.options,
					targets: plan.summaryTargets,
					truncated:
						analysis.targets.length > MAX_TARGETS_FOR_MODEL ||
						analysis.targets.some(
							(target) =>
								target.segments.length > MAX_SEGMENTS_PER_TARGET_FOR_MODEL,
						),
					message:
						segmentCount > 0
							? `检测到 ${segmentCount} 段静音，预计删除 ${totalSilenceSeconds.toFixed(2)} 秒。用户确认后调用 silence_apply_cut_plan，传 planId="${plan.id}"。`
							: "没有检测到符合条件的静音片段，不需要应用剪辑。",
				};
			},
		},
		{
			name: "silence_apply_cut_plan",
			description:
				"应用 silence_analyze_timeline 生成的静音剪辑计划，批量删除静音段并左移后续内容；会修改时间线，必须在用户确认后调用。",
			parameters: {
				planId: {
					type: "string",
					description:
						"silence_analyze_timeline 返回的 planId。省略时使用最近一次静音分析计划。",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				prunePlans({ now: now() });
				const requestedPlanId = optionalPlanIdParam({ params });
				const plan = resolvePlan({
					planId: requestedPlanId,
					now: now(),
				});

				if (plan.segmentCount === 0 || plan.targets.length === 0) {
					return {
						applied: false,
						planId: plan.id,
						message: "这份计划没有可删除的静音片段。",
					};
				}

				const didApply = editor.timeline.applySilenceCutPlan({
					targets: plan.targets,
				});

				return {
					applied: didApply,
					planId: plan.id,
					targetCount: plan.targets.length,
					segmentCount: plan.segmentCount,
					removedSeconds: plan.totalSilenceSeconds,
					message: didApply
						? `已删除 ${plan.segmentCount} 段静音，时间线缩短约 ${plan.totalSilenceSeconds.toFixed(2)} 秒。`
						: "没有可应用的时间线变化。",
				};
			},
		},
	];
}

function createPlanId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `silence_${crypto.randomUUID()}`;
	}
	return `silence_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function defaultAnalyzeSilenceForElements(
	input: AnalyzeSilenceForElementsFnInput,
): Promise<SilenceAnalysisResult> {
	const { analyzeSilenceForElements } = await import("@/silence/analyze");
	return analyzeSilenceForElements(input);
}

function resolveOptions({
	params,
}: {
	params: Record<string, unknown>;
}): SilenceDetectionOptions {
	const options = {
		...DEFAULT_SILENCE_DETECTION_OPTIONS,
		thresholdDb:
			optionalNumberParam(params, "thresholdDb") ??
			DEFAULT_SILENCE_DETECTION_OPTIONS.thresholdDb,
		minSilenceMs:
			optionalNumberParam(params, "minSilenceMs") ??
			DEFAULT_SILENCE_DETECTION_OPTIONS.minSilenceMs,
		paddingMs:
			optionalNumberParam(params, "paddingMs") ??
			DEFAULT_SILENCE_DETECTION_OPTIONS.paddingMs,
		mergeGapMs:
			optionalNumberParam(params, "mergeGapMs") ??
			DEFAULT_SILENCE_DETECTION_OPTIONS.mergeGapMs,
		windowMs:
			optionalNumberParam(params, "windowMs") ??
			DEFAULT_SILENCE_DETECTION_OPTIONS.windowMs,
	};

	if (options.thresholdDb >= 0 || options.thresholdDb < -120) {
		throw new Error("类型不匹配：thresholdDb 应在 -120 到 0 之间");
	}
	if (options.minSilenceMs <= 0) {
		throw new Error("类型不匹配：minSilenceMs 必须大于 0");
	}
	if (options.paddingMs < 0 || options.mergeGapMs < 0) {
		throw new Error("类型不匹配：paddingMs 和 mergeGapMs 不能小于 0");
	}
	if (options.windowMs <= 0 || options.windowMs > 500) {
		throw new Error("类型不匹配：windowMs 应在 0 到 500 毫秒之间");
	}

	return options;
}

function optionalPlanIdParam({
	params,
}: {
	params: Record<string, unknown>;
}): string | undefined {
	const value = params.planId;
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		throw new Error(`类型不匹配："planId" 必须为字符串`);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function resolveScope({ params }: { params: Record<string, unknown> }): SilenceScope {
	const scope = optionalStringParam(params, "scope") ?? DEFAULT_SCOPE;
	if (
		scope !== "auto" &&
		scope !== "selection" &&
		scope !== "timeline" &&
		scope !== "element"
	) {
		throw new Error(
			`类型不匹配：scope 必须为 auto、selection、timeline、element 之一`,
		);
	}
	return scope;
}

function resolveAnalysisElements({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): Array<{ track: TimelineTrack; element: TimelineElement }> {
	const explicitRefs = parseElementRefs(params.elementRefs);
	if (explicitRefs && explicitRefs.length > 0) {
		return requireAnalyzableElements({
			editor,
			refs: explicitRefs,
			errorPrefix: "elementRefs",
		});
	}

	const trackId = optionalStringParam(params, "trackId");
	const elementId = optionalStringParam(params, "elementId");
	if (trackId || elementId) {
		if (!trackId || !elementId) {
			throw new Error("参数缺失：trackId 和 elementId 必须一起提供");
		}
		return requireAnalyzableElements({
			editor,
			refs: [{ trackId, elementId }],
			errorPrefix: "element",
		});
	}

	const scope = resolveScope({ params });
	if (scope === "element") {
		throw new Error("参数缺失：scope=element 时必须提供 trackId 和 elementId");
	}

	const activeScene = editor.scenes.getActiveSceneOrNull();
	if (!activeScene) {
		throw new Error("状态错误：未加载场景，无法分析静音");
	}

	if (scope === "timeline") {
		return collectAnalyzableElements({ tracks: activeScene.tracks });
	}

	const agentRefs = resolveAgentTimelineReferences();
	if (scope === "auto" && agentRefs.length > 0) {
		return requireAnalyzableElements({
			editor,
			refs: agentRefs,
			errorPrefix: "Agent 引用",
		});
	}

	const selected = editor.selection.getSelectedElements();
	if (selected.length > 0) {
		return requireAnalyzableElements({
			editor,
			refs: selected,
			errorPrefix: "selection",
		});
	}

	if (scope === "selection") {
		throw new Error("状态错误：当前没有选中可分析的片段");
	}

	return collectAnalyzableElements({ tracks: activeScene.tracks });
}

function parseElementRefs(value: unknown): ElementRef[] | null {
	if (value === undefined) return null;
	if (!Array.isArray(value)) {
		throw new Error("类型不匹配：elementRefs 必须为数组");
	}
	const refs: ElementRef[] = [];
	for (const [index, item] of value.entries()) {
		if (!isRecord(item)) {
			throw new Error(`类型不匹配：elementRefs[${index}] 必须为对象`);
		}
		if (
			typeof item.trackId !== "string" ||
			typeof item.elementId !== "string"
		) {
			throw new Error(
				`类型不匹配：elementRefs[${index}] 必须包含 string trackId 和 elementId`,
			);
		}
		refs.push({
			trackId: item.trackId,
			elementId: item.elementId,
		});
	}
	return refs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveAgentTimelineReferences(): ElementRef[] {
	const state = useAgentContextStore.getState();
	const primary = state.primaryReferenceId
		? state.draftReferences.find((item) => item.id === state.primaryReferenceId)
		: null;
	if (primary?.kind === "timeline-element") {
		return [
			{
				trackId: primary.payload.trackId,
				elementId: primary.payload.elementId,
			},
		];
	}
	return state.draftReferences
		.filter((item) => item.kind === "timeline-element")
		.map((item) => ({
			trackId: item.payload.trackId,
			elementId: item.payload.elementId,
		}));
}

function requireAnalyzableElements({
	editor,
	refs,
	errorPrefix,
}: {
	editor: EditorCore;
	refs: ElementRef[];
	errorPrefix: string;
}): Array<{ track: TimelineTrack; element: TimelineElement }> {
	const elements = editor.timeline
		.getElementsWithTracks({ elements: refs })
		.filter(({ element }) => canAnalyzeElement(element));
	if (elements.length === 0) {
		throw new Error(
			`状态错误：${errorPrefix} 没有可分析的音频或视频片段`,
		);
	}
	return elements;
}

function collectAnalyzableElements({
	tracks,
}: {
	tracks: SceneTracks;
}): Array<{ track: TimelineTrack; element: TimelineElement }> {
	const allTracks = [tracks.main, ...tracks.overlay, ...tracks.audio];
	const elements = allTracks.flatMap((track) =>
		track.elements
			.filter((element) => canAnalyzeElement(element))
			.map((element) => ({ track, element })),
	);
	if (elements.length === 0) {
		throw new Error("状态错误：当前时间线没有可分析的音频或视频片段");
	}
	return elements;
}

function canAnalyzeElement(element: TimelineElement): boolean {
	return (
		(element.type === "video" || element.type === "audio") &&
		"mediaId" in element &&
		typeof element.mediaId === "string"
	);
}

function countSegments(analysis: SilenceAnalysisResult): number {
	return analysis.targets.reduce(
		(total, target) => total + target.segments.length,
		0,
	);
}

function summarizeTargetsForModel({
	analysis,
}: {
	analysis: SilenceAnalysisResult;
}) {
	return analysis.targets.slice(0, MAX_TARGETS_FOR_MODEL).map((target) => ({
		trackId: target.trackId,
		elementId: target.elementId,
		elementName: target.elementName,
		segmentCount: target.segments.length,
		segments: target.segments
			.slice(0, MAX_SEGMENTS_PER_TARGET_FOR_MODEL)
			.map((segment) => segmentToSeconds(segment)),
	}));
}

function segmentToSeconds({
	startTime,
	endTime,
}: {
	startTime: MediaTime;
	endTime: MediaTime;
}) {
	const startSeconds = mediaTimeToSeconds({ time: startTime });
	const endSeconds = mediaTimeToSeconds({ time: endTime });
	return {
		startSeconds,
		endSeconds,
		durationSeconds: endSeconds - startSeconds,
	};
}

function mediaTimeToSeconds({ time }: { time: MediaTime }): number {
	return time / MEDIA_TIME_TICKS_PER_SECOND;
}

function storePlan(plan: StoredSilencePlan): StoredSilencePlan {
	storedPlans.set(plan.id, plan);
	latestPlanId = plan.id;

	while (storedPlans.size > MAX_STORED_PLANS) {
		const oldest = storedPlans.keys().next().value;
		if (!oldest) break;
		storedPlans.delete(oldest);
	}

	return plan;
}

function resolvePlan({
	planId,
	now,
}: {
	planId?: string;
	now: number;
}): StoredSilencePlan {
	const id = planId ?? latestPlanId;
	if (!id) {
		throw new Error("状态错误：请先调用 silence_analyze_timeline 生成剪辑计划");
	}
	const plan = storedPlans.get(id);
	if (!plan) {
		throw new Error(`状态错误：找不到静音剪辑计划 "${id}"，请重新分析`);
	}
	if (now - plan.createdAt > MAX_PLAN_AGE_MS) {
		storedPlans.delete(id);
		if (latestPlanId === id) latestPlanId = null;
		throw new Error("状态错误：静音剪辑计划已过期，请重新分析");
	}
	return plan;
}

function prunePlans({ now }: { now: number }): void {
	for (const [id, plan] of storedPlans) {
		if (now - plan.createdAt > MAX_PLAN_AGE_MS) {
			storedPlans.delete(id);
			if (latestPlanId === id) latestPlanId = null;
		}
	}
}
