"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	ArrowUp,
	Bot,
	Clapperboard,
	ChevronDown,
	Image as ImageIcon,
	ImagePlus,
	MousePointer2,
	Plus,
	Send,
	Sparkles,
	Square,
	Video,
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
	DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
	SMART_MG_COMPOSITION_TEMPLATE_LABEL,
	SMART_MG_COMPOSITION_STYLE_GUIDE,
} from "@/shotlyx/remotion-components/composition-prompt";

interface BottomToolbarProps {
	input: string;
	selectedAgent: string;
	disabled?: boolean;
	onInputChange: (input: string) => void;
	onSubmit: () => void;
	onMediaSubmit?: (prompt: string) => void;
	onMGSubmit?: (prompt: string) => void;
	onStop?: () => void;
}

const MEDIA_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const MEDIA_DURATIONS = [5, 8, 10, 12] as const;
const MG_RATIOS = ["16:9", "9:16", "1:1"] as const;
const MG_DURATIONS = [3, 5, 8, 10] as const;
const REMOTION_MG_TEMPLATE_OPTIONS = [
	{
		value: "smart-composition",
		label: SMART_MG_COMPOSITION_TEMPLATE_LABEL,
		componentCount: DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
		styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
	},
	{
		value: "data-dashboard",
		label: "数据图表",
		componentCount: 4,
		styleGuide:
			"高级数据展示 MG 模板。像数据新闻/商业汇报视频包装，而不是后台网页；使用大数字、趋势箭头、折线/柱状/表格、扫描线和重点行高亮；数据表格必须可编辑、列对齐清楚、字号足够大。",
	},
	{
		value: "title-emphasis",
		label: "标题强调",
		componentCount: 3,
		styleGuide:
			"大字标题和字幕关键词强调模板。使用巨型标题、短副标题、遮罩揭示、下划线扫光、描边字、关键词计数或弹性入场；适合字幕说到关键句时快速打点，画面要像片头包装。",
	},
	{
		value: "annotation-callout",
		label: "标注批注",
		componentCount: 4,
		styleGuide:
			"教学批注和画面标注模板。优先使用手绘感箭头、圆圈、方框、路径描边、扫描线、callout 标签和局部放大；标注不能遮挡主体，线条要有视频包装感而不是网页按钮感。",
	},
	{
		value: "subtitle-beats",
		label: "字幕打点",
		componentCount: 4,
		styleGuide:
			"字幕关键词打点模板。根据用户给出的词或句子拆成连续短节奏：关键词弹出、重点词高亮、短箭头/贴纸式标记、结论短句；适合口播视频，文字必须少、准、可读。",
	},
	{
		value: "comparison-ranking",
		label: "对比排行",
		componentCount: 4,
		styleGuide:
			"对比/排行数据模板。使用左右对比、Top list、条形排行、胜出高亮和差值标签；适合展示方案对比、产品指标、增长前后变化，要求数字清楚、对齐稳定、动效有层次。",
	},
	{
		value: "process-flow",
		label: "流程步骤",
		componentCount: 4,
		styleGuide:
			"流程讲解 MG 模板。使用 3-5 个步骤节点、连接线、进度扫光、当前步骤放大和简短说明；适合教程/方法论/产品流程，不能堆长段落。",
	},
	{
		value: "product-promo",
		label: "产品宣传",
		componentCount: 4,
		styleGuide:
			"产品宣传 MG 模板。强调产品名、核心卖点、功能拆解、前后对比和 CTA；画面应像发布会/产品视频包装，少用装饰卡片，多用清晰版式、精致转场、局部高光和品牌色。",
	},
	{
		value: "minimal-editorial",
		label: "极简杂志",
		componentCount: 3,
		styleGuide:
			"极简杂志/纪录片风 MG 模板。使用大留白、细线、优雅衬线或中性无衬线排版、低饱和强调色和慢速淡入；适合观点、访谈、知识类视频，克制但高级。",
	},
] as const;

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
	disabled,
	onInputChange,
	onSubmit,
	onMediaSubmit,
	onMGSubmit,
	onStop,
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
	const [mgTemplateId, setMGTemplateId] = useState<string>(
		REMOTION_MG_TEMPLATE_OPTIONS[0].value,
	);
	const [mgRatio, setMGRatio] = useState("16:9");
	const [mgDuration, setMGDuration] = useState(5);
	const isMediaMode = selectedAgent === "media";
	const isMGMode = selectedAgent === "mg";

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
		const template =
			REMOTION_MG_TEMPLATE_OPTIONS.find(
				(option) => option.value === mgTemplateId,
			) ?? REMOTION_MG_TEMPLATE_OPTIONS[0];
		onMGSubmit?.(
			buildRemotionMGCompositionPrompt({
				description,
				templateLabel: template.label,
				styleGuide: template.styleGuide,
				componentCount: template.componentCount,
				aspectRatio: mgRatio,
				durationSeconds: mgDuration,
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

	if (isMGMode) {
		return (
			<form
				onSubmit={(event) => {
					event.preventDefault();
					handleMGSubmit();
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
							handleMGSubmit();
						}}
						placeholder="描述你想生成的 MG 动画、箭头、框选、圆圈或字幕强调..."
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

							<SelectInlineControl
								value={mgTemplateId}
								ariaLabel="MG 模板"
								onChange={setMGTemplateId}
								options={REMOTION_MG_TEMPLATE_OPTIONS}
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
				<div className="rounded-sm border border-cyan-300/15 bg-input/90 p-2 shadow-[0_14px_40px_rgba(0,0,0,0.22)]">
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
