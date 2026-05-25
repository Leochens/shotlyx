"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	Bot,
	Clapperboard,
	Gamepad2,
	Lightbulb,
	MousePointer2,
	Plus,
	Send,
	SlidersHorizontal,
	Sparkles,
	Square,
	Zap,
} from "lucide-react";
import { BrandKitMenu } from "@/brand-kit/components/brand-kit-menu";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useEditor } from "@/editor/use-editor";
import {
	createMediaAssetReference,
	createTimelineElementReference,
	createTimelineTrackReference,
} from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import { useAppLocale } from "@/i18n/use-app-locale";
import { ReferenceChipList } from "./reference-chip";
import type { ExecutionMode } from "./types";
import type { TimelineTrack } from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm";
import { cn } from "@/utils/ui";

interface BottomToolbarProps {
	input: string;
	mode: ExecutionMode;
	selectedAgent: string;
	agents: string[];
	disabled?: boolean;
	onInputChange: (input: string) => void;
	onSubmit: () => void;
	onStop?: () => void;
	onModeChange: (mode: ExecutionMode) => void;
	onAgentChange: (agent: string) => void;
}

const MODE_CONFIG: Array<{
	mode: ExecutionMode;
	icon: typeof Zap;
}> = [
	{ mode: "auto", icon: Zap },
	{ mode: "suggest", icon: Lightbulb },
	{ mode: "manual", icon: Gamepad2 },
];

