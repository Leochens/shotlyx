import type { EditorCore } from "@/core";
import type { SubtitleElement, TimelineTrack } from "@/timeline";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { Tool } from "./types";
import { optionalNumberParam, optionalStringParam } from "./validation";

const MAX_REVIEW_AGE_MS = 30 * 60 * 1000;
const MAX_STORED_REVIEWS = 8;
const DEFAULT_MERGE_GAP_SECONDS = 0.25;
const DEFAULT_PADDING_SECONDS = 0;

const FILLER_WORDS = new Set([
	"嗯",
	"嗯嗯",
	"啊",
	"呃",
	"额",
	"呃呃",
	"那个",
	"这个",
	"就是",
	"然后呢",
	"对吧",
]);

export type RoughCutReason = "filler" | "repeat" | "manual";

export interface RoughCutReviewToken {
	id: string;
	text: string;
	cueIndex: number;
	tokenIndex: number;
	startTimeSeconds: number;
	endTimeSeconds: number;
	timelineStartSeconds: number;
	timelineEndSeconds: number;
	selected: boolean;
	reason?: RoughCutReason;
	candidateIds: string[];
}

export interface RoughCutReviewCandidate {
	id: string;
	reason: Exclude<RoughCutReason, "manual">;
	text: string;
	startTimeSeconds: number;
	endTimeSeconds: number;
	timelineStartSeconds: number;
	timelineEndSeconds: number;
	tokenIds: string[];
	selected: boolean;
	confidence: number;
}

export interface RoughCutReviewResult {
	reviewId: string;
	openReview: true;
	subtitleTrackId: string;
	subtitleElementId: string;
	tokenCount: number;
	selectedTokenCount: number;
	candidateCount: number;
	estimatedRemovedSeconds: number;
	tokens: RoughCutReviewToken[];
	candidates: RoughCutReviewCandidate[];
	message: string;
}

export interface RoughCutTokenTextEdit {
	tokenId: string;
	text: string;
}

interface StoredRoughCutReview extends RoughCutReviewResult {
	createdAt: number;
}

interface BuildRoughCutToolsOptions {
	editor: EditorCore;
	deps?: {
		now?: () => number;
		createId?: () => string;
	};
}

interface SubtitleLayerRef {
	track: TimelineTrack;
	element: SubtitleElement;
}

interface CutRangeSeconds {
	startSeconds: number;
	endSeconds: number;
}

const storedReviews = new Map<string, StoredRoughCutReview>();
let latestReviewId: string | null = null;

