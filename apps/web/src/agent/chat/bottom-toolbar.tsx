"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	ArrowUp,
	Bot,
	Clapperboard,
	ChevronDown,
	ClipboardList,
	Gamepad2,
	Image as ImageIcon,
	ImagePlus,
	Lightbulb,
	MousePointer2,
	Plus,
	Send,
	SlidersHorizontal,
	Sparkles,
	Square,
	Upload,
	Video,
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
import type { TimelineTrack } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import { mediaTimeToSeconds } from "@/wasm";
import { cn } from "@/utils/ui";
import {
	buildRemotionMGCompositionPrompt,
	buildSeedanceMediaPrompt,
} from "./prompt-builders";
import {
	getMGTemplatePickerOption,
	MGTemplatePicker,
	type MGTemplatePickerValue,
} from "./mg-template-picker";
import type { ExecutionMode } from "./types";

export type RunningSubmitMode = "queue" | "guide";
type TopicSourceMaterialType = "script" | "screen-recording" | "note";

interface BottomToolbarProps {
	input: string;
	selectedAgent: string;
	agents?: string[];
	executionMode?: ExecutionMode;
	disabled?: boolean;
	placeholder?: string;
	runningSubmitMode?: RunningSubmitMode;
	onAgentChange?: (agent: string) => void;
	onExecutionModeChange?: (mode: ExecutionMode) => void;
	onRunningSubmitModeChange?: (mode: RunningSubmitMode) => void;
	onInputChange: (input: string) => void;
	onSubmit: () => void;
	onMediaSubmit?: (prompt: string) => void;
	onMGSubmit?: (prompt: string) => void;
	onStop?: () => void;
	workbench?: "video" | "topic";
	topicSourceMaterialOpen?: boolean;
	onTopicSourceMaterialOpenChange?: (open: boolean) => void;
	onTopicMaterialUploadClick?: () => void;
	onTopicSourceMaterialAdd?: (material: {
		materialType: TopicSourceMaterialType;
		name: string;
		content: string;
	}) => void;
}

const MEDIA_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const MEDIA_DURATIONS = [5, 8, 10, 12] as const;
const MG_RATIOS = ["16:9", "9:16", "1:1"] as const;
const MG_DURATIONS = [3, 5, 8, 10] as const;
const SOURCE_MATERIAL_TYPE_OPTIONS: Array<{
	value: TopicSourceMaterialType;
	label: string;
}> = [
	{ value: "script", label: "脚本" },
	{ value: "screen-recording", label: "录屏稿" },
	{ value: "note", label: "备注" },
];

const CHAT_INPUT_SURFACE_CLASS_NAME =
	"rounded-sm border border-border/80 bg-input/85 p-2 shadow-[0_8px_22px_rgba(14,44,56,0.08),inset_0_1px_0_rgba(255,255,255,0.58)] transition-[border-color,box-shadow] focus-within:border-primary/40 focus-within:shadow-[0_12px_28px_rgba(14,165,190,0.11),inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-cyan-300/15 dark:bg-input/90 dark:shadow-[0_14px_40px_rgba(0,0,0,0.22)] dark:focus-within:border-cyan-300/35 dark:focus-within:shadow-[0_16px_42px_rgba(0,0,0,0.34)]";

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

type ToolbarCopy = {
	media: string;
	timeline: string;
	tracks: string;
	clip: string;
	clips: string;
};

type TimelineReferenceItem = {
	track: TimelineTrack;
	element: TimelineTrack["elements"][number];
	startSeconds: number;
	durationSeconds: number;
};