function formatSeconds(seconds: number): string {
	const min = Math.floor(seconds / 60);
	const sec = seconds % 60;
	return `${min.toString().padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

function getTrackItems(sceneTracks: {
	overlay: TimelineTrack[];
	main: TimelineTrack;
	audio: TimelineTrack[];
}): TimelineTrack[] {
	return [...sceneTracks.overlay, sceneTracks.main, ...sceneTracks.audio];
}

export function BottomToolbar({
	input,
	mode,
	selectedAgent,
	agents,
	disabled,
	onInputChange,
	onSubmit,
	onStop,
	onModeChange,
	onAgentChange,
}: BottomToolbarProps) {
	const { copy } = useAppLocale();
	const toolbarCopy = copy.editor.toolbar;
	const editor = useEditor();
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const scene = useEditor((currentEditor) =>
		currentEditor.scenes.getActiveSceneOrNull(),
	);
	const {
		draftReferences,
		primaryReferenceId,
		pointSelectEnabled,
		addReference,
		removeReference,
		setPrimaryReference,
		togglePointSelect,
	} = useAgentContextStore();
	const [referenceOpen, setReferenceOpen] = useState(false);

	const timelineTracks = useMemo(
		() => (scene ? getTrackItems(scene.tracks) : []),
		[scene],
	);
	const timelineElements = useMemo(
		() =>
			timelineTracks.flatMap((track) =>
				track.elements.map((element) => ({
					track,
					element,
					startSeconds: mediaTimeToSeconds({ time: element.startTime }),
					durationSeconds: mediaTimeToSeconds({ time: element.duration }),
				})),
			),
		[timelineTracks],
	);

	const handleSubmit = () => {
		if (!input.trim() || disabled) return;
		onSubmit();
	};

	const addMedia = (mediaId: string) => {
		const asset = mediaAssets.find((item) => item.id === mediaId);
		if (!asset) return;
		addReference(
			createMediaAssetReference({
				asset,
				source: "manual-add",
			}),
		);
		setReferenceOpen(false);
	};

	const addTimelineElement = ({
		trackId,
		elementId,
	}: {
		trackId: string;
		elementId: string;
	}) => {
		const reference = createTimelineElementReference({
			editor,
			trackId,
			elementId,
			source: "manual-add",
		});
		if (reference) addReference(reference);
		setReferenceOpen(false);
	};

	const addTrack = (trackId: string) => {
		const reference = createTimelineTrackReference({
			editor,
			trackId,
			source: "manual-add",
		});
		if (reference) addReference(reference);
		setReferenceOpen(false);
	};

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit();
			}}
			className="border-t border-border/70 bg-background/95 p-2"
		>
			<div className="rounded-sm border border-cyan-300/15 bg-input/90 p-2 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
				<textarea
					value={input}
					data-testid="chat-input"
					onChange={(event) => {
						const next = event.target.value;
						onInputChange(next);
						if (next.endsWith("@")) setReferenceOpen(true);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey) return;
						event.preventDefault();
						handleSubmit();
					}}
					placeholder={toolbarCopy.placeholder}
					rows={2}
					className="max-h-28 min-h-12 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
				/>

				<ReferenceChipList
					references={draftReferences}
					primaryReferenceId={primaryReferenceId}
					onRemove={removeReference}
					onPrimaryChange={setPrimaryReference}
					className="scrollbar-thin max-h-16 overflow-y-auto px-1 pb-1"
				/>

				<div className="flex items-center gap-1 pt-1">
					<div className="flex items-center rounded-sm border border-border bg-muted/70 p-1">
						<Bot size={15} className="ml-1 text-muted-foreground" />
						<select
							value={selectedAgent}
							onChange={(event) => onAgentChange(event.target.value)}
							className="max-w-28 bg-transparent px-1 text-sm font-medium text-foreground outline-none"
						>
							{agents.map((agent) => (
								<option key={agent} value={agent} className="bg-background">
									{agent}
								</option>
							))}
						</select>
					</div>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
								aria-label={toolbarCopy.executionMode}
								title={toolbarCopy.executionMode}
							>
								<SlidersHorizontal size={18} />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" side="top" className="w-48 p-1">
							{MODE_CONFIG.map(({ mode: value, icon: Icon }) => (
								<button
									key={value}
									type="button"
									onClick={() => onModeChange(value)}
									className={cn(
										"flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent",
										mode === value && "bg-accent text-foreground",
									)}
								>
									<Icon size={15} />
									{toolbarCopy.modes[value]}
								</button>
							))}
						</PopoverContent>
					</Popover>

					<Popover open={referenceOpen} onOpenChange={setReferenceOpen}>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="ml-auto size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
								aria-label={toolbarCopy.addReference}
								title={toolbarCopy.addReferenceTitle}
							>
								<Plus size={20} />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							side="top"
							className="scrollbar-thin max-h-96 w-[min(40rem,calc(100vw-2rem))] overflow-y-auto p-3"
						>
							<ReferencePickerSection
								title={`${toolbarCopy.media} (${mediaAssets.length})`}
							>
								{mediaAssets
									.filter((asset) => !asset.ephemeral)
									.map((asset) => (
										<ReferencePickerItem
											key={asset.id}
											icon={<Clapperboard size={16} />}
											title={asset.name}
											detail={[
												asset.type,
												asset.duration ? `${asset.duration.toFixed(1)}s` : null,
											]
												.filter(Boolean)
												.join(" · ")}
											onClick={() => addMedia(asset.id)}
										/>
									))}
							</ReferencePickerSection>
							<ReferencePickerSection
								title={`${toolbarCopy.timeline} (${timelineElements.length})`}
							>
								{timelineElements.map(
									({ track, element, startSeconds, durationSeconds }) => (
										<ReferencePickerItem
											key={`${track.id}:${element.id}`}
											icon={<Sparkles size={16} />}
											title={element.name}
											detail={`${formatSeconds(startSeconds)} - ${formatSeconds(startSeconds + durationSeconds)}`}
											onClick={() =>
												addTimelineElement({
													trackId: track.id,
													elementId: element.id,
												})
											}
										/>
									),
								)}
							</ReferencePickerSection>
							<ReferencePickerSection
								title={`${toolbarCopy.tracks} (${timelineTracks.length})`}
							>
								{timelineTracks.map((track) => (
									<ReferencePickerItem
										key={track.id}
										icon={<Clapperboard size={16} />}
										title={track.name}
										detail={`${track.type} · ${track.elements.length} ${
											track.elements.length === 1
												? toolbarCopy.clip
												: toolbarCopy.clips
										}`}
										onClick={() => addTrack(track.id)}
									/>
								))}
							</ReferencePickerSection>
						</PopoverContent>
					</Popover>

					<BrandKitMenu />

					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={togglePointSelect}
						className={cn(
							"size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
							pointSelectEnabled && "bg-primary/15 text-primary",
						)}
						aria-label={toolbarCopy.pointSelect}
						title={
							pointSelectEnabled
								? toolbarCopy.closePointSelect
								: toolbarCopy.openPointSelect
						}
					>
						<MousePointer2 size={18} />
					</Button>

					{disabled ? (
						<Button
							type="button"
							data-testid="chat-stop-button"
							onClick={onStop}
							className="size-10 rounded-sm bg-destructive p-0 text-destructive-foreground hover:bg-destructive/90"
							aria-label={toolbarCopy.stop}
							title={toolbarCopy.stopTitle}
						>
							<Square size={15} fill="currentColor" />
						</Button>
					) : (
						<Button
							type="submit"
							data-testid="chat-send-button"
							disabled={!input.trim()}
							className="size-10 rounded-sm bg-primary p-0 text-primary-foreground hover:bg-primary/90"
							aria-label={toolbarCopy.send}
						>
							<Send size={18} />
						</Button>
					)}
				</div>
			</div>
		</form>
	);
}

function ReferencePickerSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="mb-3 last:mb-0">
			<div className="mb-1 px-1 text-xs font-semibold text-muted-foreground">
				{title}
			</div>
			<div className="grid gap-1">{children}</div>
		</div>
	);
}

function ReferencePickerItem({
	icon,
	title,
	detail,
	onClick,
}: {
	icon: ReactNode;
	title: string;
	detail?: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent"
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
				{icon}
			</span>
			<span className="min-w-0 flex-1 truncate text-sm text-foreground">
				{title}
			</span>
			{detail ? (
				<span className="shrink-0 text-xs text-muted-foreground">{detail}</span>
			) : null}
		</button>
	);
}
