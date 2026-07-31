"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/editor/use-editor";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type {
	RoughCutReviewResult,
	RoughCutReviewToken,
	RoughCutTokenTextEdit,
} from "@/agent/mcp/rough-cut-tools";
import { buildRoughCutLinePreviewSegments } from "./rough-cut-review-preview";
import { cn } from "@/utils/ui";

interface RoughCutReviewDialogProps {
	review: RoughCutReviewResult | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function isRoughCutReviewResult(
	value: unknown,
): value is RoughCutReviewResult {
	if (!isRecord(value)) return false;
	const record = value;
	return (
		record.openReview === true &&
		typeof record.reviewId === "string" &&
		Array.isArray(record.tokens)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function RoughCutReviewDialog({
	review,
	open,
	onOpenChange,
}: RoughCutReviewDialogProps) {
	const editor = useEditor();
	const editingInputRef = useRef<HTMLInputElement | null>(null);
	const previewTimeoutRef = useRef<number | null>(null);
	const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(
		() =>
			new Set(
				review?.tokens
					.filter((token) => token.selected)
					.map((token) => token.id) ?? [],
			),
	);
	const [focusedTokenId, setFocusedTokenId] = useState<string | null>(
		() =>
			review?.tokens.find((token) => token.selected)?.id ??
			review?.tokens[0]?.id ??
			null,
	);
	const [activeActionTokenId, setActiveActionTokenId] = useState<string | null>(
		null,
	);
	const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
	const [editingValue, setEditingValue] = useState("");
	const [tokenTextEdits, setTokenTextEdits] = useState<Record<string, string>>(
		{},
	);
	const [playingCueIndex, setPlayingCueIndex] = useState<number | null>(null);
	const [isApplying, setIsApplying] = useState(false);

	useEffect(() => {
		if (!editingTokenId) return;
		editingInputRef.current?.focus();
		editingInputRef.current?.select();
	}, [editingTokenId]);

	const stopLinePreview = useCallback(() => {
		if (previewTimeoutRef.current) {
			window.clearTimeout(previewTimeoutRef.current);
			previewTimeoutRef.current = null;
		}
		setPlayingCueIndex(null);
		editor.playback.pause();
	}, [editor]);

	useEffect(
		() => () => {
			if (previewTimeoutRef.current) {
				window.clearTimeout(previewTimeoutRef.current);
			}
		},
		[],
	);

	const tokenGroups = useMemo(() => {
		if (!review) return [];
		const groups = new Map<number, RoughCutReviewToken[]>();
		for (const token of review.tokens) {
			groups.set(token.cueIndex, [...(groups.get(token.cueIndex) ?? []), token]);
		}
		return Array.from(groups.entries()).map(([cueIndex, tokens]) => ({
			cueIndex,
			tokens,
		}));
	}, [review]);

	const selectedTokens =
		review?.tokens.filter((token) => selectedTokenIds.has(token.id)) ?? [];
	const estimatedSeconds = estimateSelectedSeconds({ tokens: selectedTokens });
	const tokenTextEditPayload = buildTokenTextEditPayload({
		reviewTokens: review?.tokens ?? [],
		tokenTextEdits,
	});
	const hasTokenTextEdits = tokenTextEditPayload.length > 0;

	const getTokenText = (token: RoughCutReviewToken): string =>
		tokenTextEdits[token.id] ?? token.text;

	const setTokenDeleted = ({
		token,
		deleted,
	}: {
		token: RoughCutReviewToken;
		deleted: boolean;
	}) => {
		setFocusedTokenId(token.id);
		setSelectedTokenIds((current) => {
			const next = new Set(current);
			if (deleted) {
				next.add(token.id);
			} else {
				next.delete(token.id);
			}
			return next;
		});
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) stopLinePreview();
		onOpenChange(nextOpen);
	};

	const startEditingToken = (token: RoughCutReviewToken) => {
		setFocusedTokenId(token.id);
		setActiveActionTokenId(token.id);
		setEditingTokenId(token.id);
		setEditingValue(getTokenText(token));
	};

	const commitEditing = () => {
		if (!review || !editingTokenId) return;
		const token = review.tokens.find((item) => item.id === editingTokenId);
		if (!token) return;
		const nextText = editingValue.trim();
		setTokenTextEdits((current) => {
			const next = { ...current };
			if (nextText.length === 0 || nextText === token.text) {
				delete next[token.id];
			} else {
				next[token.id] = nextText;
			}
			return next;
		});
		setEditingTokenId(null);
		setEditingValue("");
	};

	const cancelEditing = () => {
		setEditingTokenId(null);
		setEditingValue("");
	};

	const playLinePreview = (group: {
		cueIndex: number;
		tokens: RoughCutReviewToken[];
	}) => {
		if (previewTimeoutRef.current) {
			window.clearTimeout(previewTimeoutRef.current);
			previewTimeoutRef.current = null;
		}
		const segments = buildRoughCutLinePreviewSegments({
			tokens: group.tokens,
			selectedTokenIds,
		});
		if (segments.length === 0) {
			editor.playback.pause();
			setPlayingCueIndex(null);
			toast.info("当前行全部被标记删除，没有可预览的音频");
			return;
		}

		setPlayingCueIndex(group.cueIndex);
		const playSegment = (index: number) => {
			const segment = segments[index];
			if (!segment) {
				editor.playback.pause();
				setPlayingCueIndex(null);
				previewTimeoutRef.current = null;
				return;
			}
			editor.playback.seek({
				time: secondsToMediaTime(segment.startSeconds),
			});
			editor.playback.play();
			previewTimeoutRef.current = window.setTimeout(
				() => {
					const isLastSegment = index >= segments.length - 1;
					if (isLastSegment) {
						editor.playback.pause();
						editor.playback.seek({
							time: secondsToMediaTime(segment.endSeconds),
						});
						setPlayingCueIndex(null);
						previewTimeoutRef.current = null;
						return;
					}
					playSegment(index + 1);
				},
				Math.max(50, (segment.endSeconds - segment.startSeconds) * 1000),
			);
		};
		playSegment(0);
	};

	const resetSelection = () => {
		if (!review) return;
		stopLinePreview();
		setSelectedTokenIds(
			new Set(
				review.tokens
					.filter((token) => token.selected)
					.map((token) => token.id),
			),
		);
		setTokenTextEdits({});
		setEditingTokenId(null);
		setEditingValue("");
	};

	const handleApply = async () => {
		if (!review || (selectedTokenIds.size === 0 && !hasTokenTextEdits)) return;
		stopLinePreview();
		setIsApplying(true);
		try {
			const result = await editor.mcp.execute({
				toolName: "rough_cut_apply_review",
				params: {
					reviewId: review.reviewId,
					selectedTokenIds: Array.from(selectedTokenIds),
					tokenTextEdits: tokenTextEditPayload,
				},
			});
			if (result.status === "error") {
				toast.error(result.error ?? "粗剪应用失败");
				return;
			}
			toast.success("已按审核结果完成粗剪");
			onOpenChange(false);
		} finally {
			setIsApplying(false);
		}
	};

	if (!review) return null;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden rounded-md bg-neutral-950 p-0 text-neutral-100">
				<DialogHeader className="border-b border-neutral-800 p-4">
					<DialogTitle>AI 粗剪审核</DialogTitle>
					<DialogDescription>
						移到字词上方可删除或编辑；每行播放会跳过已标记删除的片段，确认后才修改时间线。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="min-h-0 flex-1 overflow-auto p-4">
					<div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
						<span>{review.tokenCount} tokens</span>
						<span>·</span>
						<span>{review.candidateCount} 组建议</span>
						<span>·</span>
						<span>当前删除 {selectedTokenIds.size} 个</span>
						<span>·</span>
						<span>已编辑 {tokenTextEditPayload.length} 个</span>
					</div>
					<div className="space-y-3">
						{tokenGroups.map((group) => (
							<div
								key={group.cueIndex}
								className={cn(
									"rounded-sm border bg-neutral-900/40 p-3 transition-colors",
									playingCueIndex === group.cueIndex
										? "border-cyan-300/45"
										: "border-neutral-800",
								)}
							>
								<div className="mb-2 flex items-center justify-between gap-3">
									<div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
										Line {group.cueIndex + 1}
									</div>
									<Button
										size="sm"
										variant="secondary"
										onClick={() => playLinePreview(group)}
										aria-label={`播放第 ${group.cueIndex + 1} 行`}
									>
										<Play className="size-3.5" />
										播放本行
									</Button>
								</div>
								<div className="flex flex-wrap gap-x-1.5 gap-y-3 pt-2">
									{group.tokens.map((token) => {
										const selected = selectedTokenIds.has(token.id);
										const focused = focusedTokenId === token.id;
										const activeActions = activeActionTokenId === token.id;
										const editing = editingTokenId === token.id;
										const displayText = getTokenText(token);
										return (
											<span
												key={token.id}
												className="group/token relative inline-flex"
												onMouseEnter={() => {
													setFocusedTokenId(token.id);
													setActiveActionTokenId(token.id);
												}}
												onMouseLeave={() => {
													if (!editing) setActiveActionTokenId(null);
												}}
												onFocus={() => {
													setFocusedTokenId(token.id);
													setActiveActionTokenId(token.id);
												}}
											>
												{activeActions && !editing ? (
													<span
														role="tooltip"
														className="absolute bottom-[calc(100%+0.12rem)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-sm border border-neutral-700 bg-neutral-950 px-1 py-1 shadow-lg"
													>
														<button
															type="button"
															aria-label={selected ? "恢复字词" : "删除字词"}
															title={selected ? "恢复" : "删除"}
															className="flex size-6 items-center justify-center rounded-xs text-red-200 hover:bg-red-500/15"
															onMouseDown={(event) => event.preventDefault()}
															onClick={() =>
																setTokenDeleted({
																	token,
																	deleted: !selected,
																})
															}
														>
															<Trash2 className="size-3.5" />
														</button>
														<button
															type="button"
															aria-label="编辑字词"
															title="编辑"
															className="flex size-6 items-center justify-center rounded-xs text-cyan-100 hover:bg-cyan-400/15"
															onMouseDown={(event) => event.preventDefault()}
															onClick={() => startEditingToken(token)}
														>
															<Pencil className="size-3.5" />
														</button>
													</span>
												) : null}
												{editing ? (
													<Input
														ref={editingInputRef}
														value={editingValue}
														onChange={(event) => setEditingValue(event.target.value)}
														onBlur={commitEditing}
														onKeyDown={(event) => {
															if (event.key === "Enter") {
																event.preventDefault();
																commitEditing();
															}
															if (event.key === "Escape") {
																event.preventDefault();
																cancelEditing();
															}
														}}
														size="xs"
														className="h-8 rounded-sm border-cyan-300/60 bg-neutral-950 px-2 text-sm text-neutral-100"
														style={{
															width: `${Math.min(
																12,
																Math.max(2.5, editingValue.length + 1),
															)}em`,
														}}
													/>
												) : (
													<button
														type="button"
														onClick={() => setFocusedTokenId(token.id)}
														className={cn(
															"rounded-sm border px-2 py-1 text-sm transition-colors",
															selected
																? "border-red-400/40 bg-red-500/15 text-red-200 line-through decoration-red-300 decoration-2"
																: "border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-cyan-400/45 hover:bg-cyan-400/10",
															focused ? "ring-1 ring-cyan-300/55" : "",
															tokenTextEdits[token.id]
																? "border-amber-300/55 text-amber-100"
																: "",
														)}
														title={getTokenTitle({
															token,
															displayText,
														})}
													>
														{displayText}
													</button>
												)}
											</span>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</DialogBody>
				<DialogFooter className="items-center border-t border-neutral-800 p-3 sm:justify-between">
					<div className="text-xs text-neutral-400">
						预计缩短 {estimatedSeconds.toFixed(2)} 秒
						{hasTokenTextEdits ? ` · 修改 ${tokenTextEditPayload.length} 个字词` : ""}
					</div>
					<div className="flex gap-2">
						<Button variant="ghost" onClick={() => onOpenChange(false)}>
							取消
						</Button>
						<Button variant="secondary" onClick={resetSelection}>
							<RotateCcw className="size-3.5" />
							恢复建议
						</Button>
						<Button
							onClick={handleApply}
							disabled={
								isApplying || (selectedTokenIds.size === 0 && !hasTokenTextEdits)
							}
						>
							<Check className="size-3.5" />
							确认剪辑
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function getReasonLabel(reason?: string): string {
	switch (reason) {
		case "filler":
			return "建议原因：口气词 / 气声词";
		case "repeat":
			return "建议原因：重复片段";
		default:
			return "手动选择";
	}
}

function getTokenTitle({
	token,
	displayText,
}: {
	token: RoughCutReviewToken;
	displayText: string;
}): string {
	return `${displayText} · ${token.timelineStartSeconds.toFixed(2)}s - ${token.timelineEndSeconds.toFixed(2)}s · ${getReasonLabel(token.reason)}`;
}

function estimateSelectedSeconds({
	tokens,
}: {
	tokens: RoughCutReviewToken[];
}): number {
	return tokens.reduce(
		(total, token) =>
			total + Math.max(0, token.timelineEndSeconds - token.timelineStartSeconds),
		0,
	);
}

function buildTokenTextEditPayload({
	reviewTokens,
	tokenTextEdits,
}: {
	reviewTokens: RoughCutReviewToken[];
	tokenTextEdits: Record<string, string>;
}): RoughCutTokenTextEdit[] {
	return Object.entries(tokenTextEdits).flatMap(([tokenId, text]) => {
		const originalToken = reviewTokens.find((token) => token.id === tokenId);
		const normalizedText = text.trim();
		if (
			!originalToken ||
			normalizedText.length === 0 ||
			normalizedText === originalToken.text
		) {
			return [];
		}
		return [{ tokenId, text: normalizedText }];
	});
}

function secondsToMediaTime(seconds: number): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- MediaTime is an integer tick brand; seconds are rounded onto that lattice here.
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as MediaTime;
}