export function BottomToolbar({
	input,
	selectedAgent,
	agents = ["default", "editor", "media", "mg"],
	executionMode = "auto",
	disabled,
	placeholder,
	runningSubmitMode = "queue",
	onAgentChange = () => {},
	onExecutionModeChange = () => {},
	onRunningSubmitModeChange = () => {},
	onInputChange,
	onSubmit,
	onMediaSubmit,
	onMGSubmit,
	onStop,
	workbench = "video",
	topicSourceMaterialOpen,
	onTopicSourceMaterialOpenChange,
	onTopicMaterialUploadClick,
	onTopicSourceMaterialAdd,
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
	const [mediaRatio, setMediaRatio] = useState("16:9");
	const [mediaDuration, setMediaDuration] = useState(5);
	const [mgTemplateId, setMGTemplateId] =
		useState<MGTemplatePickerValue>("smart-composition");
	const [mgRatio, setMGRatio] = useState("16:9");
	const [mgDuration, setMGDuration] = useState(5);
	const [internalSourceMaterialOpen, setInternalSourceMaterialOpen] =
		useState(false);
	const [sourceMaterialType, setSourceMaterialType] =
		useState<TopicSourceMaterialType>("script");
	const [sourceMaterialTitle, setSourceMaterialTitle] = useState("");
	const [sourceMaterialContent, setSourceMaterialContent] = useState("");
	const isMediaMode = selectedAgent === "media";
	const isMGMode = selectedAgent === "mg";
	const isTopicWorkbench = workbench === "topic";
	const shouldExpandTopicPrompt =
		isTopicWorkbench &&
		input.length > 480 &&
		input.includes("候选选题产出要求");
	const isSourceMaterialOpen =
		topicSourceMaterialOpen ?? internalSourceMaterialOpen;
	const setSourceMaterialOpen =
		onTopicSourceMaterialOpenChange ?? setInternalSourceMaterialOpen;
	const modeControls = (
		<ChatModeControls
			selectedAgent={selectedAgent}
			agents={agents}
			executionMode={executionMode}
			onAgentChange={onAgentChange}
			onExecutionModeChange={onExecutionModeChange}
		/>
	);

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
		if (!input.trim()) return;
		onSubmit();
	};

	const handleMediaSubmit = () => {
		const description = input.trim();
		if (!description || disabled) return;
		const hasReferences = draftReferences.length > 0;
		onMediaSubmit?.(
			buildSeedanceMediaPrompt({
				description,
				aspectRatio: mediaRatio,
				durationSeconds: mediaDuration,
				hasReferences,
			}),
		);
	};

	const handleMGSubmit = () => {
		const description = input.trim();
		if (!description || disabled) return;
		const template = getMGTemplatePickerOption({ value: mgTemplateId });
		onMGSubmit?.(
			buildRemotionMGCompositionPrompt({
				description,
				templateLabel: template.label,
				styleGuide: template.styleGuide,
				componentCount: template.componentCount,
				aspectRatio: mgRatio,
				durationSeconds: mgDuration,
				templateMode: template.templateMode,
				templateId: template.templateId,
			}),
		);
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

	const handleAddSourceMaterial = () => {
		const content = sourceMaterialContent.trim();
		if (!content) return;
		onTopicSourceMaterialAdd?.({
			materialType: sourceMaterialType,
			name:
				sourceMaterialTitle.trim() ||
				(sourceMaterialType === "screen-recording"
					? "录屏稿"
					: sourceMaterialType === "script"
						? "脚本"
						: "素材备注"),
			content,
		});
		setSourceMaterialTitle("");
		setSourceMaterialContent("");
		setSourceMaterialOpen(false);
	};

	if (isMGMode) {
		return (
			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleMGSubmit();
				}}
				className="border-t border-border/70 bg-background/95 p-2"
			>
				{modeControls}
				<div className={CHAT_INPUT_SURFACE_CLASS_NAME}>
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
							handleMGSubmit();
						}}
						placeholder="描述你想生成的 MG 动画、视觉特效或字幕强调..."
						rows={2}
						className="max-h-28 min-h-14 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
					/>

					<ReferenceChipList
						references={draftReferences}
						primaryReferenceId={primaryReferenceId}
						onRemove={removeReference}
						onPrimaryChange={setPrimaryReference}
						className="scrollbar-thin max-h-16 overflow-y-auto px-1 pb-1"
					/>

					<div className="flex min-w-0 items-center gap-1 pt-1">
						<div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-px">
							<Popover open={referenceOpen} onOpenChange={setReferenceOpen}>
								<PopoverTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-9 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label={toolbarCopy.addReference}
										title={toolbarCopy.addReferenceTitle}
									>
										<Plus size={20} />
									</Button>
								</PopoverTrigger>
								<ReferencePopoverContent
									mediaAssets={mediaAssets}
									timelineElements={timelineElements}
									timelineTracks={timelineTracks}
									toolbarCopy={toolbarCopy}
									onAddMedia={addMedia}
									onAddTimelineElement={addTimelineElement}
									onAddTrack={addTrack}
								/>
							</Popover>

							<MediaInlineControl
								icon={<Sparkles size={16} />}
								label="MG 动画"
								title="Remotion MG 模板"
							/>

							<MGTemplatePicker
								value={mgTemplateId}
								onChange={setMGTemplateId}
							/>

							<SelectInlineControl
								value={mgRatio}
								ariaLabel="MG 比例"
								onChange={setMGRatio}
								options={MG_RATIOS.map((ratio) => ({
									value: ratio,
									label: ratio,
								}))}
							/>

							<SelectInlineControl
								value={String(mgDuration)}
								ariaLabel="MG 时长"
								onChange={(value) => setMGDuration(Number(value))}
								options={MG_DURATIONS.map((duration) => ({
									value: String(duration),
									label: `${duration}s`,
								}))}
							/>
						</div>

						<Button
							type={disabled ? "button" : "submit"}
							data-testid={disabled ? "chat-stop-button" : "chat-send-button"}
							disabled={!input.trim() && !disabled}
							onClick={disabled ? onStop : undefined}
							className={cn(
								"h-9 shrink-0 rounded-sm px-3 text-sm font-semibold",
								disabled
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
							aria-label={disabled ? toolbarCopy.stop : "生成 MG 动画"}
						>
							{disabled ? (
								<>
									<Square size={14} fill="currentColor" />
									<span>{toolbarCopy.stop}</span>
								</>
							) : (
								<>
									<ArrowUp size={17} />
									<span>MG</span>
								</>
							)}
						</Button>
					</div>
				</div>
			</form>
		);
	}

	if (isMediaMode) {
		return (
			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleMediaSubmit();
				}}
				className="border-t border-border/70 bg-background/95 p-2"
			>
				{modeControls}
				<div className={CHAT_INPUT_SURFACE_CLASS_NAME}>
					<div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
						<Popover open={referenceOpen} onOpenChange={setReferenceOpen}>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-border bg-muted/35 text-muted-foreground transition-colors hover:border-cyan-300/35 hover:bg-accent hover:text-foreground"
									aria-label="添加参考图"
									title="添加参考图"
								>
									<ImagePlus size={20} strokeWidth={1.8} />
									<span className="max-w-full truncate px-1 text-xs font-medium">
										{draftReferences.length > 0
											? `参考图 ${draftReferences.length}`
											: "参考图"}
									</span>
								</button>
							</PopoverTrigger>
							<ReferencePopoverContent
								mediaAssets={mediaAssets}
								timelineElements={timelineElements}
								timelineTracks={timelineTracks}
								toolbarCopy={toolbarCopy}
								onAddMedia={addMedia}
								onAddTimelineElement={addTimelineElement}
								onAddTrack={addTrack}
							/>
						</Popover>

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
								handleMediaSubmit();
							}}
							placeholder="描述你想让 Seedance 生成的视频..."
							rows={3}
							className="max-h-24 min-h-20 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground"
						/>
					</div>

					<ReferenceChipList
						references={draftReferences}
						primaryReferenceId={primaryReferenceId}
						onRemove={removeReference}
						onPrimaryChange={setPrimaryReference}
						className="scrollbar-thin max-h-16 overflow-y-auto px-1 pt-2"
					/>

					<div className="flex min-w-0 items-center gap-1 pt-2">
						<div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-px">
							<MediaInlineControl
								icon={<ImageIcon size={16} />}
								label="参考图"
								title="内容模式"
							/>

							<SelectInlineControl
								value={mediaRatio}
								ariaLabel="视频比例"
								onChange={setMediaRatio}
								options={MEDIA_RATIOS.map((ratio) => ({
									value: ratio,
									label: ratio,
								}))}
							/>

							<SelectInlineControl
								value={String(mediaDuration)}
								ariaLabel="视频时长"
								onChange={(value) => setMediaDuration(Number(value))}
								options={MEDIA_DURATIONS.map((duration) => ({
									value: String(duration),
									label: `${duration}s`,
								}))}
							/>
						</div>

						<Button
							type={disabled ? "button" : "submit"}
							data-testid={disabled ? "chat-stop-button" : "chat-send-button"}
							disabled={!input.trim() && !disabled}
							onClick={disabled ? onStop : undefined}
							className={cn(
								"h-9 shrink-0 rounded-sm px-3 text-sm font-semibold",
								disabled
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
							aria-label={disabled ? toolbarCopy.stop : "生成 Seedance 视频"}
						>
							{disabled ? (
								<>
									<Square size={14} fill="currentColor" />
									<span>{toolbarCopy.stop}</span>
								</>
							) : (
								<>
									<ArrowUp size={17} />
									<span>Pro</span>
								</>
							)}
						</Button>
					</div>
				</div>
			</form>
		);
	}

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				handleSubmit();
			}}
			className="border-t border-border/70 bg-background/95 p-2"
		>
			{modeControls}
			<div className={CHAT_INPUT_SURFACE_CLASS_NAME}>
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
					placeholder={placeholder ?? toolbarCopy.placeholder}
					rows={shouldExpandTopicPrompt ? 10 : 2}
					className={cn(
						"w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground",
						shouldExpandTopicPrompt ? "max-h-80 min-h-56" : "max-h-28 min-h-12",
					)}
				/>

				<ReferenceChipList
					references={draftReferences}
					primaryReferenceId={primaryReferenceId}
					onRemove={removeReference}
					onPrimaryChange={setPrimaryReference}
					className="scrollbar-thin max-h-16 overflow-y-auto px-1 pb-1"
				/>

				{disabled ? (
					<div
						data-testid="running-submit-mode-controls"
						className="mb-1 flex items-center justify-between gap-2 rounded-sm border border-border/70 bg-muted/[0.18] px-2 py-1.5"
					>
						<span className="text-xs text-muted-foreground">
							Agent 运行中，补充输入将按所选方式处理
						</span>
						<div className="flex shrink-0 items-center gap-1">
							{(["queue", "guide"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									onClick={() => onRunningSubmitModeChange(mode)}
									className={cn(
										"h-7 rounded-sm px-2 text-xs font-medium transition-colors",
										runningSubmitMode === mode
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-accent hover:text-foreground",
									)}
									aria-pressed={runningSubmitMode === mode}
								>
									{mode === "queue" ? "排队" : "引导"}
								</button>
							))}
						</div>
					</div>
				) : null}

				<div className="flex items-center gap-1 pt-1">
					{isTopicWorkbench ? (
						<>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={onTopicMaterialUploadClick}
								disabled={disabled}
								className="size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
								aria-label="上传素材"
								title="上传素材"
							>
								<Upload size={17} />
							</Button>
							<Popover
								open={isSourceMaterialOpen}
								onOpenChange={setSourceMaterialOpen}
							>
								<PopoverTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										disabled={disabled}
										className="size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label="粘贴脚本或录屏稿"
										title="粘贴脚本或录屏稿"
									>
										<ClipboardList size={17} />
									</Button>
								</PopoverTrigger>
								<PopoverContent
									align="start"
									side="top"
									className="w-[min(28rem,calc(100vw-2rem))] rounded-sm p-3"
								>
									<div className="flex items-center gap-1">
										{SOURCE_MATERIAL_TYPE_OPTIONS.map((option) => (
											<button
												key={option.value}
												type="button"
												onClick={() => setSourceMaterialType(option.value)}
												className={cn(
													"rounded-sm px-2 py-1 text-xs font-medium transition-colors",
													sourceMaterialType === option.value
														? "bg-primary text-primary-foreground"
														: "text-muted-foreground hover:bg-accent hover:text-foreground",
												)}
											>
												{option.label}
											</button>
										))}
									</div>
									<input
										value={sourceMaterialTitle}
										onChange={(event) =>
											setSourceMaterialTitle(event.target.value)
										}
										placeholder="标题，可选"
										className="mt-2 h-9 w-full rounded-sm border border-border bg-background px-2 text-sm outline-none focus:border-primary/40"
									/>
									<textarea
										value={sourceMaterialContent}
										onChange={(event) =>
											setSourceMaterialContent(event.target.value)
										}
										placeholder="粘贴脚本、口播稿、录屏转写或素材说明"
										rows={7}
										className="mt-2 max-h-64 min-h-32 w-full resize-y rounded-sm border border-border bg-background px-2 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40"
									/>
									<div className="mt-2 flex justify-end">
										<Button
											type="button"
											size="sm"
											disabled={!sourceMaterialContent.trim()}
											onClick={handleAddSourceMaterial}
										>
											加入上下文
										</Button>
									</div>
								</PopoverContent>
							</Popover>
						</>
					) : null}
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
						<ReferencePopoverContent
							mediaAssets={mediaAssets}
							timelineElements={timelineElements}
							timelineTracks={timelineTracks}
							toolbarCopy={toolbarCopy}
							onAddMedia={addMedia}
							onAddTimelineElement={addTimelineElement}
							onAddTrack={addTrack}
						/>
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
						<>
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
							<Button
								type="submit"
								data-testid="chat-send-button"
								disabled={!input.trim()}
								className="size-10 rounded-sm bg-primary p-0 text-primary-foreground hover:bg-primary/90"
								aria-label={
									runningSubmitMode === "guide"
										? "引导当前 Agent"
										: "排队追加问题"
								}
								title={
									runningSubmitMode === "guide"
										? "中断当前回答并优先发送这条引导"
										: "当前 Agent 结束后自动发送"
								}
							>
								<Send size={18} />
							</Button>
						</>
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

