"use client";

import { useState } from "react";
import { Pencil, Save } from "lucide-react";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Section, SectionContent } from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import type { SubtitleElement } from "@/timeline";
import {
	applySubtitleCueTextEdits,
	syncLinkedSubtitleAssetFromCues,
} from "./subtitle-cues-edit";

function getCueTexts({ element }: { element: SubtitleElement }): string[] {
	return element.cues.map((cue) => cue.text);
}

function formatCueTime(seconds: number): string {
	const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	const totalCentiseconds = Math.round(safeSeconds * 100);
	const minutes = Math.floor(totalCentiseconds / 6000);
	const wholeSeconds = Math.floor((totalCentiseconds % 6000) / 100);
	const centiseconds = totalCentiseconds % 100;
	return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}.${centiseconds
		.toString()
		.padStart(2, "0")}`;
}

export function SubtitleCuesEditor({
	element,
	trackId,
}: {
	element: SubtitleElement;
	trackId: string;
}) {
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const [draftTexts, setDraftTexts] = useState(() => getCueTexts({ element }));

	const openEditor = () => {
		setDraftTexts(getCueTexts({ element }));
		setOpen(true);
	};

	const updateDraftText = ({
		index,
		text,
	}: {
		index: number;
		text: string;
	}) => {
		setDraftTexts((current) =>
			current.map((value, valueIndex) => (valueIndex === index ? text : value)),
		);
	};

	const save = () => {
		const nextCues = applySubtitleCueTextEdits({
			cues: element.cues,
			texts: draftTexts,
		});
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					patch: {
						cues: nextCues,
					},
				},
			],
		});
		void syncLinkedSubtitleAssetFromCues({
			editor,
			element,
			cues: nextCues,
		}).catch((error) => {
			console.warn("Failed to sync linked subtitle asset:", error);
		});
		setOpen(false);
	};

	return (
		<Section sectionKey={`${element.id}:subtitle-cues-editor`}>
			<SectionContent className="pt-4">
				<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-accent/35 px-3 py-2.5">
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">
							字幕文本
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{element.cues.length} 条字幕
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="h-8 shrink-0 gap-1.5"
						onClick={openEditor}
					>
						<Pencil className="size-3.5" />
						修改
					</Button>
				</div>
			</SectionContent>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="grid max-h-[min(760px,calc(100vh-2rem))] max-w-[min(840px,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-sm border-cyan-300/20 p-0">
					<DialogHeader className="gap-1 p-4 pr-14">
						<DialogTitle>编辑字幕文本</DialogTitle>
						<DialogDescription>
							逐条修改当前字幕层的文本，时间轴位置保持不变。
						</DialogDescription>
					</DialogHeader>
					<DialogBody className="min-h-0 overflow-hidden p-0">
						<ScrollArea className="h-full min-h-0">
							<div className="flex flex-col gap-3 p-4">
								{element.cues.map((cue, index) => {
									const endTime = cue.startTime + cue.duration;
									return (
										<div
											key={cue.id ?? `${cue.startTime}-${index}`}
											className="grid gap-1.5 rounded-md border border-border/70 bg-background/60 p-3"
										>
											<div className="flex items-center justify-between gap-3">
												<span className="text-xs font-medium text-muted-foreground">
													#{index + 1}
												</span>
												<span className="font-mono text-[11px] text-muted-foreground">
													{formatCueTime(cue.startTime)} -{" "}
													{formatCueTime(endTime)}
												</span>
											</div>
											<Textarea
												aria-label={`字幕 ${index + 1}`}
												className="min-h-20 resize-y bg-input/80 text-sm leading-5"
												value={draftTexts[index] ?? ""}
												onChange={(event) =>
													updateDraftText({
														index,
														text: event.currentTarget.value,
													})
												}
											/>
										</div>
									);
								})}
							</div>
						</ScrollArea>
					</DialogBody>
					<DialogFooter className="items-center gap-2 p-4 sm:flex-row">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							取消
						</Button>
						<Button type="button" className="gap-1.5" onClick={save}>
							<Save className="size-3.5" />
							保存修改
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Section>
	);
}