export function buildRoughCutTools({
	editor,
	deps = {},
}: BuildRoughCutToolsOptions): Tool[] {
	const now = deps.now ?? (() => Date.now());
	const createId = deps.createId ?? createReviewId;

	return [
		{
			name: "rough_cut_create_review",
			description:
				"基于当前逐字字幕层生成 AI 粗剪审核单，标记口气词、气声词和重复片段；只生成可交互审核，不修改时间线。",
			parameters: {
				subtitleTrackId: {
					type: "string",
					description: "可选字幕轨道 ID；省略时自动选择当前时间线中的字幕层。",
					optional: true,
				},
				subtitleElementId: {
					type: "string",
					description: "可选字幕元素 ID；需要和 subtitleTrackId 一起使用。",
					optional: true,
				},
			},
			handler: (params) => {
				pruneReviews({ now: now() });
				const subtitleRef = resolveSubtitleLayer({ editor, params });
				const review = buildReviewFromSubtitle({
					reviewId: createId(),
					createdAt: now(),
					subtitleRef,
				});
				storeReview(review);
				return stripStoredFields(review);
			},
		},
		{
			name: "rough_cut_apply_review",
			description:
				"应用 rough_cut_create_review 生成并经用户确认的粗剪审核单，将选中的字词时间段转成时间线 ripple cut；会修改时间线。",
			parameters: {
				reviewId: {
					type: "string",
					description: "rough_cut_create_review 返回的 reviewId；省略时使用最近一次审核单。",
					optional: true,
				},
				selectedTokenIds: {
					type: "array",
					description:
						"用户最终选择删除的 token id 数组；省略时使用审核单初始建议。",
					items: { type: "string", description: "Token ID" },
					optional: true,
				},
				paddingMs: {
					type: "number",
					description: "每个删除区间额外扩展的毫秒数，默认 0。",
					optional: true,
				},
				tokenTextEdits: {
					type: "array",
					description:
						"用户在审核弹窗中修正的 token 文本数组：{ tokenId, text }。",
					items: {
						type: "object",
						description: "Token text edit",
					},
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				pruneReviews({ now: now() });
				const review = resolveReview({
					reviewId: optionalReviewIdParam({ params }),
					now: now(),
				});
				const selectedTokenIds =
					parseSelectedTokenIds(params.selectedTokenIds) ??
					review.tokens
						.filter((token) => token.selected)
						.map((token) => token.id);
				const selectedTokens = review.tokens.filter((token) =>
					selectedTokenIds.includes(token.id),
				);
				const tokenTextEdits = parseTokenTextEdits(params.tokenTextEdits);
				const editedTokenCount = applyTokenTextEdits({
					editor,
					review,
					tokenTextEdits,
				});
				const paddingSeconds =
					(optionalNumberParam(params, "paddingMs") ?? 0) / 1000;
				const ranges = mergeRanges({
					ranges: selectedTokens.map((token) => ({
						startSeconds: Math.max(
							0,
							token.timelineStartSeconds - paddingSeconds,
						),
						endSeconds: token.timelineEndSeconds + paddingSeconds,
					})),
					mergeGapSeconds: DEFAULT_MERGE_GAP_SECONDS,
				});

				if (ranges.length === 0) {
					return {
						applied: editedTokenCount > 0,
						reviewId: review.reviewId,
						selectedTokenCount: selectedTokens.length,
						editedTokenCount,
						message:
							editedTokenCount > 0
								? `已更新 ${editedTokenCount} 个字幕字词，未剪掉音视频片段。`
								: "没有选中的粗剪 token，未修改时间线。",
					};
				}

				const targets = buildTimelineTargetsForRanges({ editor, ranges });
				if (targets.length === 0) {
					return {
						applied: false,
						reviewId: review.reviewId,
						selectedTokenCount: selectedTokens.length,
						editedTokenCount,
						message: "选中的 token 没有匹配到可剪辑的时间线片段。",
					};
				}

				const didApply = editor.timeline.applySilenceCutPlan({ targets });
				return {
					applied: didApply || editedTokenCount > 0,
					reviewId: review.reviewId,
					selectedTokenCount: selectedTokens.length,
					editedTokenCount,
					rangeCount: ranges.length,
					targetCount: targets.length,
					removedSeconds: ranges.reduce(
						(total, range) => total + (range.endSeconds - range.startSeconds),
						0,
					),
					message: didApply
						? `已按审核结果剪掉 ${selectedTokens.length} 个字词片段。`
						: "没有可应用的时间线变化。",
				};
			},
		},
	];
}

function createReviewId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `rough_cut_${crypto.randomUUID()}`;
	}
	return `rough_cut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveSubtitleLayer({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): SubtitleLayerRef {
	const trackId = optionalStringParam(params, "subtitleTrackId");
	const elementId = optionalStringParam(params, "subtitleElementId");
	if ((trackId && !elementId) || (!trackId && elementId)) {
		throw new Error("参数缺失：subtitleTrackId 和 subtitleElementId 必须一起提供");
	}
	if (trackId && elementId) {
		const track = editor.timeline.getTrackById({ trackId });
		const element = track?.elements.find((item) => item.id === elementId);
		if (!track || !element || element.type !== "subtitle") {
			throw new Error("状态错误：找不到指定的字幕层");
		}
		return { track, element };
	}

	const activeScene = editor.scenes.getActiveSceneOrNull();
	if (!activeScene) {
		throw new Error("状态错误：未加载场景，无法生成粗剪审核");
	}
	const tracks = [activeScene.tracks.main, ...activeScene.tracks.overlay];
	const subtitleLayers = tracks.flatMap((track) =>
		track.elements
			.filter((element): element is SubtitleElement => element.type === "subtitle")
			.map((element) => ({ track, element })),
	);
	const layerWithTokens = subtitleLayers
		.filter(({ element }) =>
			element.cues.some((cue) => (cue.tokens?.length ?? 0) > 0),
		)
		.toSorted(
			(left, right) =>
				countSubtitleTokens(right.element.cues) -
				countSubtitleTokens(left.element.cues),
		)[0];
	if (!layerWithTokens) {
		throw new Error(
			"状态错误：没有找到带逐字/逐词时间的字幕层，请先生成逐字字幕。",
		);
	}
	return layerWithTokens;
}

function buildReviewFromSubtitle({
	reviewId,
	createdAt,
	subtitleRef,
}: {
	reviewId: string;
	createdAt: number;
	subtitleRef: SubtitleLayerRef;
}): StoredRoughCutReview {
	const tokens = flattenSubtitleTokens({
		reviewId,
		element: subtitleRef.element,
	});
	const candidates = buildCandidates({ tokens, cues: subtitleRef.element.cues });
	const selectedTokenIds = new Set(
		candidates
			.filter((candidate) => candidate.selected)
			.flatMap((candidate) => candidate.tokenIds),
	);
	const candidateIdByTokenId = new Map<string, string[]>();
	const reasonByTokenId = new Map<string, RoughCutReason>();
	for (const candidate of candidates) {
		for (const tokenId of candidate.tokenIds) {
			candidateIdByTokenId.set(tokenId, [
				...(candidateIdByTokenId.get(tokenId) ?? []),
				candidate.id,
			]);
			if (candidate.selected) reasonByTokenId.set(tokenId, candidate.reason);
		}
	}
	const annotatedTokens = tokens.map((token) => ({
		...token,
		selected: selectedTokenIds.has(token.id),
		reason: reasonByTokenId.get(token.id),
		candidateIds: candidateIdByTokenId.get(token.id) ?? [],
	}));
	const estimatedRemovedSeconds = mergeRanges({
		ranges: annotatedTokens
			.filter((token) => token.selected)
			.map((token) => ({
				startSeconds: token.timelineStartSeconds,
				endSeconds: token.timelineEndSeconds,
			})),
		mergeGapSeconds: DEFAULT_MERGE_GAP_SECONDS,
	}).reduce((total, range) => total + (range.endSeconds - range.startSeconds), 0);

	return {
		reviewId,
		createdAt,
		openReview: true,
		subtitleTrackId: subtitleRef.track.id,
		subtitleElementId: subtitleRef.element.id,
		tokenCount: annotatedTokens.length,
		selectedTokenCount: annotatedTokens.filter((token) => token.selected).length,
		candidateCount: candidates.length,
		estimatedRemovedSeconds,
		tokens: annotatedTokens,
		candidates,
		message:
			candidates.length > 0
				? `已生成粗剪审核单，初步建议删除 ${annotatedTokens.filter((token) => token.selected).length} 个字词。`
				: "已生成粗剪审核单，暂未发现明显口气词或重复片段。",
	};
}

function flattenSubtitleTokens({
	reviewId,
	element,
}: {
	reviewId: string;
	element: SubtitleElement;
}): RoughCutReviewToken[] {
	return element.cues.flatMap((cue, cueIndex) =>
		(cue.tokens ?? []).map((token, tokenIndex) => {
			const startTimeSeconds = resolveAbsoluteTokenStartTime({ cue, token });
			const endTimeSeconds = startTimeSeconds + token.duration;
			const timelineStartSeconds = subtitleSourceSecondsToTimelineSeconds({
				element,
				sourceSeconds: startTimeSeconds,
			});
			const timelineEndSeconds = subtitleSourceSecondsToTimelineSeconds({
				element,
				sourceSeconds: endTimeSeconds,
			});
			return {
				id: `${reviewId}:c${cueIndex}:t${tokenIndex}`,
				text: token.text,
				cueIndex,
				tokenIndex,
				startTimeSeconds,
				endTimeSeconds,
				timelineStartSeconds,
				timelineEndSeconds,
				selected: false,
				candidateIds: [],
			};
		}),
	);
}

function buildCandidates({
	tokens,
	cues,
}: {
	tokens: RoughCutReviewToken[];
	cues: SubtitleLayerCue[];
}): RoughCutReviewCandidate[] {
	const candidates: RoughCutReviewCandidate[] = [];
	for (const token of tokens) {
		if (!isFillerToken(token.text)) continue;
		candidates.push(buildCandidateFromTokens({
			id: `filler-${token.id}`,
			reason: "filler",
			tokens: [token],
			confidence: 0.86,
		}));
	}

	const cueTokens = groupTokensByCue({ tokens });
	const normalizedCues = cues.map((cue) => normalizeSpokenText(cue.text));
	for (let index = 1; index < normalizedCues.length; index++) {
		const previous = normalizedCues[index - 1] ?? "";
		const current = normalizedCues[index] ?? "";
		if (!isLikelyRepeatedCue({ previous, current })) continue;
		const repeatedTokens = cueTokens.get(index - 1) ?? [];
		if (repeatedTokens.length === 0) continue;
		candidates.push(buildCandidateFromTokens({
			id: `repeat-cue-${index - 1}`,
			reason: "repeat",
			tokens: repeatedTokens,
			confidence: 0.78,
		}));
	}

	return candidates;
}

function buildCandidateFromTokens({
	id,
	reason,
	tokens,
	confidence,
}: {
	id: string;
	reason: Exclude<RoughCutReason, "manual">;
	tokens: RoughCutReviewToken[];
	confidence: number;
}): RoughCutReviewCandidate {
	return {
		id,
		reason,
		text: tokens.map((token) => token.text).join(""),
		startTimeSeconds: Math.min(...tokens.map((token) => token.startTimeSeconds)),
		endTimeSeconds: Math.max(...tokens.map((token) => token.endTimeSeconds)),
		timelineStartSeconds: Math.min(
			...tokens.map((token) => token.timelineStartSeconds),
		),
		timelineEndSeconds: Math.max(
			...tokens.map((token) => token.timelineEndSeconds),
		),
		tokenIds: tokens.map((token) => token.id),
		selected: true,
		confidence,
	};
}

function resolveAbsoluteTokenStartTime({
	cue,
	token,
}: {
	cue: SubtitleLayerCue;
	token: SubtitleToken;
}): number {
	const tokenLooksRelative =
		token.startTime < cue.startTime && token.startTime <= cue.duration + 0.001;
	return tokenLooksRelative ? cue.startTime + token.startTime : token.startTime;
}

function subtitleSourceSecondsToTimelineSeconds({
	element,
	sourceSeconds,
}: {
	element: SubtitleElement;
	sourceSeconds: number;
}): number {
	return (
		(element.startTime - element.trimStart) / MEDIA_TIME_TICKS_PER_SECOND +
		sourceSeconds
	);
}

function isFillerToken(text: string): boolean {
	const normalized = normalizeSpokenText(text);
	return FILLER_WORDS.has(normalized);
}

function normalizeSpokenText(text: string): string {
	return text
		.replace(/[，。！？、,.!?;；:："'“”‘’()[\]【】\s]/g, "")
		.toLowerCase();
}

function isLikelyRepeatedCue({
	previous,
	current,
}: {
	previous: string;
	current: string;
}): boolean {
	if (previous.length < 2 || current.length < 2) return false;
	if (previous === current) return true;
	return previous.length >= 3 && current.startsWith(previous);
}

function groupTokensByCue({
	tokens,
}: {
	tokens: RoughCutReviewToken[];
}): Map<number, RoughCutReviewToken[]> {
	const result = new Map<number, RoughCutReviewToken[]>();
	for (const token of tokens) {
		result.set(token.cueIndex, [...(result.get(token.cueIndex) ?? []), token]);
	}
	return result;
}

function countSubtitleTokens(cues: SubtitleLayerCue[]): number {
	return cues.reduce((total, cue) => total + (cue.tokens?.length ?? 0), 0);
}

function optionalReviewIdParam({
	params,
}: {
	params: Record<string, unknown>;
}): string | undefined {
	const value = params.reviewId;
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		throw new Error(`类型不匹配："reviewId" 必须为字符串`);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseSelectedTokenIds(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error("类型不匹配：selectedTokenIds 必须为数组");
	}
	return value.filter((item): item is string => typeof item === "string");
}

function parseTokenTextEdits(value: unknown): RoughCutTokenTextEdit[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) {
		throw new Error("类型不匹配：tokenTextEdits 必须为数组");
	}
	return value.flatMap((item, index) => {
		if (!isRecord(item)) {
			throw new Error(`类型不匹配：tokenTextEdits[${index}] 必须为对象`);
		}
		if (typeof item.tokenId !== "string") {
			throw new Error(`类型不匹配：tokenTextEdits[${index}].tokenId 必须为字符串`);
		}
		if (typeof item.text !== "string") {
			throw new Error(`类型不匹配：tokenTextEdits[${index}].text 必须为字符串`);
		}
		const text = item.text.trim();
		if (text.length === 0) return [];
		return [{ tokenId: item.tokenId, text }];
	});
}

function applyTokenTextEdits({
	editor,
	review,
	tokenTextEdits,
}: {
	editor: EditorCore;
	review: StoredRoughCutReview;
	tokenTextEdits: RoughCutTokenTextEdit[];
}): number {
	if (tokenTextEdits.length === 0) return 0;
	const subtitleRef = resolveSubtitleLayer({
		editor,
		params: {
			subtitleTrackId: review.subtitleTrackId,
			subtitleElementId: review.subtitleElementId,
		},
	});
	const editsByTokenId = new Map(
		tokenTextEdits.map((edit) => [edit.tokenId, edit.text]),
	);
	let editedTokenCount = 0;
	const nextCues = subtitleRef.element.cues.map((cue, cueIndex) => {
		if (!cue.tokens || cue.tokens.length === 0) return cue;
		let cueChanged = false;
		const nextTokens = cue.tokens.map((token, tokenIndex) => {
			const reviewToken = review.tokens.find(
				(item) =>
					item.cueIndex === cueIndex && item.tokenIndex === tokenIndex,
			);
			const editedText = reviewToken
				? editsByTokenId.get(reviewToken.id)
				: undefined;
			if (!editedText || editedText === token.text) return token;
			cueChanged = true;
			editedTokenCount += 1;
			return { ...token, text: editedText };
		});
		if (!cueChanged) return cue;
		return {
			...cue,
			text: joinSubtitleTokenTexts({
				originalText: cue.text,
				tokens: nextTokens,
			}),
			tokens: nextTokens,
		};
	});

	if (editedTokenCount === 0) return 0;
	editor.timeline.updateElements({
		updates: [
			{
				trackId: review.subtitleTrackId,
				elementId: review.subtitleElementId,
				patch: { cues: nextCues },
			},
		],
	});

	return editedTokenCount;
}

function joinSubtitleTokenTexts({
	originalText,
	tokens,
}: {
	originalText: string;
	tokens: SubtitleToken[];
}): string {
	const tokenTexts = tokens.map((token) => token.text);
	const hasCjk = tokenTexts.some((text) => /[\u3400-\u9fff]/.test(text));
	if (hasCjk) return tokenTexts.join("");
	if (/\s/.test(originalText)) return tokenTexts.join(" ");
	return tokenTexts.join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeRanges({
	ranges,
	mergeGapSeconds,
}: {
	ranges: CutRangeSeconds[];
	mergeGapSeconds: number;
}): CutRangeSeconds[] {
	const sorted = ranges
		.map((range) => ({
			startSeconds: Math.max(0, range.startSeconds - DEFAULT_PADDING_SECONDS),
			endSeconds: Math.max(range.startSeconds, range.endSeconds),
		}))
		.filter((range) => range.endSeconds > range.startSeconds)
		.sort((left, right) => left.startSeconds - right.startSeconds);
	const merged: CutRangeSeconds[] = [];
	for (const range of sorted) {
		const previous = merged[merged.length - 1];
		if (previous && range.startSeconds <= previous.endSeconds + mergeGapSeconds) {
			previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds);
			continue;
		}
		merged.push({ ...range });
	}
	return merged;
}

function buildTimelineTargetsForRanges({
	editor,
	ranges,
}: {
	editor: EditorCore;
	ranges: CutRangeSeconds[];
}) {
	const activeScene = editor.scenes.getActiveSceneOrNull();
	if (!activeScene) return [];
	const tracks = [
		activeScene.tracks.main,
		...activeScene.tracks.overlay,
		...activeScene.tracks.audio,
	];
	return tracks.flatMap((track) =>
		track.elements.flatMap((element) => {
			const elementStartSeconds =
				element.startTime / MEDIA_TIME_TICKS_PER_SECOND;
			const elementEndSeconds =
				(element.startTime + element.duration) /
				MEDIA_TIME_TICKS_PER_SECOND;
			const elementRanges = ranges
				.map((range) => ({
					startSeconds: Math.max(range.startSeconds, elementStartSeconds),
					endSeconds: Math.min(range.endSeconds, elementEndSeconds),
				}))
				.filter((range) => range.endSeconds > range.startSeconds)
				.map((range) => ({
					startTime: secondsToMediaTime(range.startSeconds),
					endTime: secondsToMediaTime(range.endSeconds),
				}));
			if (elementRanges.length === 0) return [];
			return [
				{
					trackId: track.id,
					elementId: element.id,
					ranges: elementRanges,
				},
			];
		}),
	);
}

function secondsToMediaTime(seconds: number): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime is an integer tick brand; seconds are rounded onto that lattice here.
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}

function storeReview(review: StoredRoughCutReview): StoredRoughCutReview {
	storedReviews.set(review.reviewId, review);
	latestReviewId = review.reviewId;

	while (storedReviews.size > MAX_STORED_REVIEWS) {
		const oldest = storedReviews.keys().next().value;
		if (!oldest) break;
		storedReviews.delete(oldest);
	}

	return review;
}

function resolveReview({
	reviewId,
	now,
}: {
	reviewId?: string;
	now: number;
}): StoredRoughCutReview {
	const id = reviewId ?? latestReviewId;
	if (!id) {
		throw new Error("状态错误：请先生成粗剪审核单");
	}
	const review = storedReviews.get(id);
	if (!review) {
		throw new Error(`状态错误：找不到粗剪审核单 "${id}"，请重新分析`);
	}
	if (now - review.createdAt > MAX_REVIEW_AGE_MS) {
		storedReviews.delete(id);
		if (latestReviewId === id) latestReviewId = null;
		throw new Error("状态错误：粗剪审核单已过期，请重新分析");
	}
	return review;
}

function pruneReviews({ now }: { now: number }): void {
	for (const [id, review] of storedReviews) {
		if (now - review.createdAt > MAX_REVIEW_AGE_MS) {
			storedReviews.delete(id);
			if (latestReviewId === id) latestReviewId = null;
		}
	}
}

function stripStoredFields(review: StoredRoughCutReview): RoughCutReviewResult {
	const { createdAt: _createdAt, ...result } = review;
	return result;
}