export function ChatModeControls({
	selectedAgent,
	agents,
	executionMode,
	onAgentChange,
	onExecutionModeChange,
}: {
	selectedAgent: string;
	agents: string[];
	executionMode: ExecutionMode;
	onAgentChange: (agent: string) => void;
	onExecutionModeChange: (mode: ExecutionMode) => void;
}) {
	return (
		<div
			data-testid="chat-mode-controls"
			className="mb-2 flex min-w-0 items-center justify-between gap-2"
		>
			<div className="scrollbar-thin min-w-0 overflow-x-auto pb-px">
				<AgentModeSelect
					selectedAgent={selectedAgent}
					agents={agents}
					onAgentChange={onAgentChange}
				/>
			</div>
			<ExecutionModeSelect
				mode={executionMode}
				onModeChange={onExecutionModeChange}
			/>
		</div>
	);
}

function ExecutionModeSelect({
	mode,
	onModeChange,
}: {
	mode: ExecutionMode;
	onModeChange: (mode: ExecutionMode) => void;
}) {
	const { copy } = useAppLocale();
	const label = copy.editor.toolbar.modes[mode];

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border/80 bg-muted/60 px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					aria-label={copy.editor.toolbar.executionMode}
					title={`${copy.editor.toolbar.executionMode}: ${label}`}
				>
					<SlidersHorizontal size={14} />
					<span className="whitespace-nowrap">{label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" className="w-48 p-1">
				{MODE_CONFIG.map(({ mode: value, icon: Icon }) => (
					<button
						key={value}
						type="button"
						onClick={() => onModeChange(value)}
						className={`flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent ${
							mode === value ? "bg-accent text-foreground" : ""
						}`}
					>
						<Icon size={15} />
						{copy.editor.toolbar.modes[value]}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}

export function AgentModeSelect({
	selectedAgent,
	agents,
	onAgentChange,
	compact = false,
}: {
	selectedAgent: string;
	agents?: string[];
	onAgentChange: (agent: string) => void;
	compact?: boolean;
}) {
	const value =
		selectedAgent === "media"
			? "media"
			: selectedAgent === "mg"
				? "mg"
				: "editor";
	const options = [
		{ value: "editor", label: "Editor", icon: Bot },
		...((agents?.includes("media") ?? true)
			? [{ value: "media", label: "Media", icon: Video }]
			: []),
		...((agents?.includes("mg") ?? true)
			? [{ value: "mg", label: "MG 动画", icon: Sparkles }]
			: []),
	];

	return (
		<div
			className={cn(
				"flex h-8 shrink-0 items-center gap-0.5 rounded-sm border border-border/80 bg-muted/60 p-0.5 text-muted-foreground",
				compact ? "max-w-[8rem]" : "max-w-full",
			)}
		>
			{options.map((option) => {
				const Icon = option.icon;
				const isActive = value === option.value;
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onAgentChange(option.value)}
						className={cn(
							"inline-flex h-7 min-w-0 shrink-0 items-center gap-1 rounded-[3px] px-2 text-xs font-medium transition-colors",
							isActive
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:bg-accent hover:text-foreground",
							compact && "px-1.5",
						)}
						aria-pressed={isActive}
					>
						<Icon size={13} className="shrink-0" />
						<span className={cn("whitespace-nowrap", compact && "sr-only")}>
							{option.label}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function MediaInlineControl({
	icon,
	label,
	title,
}: {
	icon: ReactNode;
	label: string;
	title: string;
}) {
	return (
		<div
			className="flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
			title={title}
		>
			<span className="text-current">{icon}</span>
			<span className="whitespace-nowrap text-sm font-medium">{label}</span>
		</div>
	);
}

function SelectInlineControl({
	value,
	options,
	ariaLabel,
	onChange,
}: {
	value: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	ariaLabel: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="relative flex h-9 shrink-0 items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-label={ariaLabel}
				className="h-full appearance-none bg-transparent pl-2 pr-6 text-sm font-semibold text-current outline-none"
			>
				{options.map((option) => (
					<option
						key={option.value}
						value={option.value}
						className="bg-background text-foreground"
					>
						{option.label}
					</option>
				))}
			</select>
			<ChevronDown
				size={12}
				className="pointer-events-none absolute right-1 text-muted-foreground"
			/>
		</div>
	);
}

function ReferencePopoverContent({
	mediaAssets,
	timelineElements,
	timelineTracks,
	toolbarCopy,
	onAddMedia,
	onAddTimelineElement,
	onAddTrack,
}: {
	mediaAssets: MediaAsset[];
	timelineElements: TimelineReferenceItem[];
	timelineTracks: TimelineTrack[];
	toolbarCopy: ToolbarCopy;
	onAddMedia: (mediaId: string) => void;
	onAddTimelineElement: (args: { trackId: string; elementId: string }) => void;
	onAddTrack: (trackId: string) => void;
}) {
	return (
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
							onClick={() => onAddMedia(asset.id)}
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
								onAddTimelineElement({
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
							track.elements.length === 1 ? toolbarCopy.clip : toolbarCopy.clips
						}`}
						onClick={() => onAddTrack(track.id)}
					/>
				))}
			</ReferencePickerSection>
		</PopoverContent>
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
