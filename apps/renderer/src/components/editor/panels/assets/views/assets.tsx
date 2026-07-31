"use client";

import Image from "@/platform/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Captions, Eye, FileText, Pencil } from "lucide-react";
import type { ShotlyxMGAsset } from "@/shotlyx/remotion-components/asset-store";
import { ShotlyxMGAssetDialog } from "@/shotlyx/remotion-components/components/shotlyx-mg-asset-dialog";
import {
	SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
	shotlyxMediaTimeFromSeconds,
	buildShotlyxMGElementFromAsset,
	buildShotlyxMGGraphicParams,
	buildDefaultShotlyxMGElementParams,
} from "@/shotlyx/remotion-components/project-assets";
import { ShotlyxMGPlayer } from "@/shotlyx/remotion-components/components/shotlyx-mg-player";
import { resolveShotlyxMGInputProps } from "@/shotlyx/remotion-components/media-props";
import { getShotlyxMGThumbnailFrame } from "@/shotlyx/remotion-components/preview";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm";
import { useEditor } from "@/editor/use-editor";
import { useAppLocale } from "@/i18n/use-app-locale";
import { useFileUpload } from "@/media/use-file-upload";
import { invokeAction } from "@/actions";
import { processMediaAssets } from "@/media/processing";
import { isTimelineMediaType } from "@/media/media-utils";
import { showMediaUploadToast } from "@/media/upload-toast";
import {
	SelectableItem,
	SelectableSurface,
	useSelection,
	useSelectionScope,
} from "@/selection";
import { buildElementFromMedia } from "@/timeline/element-utils";
import {
	type MediaSortKey,
	type MediaSortOrder,
	type MediaViewMode,
	type SelectedAssetRef,
	useAssetsPanelStore,
} from "@/components/editor/panels/assets/assets-panel-store";
import type { SelectionState } from "@/selection/types";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import type { MediaAsset, TimelineMediaType } from "@/media/types";
import { createMediaAssetReference } from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	GridViewIcon,
	LeftToRightListDashIcon,
	SortingOneNineIcon,
	Image02Icon,
	MusicNote03Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

type TimelineMediaAsset = MediaAsset & { type: TimelineMediaType };

const MEDIA_ASSET_GROUPS: Array<{
	type: MediaAsset["type"];
}> = [
	{ type: "video" },
	{ type: "image" },
	{ type: "audio" },
	{ type: "subtitle" },
	{ type: "text" },
];

function isTimelineMediaAsset(asset: MediaAsset): asset is TimelineMediaAsset {
	return isTimelineMediaType(asset.type);
}

function parseAssetSelectionId(id: string): SelectedAssetRef {
	if (id.startsWith("shotlyx-mg:")) {
		return { kind: "shotlyx-mg", id: id.slice("shotlyx-mg:".length) };
	}
	return { kind: "media", id };
}

export function MediaView() {
	const { copy } = useAppLocale();
	const assetsCopy = copy.editor.assets;
	const editor = useEditor();
	const mediaFiles = useEditor((e) => e.media.getAssets());
	const shotlyxMGAssets = useEditor((e) => e.project.getShotlyxMGAssets());
	const activeProject = useEditor((e) => e.project.getActive());

	const mediaViewMode = useAssetsPanelStore((state) => state.mediaViewMode);
	const setMediaViewMode = useAssetsPanelStore(
		(state) => state.setMediaViewMode,
	);
	const highlightMediaId = useAssetsPanelStore(
		(state) => state.highlightMediaId,
	);
	const clearHighlight = useAssetsPanelStore((state) => state.clearHighlight);
	const mediaSortBy = useAssetsPanelStore((state) => state.mediaSortBy);
	const mediaSortOrder = useAssetsPanelStore((state) => state.mediaSortOrder);
	const setMediaSort = useAssetsPanelStore((state) => state.setMediaSort);
	const setSelectedAssetRefs = useAssetsPanelStore(
		(state) => state.setSelectedAssetRefs,
	);

	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files || files.length === 0) return;
		if (!activeProject) {
			toast.error(assetsCopy.noActiveProject);
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: files.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files,
						onProgress: (progress: { progress: number }) =>
							setProgress(progress.progress),
					});
					for (const asset of processedAssets) {
						await editor.media.addMediaAsset({
							projectId: activeProject.metadata.id,
							asset,
						});
					}
					return {
						uploadedCount: processedAssets.length,
						assetNames: processedAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Error processing files:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept:
				"image/*,video/*,audio/*,.srt,.vtt,.ass,.ssa,.txt,text/plain,text/vtt",
			multiple: true,
			onFilesSelected: (files) => processFiles({ files }),
		});

	const handleRemove = ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => {
		event.stopPropagation();

		invokeAction("remove-media-assets", {
			projectId: activeProject.metadata.id,
			assetIds: ids,
		});
	};
	const handleSort = ({ key }: { key: MediaSortKey }) => {
		if (mediaSortBy === key) {
			setMediaSort({
				key,
				order: mediaSortOrder === "asc" ? "desc" : "asc",
			});
		} else {
			setMediaSort({ key, order: "asc" });
		}
	};

	const handleAssetSelectionChange = useCallback(
		(selection: SelectionState) => {
			setSelectedAssetRefs(selection.selectedIds.map(parseAssetSelectionId));
		},
		[setSelectedAssetRefs],
	);

	const filteredMediaItems = useMemo(() => {
		const filtered = mediaFiles.filter((item) => !item.ephemeral);

		filtered.sort((a, b) => {
			let valueA: string | number;
			let valueB: string | number;

			switch (mediaSortBy) {
				case "name":
					valueA = a.name.toLowerCase();
					valueB = b.name.toLowerCase();
					break;
				case "type":
					valueA = a.type;
					valueB = b.type;
					break;
				case "duration":
					valueA = a.duration || 0;
					valueB = b.duration || 0;
					break;
				case "size":
					valueA = a.file.size;
					valueB = b.file.size;
					break;
				default:
					return 0;
			}

			if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
			if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
			return 0;
		});

		return filtered;
	}, [mediaFiles, mediaSortBy, mediaSortOrder]);
	const orderedMediaIds = useMemo(() => {
		return filteredMediaItems.map((item) => item.id);
	}, [filteredMediaItems]);

	return (
		<>
			<input {...fileInputProps} />

			<PanelView
				title={assetsCopy.title}
				actions={
					<MediaActions
						mediaViewMode={mediaViewMode}
						setMediaViewMode={setMediaViewMode}
						isProcessing={isProcessing}
						sortBy={mediaSortBy}
						sortOrder={mediaSortOrder}
						onSort={handleSort}
						onImport={openFilePicker}
					/>
				}
				className={cn(isDragOver && "bg-accent/30")}
				contentClassName="h-full"
				{...dragProps}
			>
				{isDragOver ||
				(filteredMediaItems.length === 0 && shotlyxMGAssets.length === 0) ? (
					<MediaDragOverlay
						isVisible={true}
						isProcessing={isProcessing}
						progress={progress}
						onClick={openFilePicker}
					/>
				) : (
					<SelectableSurface
						ariaLabel={assetsCopy.title}
						orderedIds={[
							...shotlyxMGAssets.map((item) => `shotlyx-mg:${item.id}`),
							...orderedMediaIds,
						]}
						revealId={highlightMediaId}
						onRevealComplete={clearHighlight}
						onSelectionChange={handleAssetSelectionChange}
					>
						<MediaScopeRegistrar />
						<div className="flex flex-col gap-5">
							{shotlyxMGAssets.length > 0 ? (
								<ShotlyxMGAssetList
									items={shotlyxMGAssets}
									mode={mediaViewMode}
								/>
							) : null}
							{filteredMediaItems.length > 0 ? (
								<GroupedMediaItemList
									items={filteredMediaItems}
									mode={mediaViewMode}
									onRemove={handleRemove}
								/>
							) : null}
						</div>
					</SelectableSurface>
				)}
			</PanelView>
		</>
	);
}

function ShotlyxMGAssetList({
	items,
	mode,
}: {
	items: ShotlyxMGAsset[];
	mode: MediaViewMode;
}) {
	const { copy } = useAppLocale();
	const editor = useEditor();
	const isGrid = mode === "grid";
	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-xs">
					{copy.editor.assets.mgAnimations}
				</p>
				<span className="text-muted-foreground text-xs">{items.length}</span>
			</div>
			<div
				className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
				style={
					isGrid
						? { gridTemplateColumns: "repeat(auto-fill, 7rem)" }
						: undefined
				}
			>
				{items.map((item) => (
					<SelectableItem
						key={item.id}
						id={`shotlyx-mg:${item.id}`}
						className={!isGrid ? "w-full" : undefined}
						onClick={() => editor.selection.clearSelection()}
					>
						<ShotlyxMGAssetItem
							item={item}
							variant={isGrid ? "card" : "compact"}
						/>
					</SelectableItem>
				))}
			</div>
		</section>
	);
}

function ShotlyxMGAssetItem({
	item,
	variant,
}: {
	item: ShotlyxMGAsset;
	variant: "card" | "compact";
}) {
	const { copy } = useAppLocale();
	const editor = useEditor();
	const mediaAssets = useEditor((nextEditor) => nextEditor.media.getAssets());
	const [isEditing, setIsEditing] = useState(false);
	const [isPreviewing, setIsPreviewing] = useState(false);
	const duration = shotlyxMediaTimeFromSeconds({
		seconds: item.document.durationSeconds,
	});
	const addElementAtTime = ({ startTime }: { startTime: MediaTime }) => {
		editor.timeline.insertElement({
			element: buildShotlyxMGElementFromAsset({ asset: item, startTime }),
			placement: { mode: "auto", trackType: "graphic" },
		});
	};

	return (
		<div className="group relative">
			<DraggableItem
				name={item.name}
				preview={
					<ShotlyxMGPreview
						name={item.name}
						asset={item}
						mediaAssets={mediaAssets}
						duration={item.document.durationSeconds}
					/>
				}
				dragData={{
					id: item.id,
					type: "graphic",
					name: item.name,
					definitionId: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
					params: buildDefaultShotlyxMGElementParams({ asset: item }),
					duration,
					motionGraphicAssetId: item.id,
					motionGraphicBaseParams: buildShotlyxMGGraphicParams({
						asset: item,
					}),
				}}
				shouldShowPlusOnDrag={false}
				onAddToTimeline={({ currentTime }) =>
					addElementAtTime({ startTime: currentTime })
				}
				variant={variant}
				isRounded={variant === "card" ? false : undefined}
			/>
			<div className="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
				<AssetIconButton
					label={copy.editor.assets.context.previewMg}
					onClick={() => setIsPreviewing(true)}
				>
					<Eye className="size-3.5" />
				</AssetIconButton>
				<AssetIconButton
					label={copy.editor.assets.context.editMg}
					onClick={() => setIsEditing(true)}
				>
					<Pencil className="size-3.5" />
				</AssetIconButton>
			</div>
			<ShotlyxMGPreviewDialog
				open={isPreviewing}
				onOpenChange={setIsPreviewing}
				asset={item}
				mediaAssets={mediaAssets}
			/>
			<ShotlyxMGAssetDialog
				open={isEditing}
				onOpenChange={setIsEditing}
				asset={item}
			/>
		</div>
	);
}

function ShotlyxMGPreview({
	name,
	asset,
	mediaAssets,
	duration,
}: {
	name: string;
	asset: ShotlyxMGAsset;
	mediaAssets: MediaAsset[];
	duration: number;
}) {
	return (
		<div className="relative flex size-full items-center justify-center overflow-hidden rounded bg-neutral-950">
			<div className="pointer-events-none size-full" aria-label={name}>
				<ShotlyxMGPlayer
					asset={asset}
					controls={false}
					currentFrame={getShotlyxMGThumbnailFrame({ asset })}
					inputProps={resolveShotlyxMGInputProps({
						asset,
						mediaAssets,
					})}
					background="transparent"
				/>
			</div>
			<MediaDurationBadge duration={duration} />
		</div>
	);
}

function ShotlyxMGPreviewDialog({
	open,
	onOpenChange,
	asset,
	mediaAssets,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	asset: ShotlyxMGAsset;
	mediaAssets: MediaAsset[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{asset.name}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<div className="aspect-video overflow-hidden rounded border bg-neutral-950">
						<ShotlyxMGPlayer
							asset={asset}
							controls={true}
							inputProps={resolveShotlyxMGInputProps({
								asset,
								mediaAssets,
							})}
							background="transparent"
						/>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function AssetIconButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="rounded-md border border-white/10 bg-black/70 p-1.5 text-white/80 shadow-sm backdrop-blur-sm transition hover:bg-black hover:text-white"
			onClick={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onClick();
			}}
		>
			{children}
		</button>
	);
}

function MediaScopeRegistrar() {
	useSelectionScope();
	return null;
}

function MediaAssetDraggable({
	item,
	preview,
	variant,
	isRounded,
}: {
	item: TimelineMediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
	isRounded?: boolean;
}) {
	const editor = useEditor();

	const addElementAtTime = ({
		asset,
		startTime,
	}: {
		asset: TimelineMediaAsset;
		startTime: MediaTime;
	}) => {
		const duration =
			asset.duration != null
				? mediaTimeFromSeconds({ seconds: asset.duration })
				: DEFAULT_NEW_ELEMENT_DURATION;
		const element = buildElementFromMedia({
			mediaId: asset.id,
			mediaType: asset.type,
			name: asset.name,
			duration,
			startTime,
		});
		editor.timeline.insertElement({
			element,
			placement: { mode: "auto" },
		});
	};

	return (
		<DraggableItem
			name={item.name}
			preview={preview}
			dragData={{
				id: item.id,
				type: "media",
				mediaType: item.type,
				name: item.name,
				...(item.type !== "audio" && {
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}),
			}}
			shouldShowPlusOnDrag={false}
			onAddToTimeline={({ currentTime }) =>
				addElementAtTime({ asset: item, startTime: currentTime })
			}
			variant={variant}
			isRounded={isRounded}
		/>
	);
}

function StaticMediaAssetItem({
	item,
	preview,
	variant,
}: {
	item: MediaAsset;
	preview: React.ReactNode;
	variant: "card" | "compact";
}) {
	if (variant === "compact") {
		return (
			<div className="flex h-8 w-full items-center gap-3 px-1">
				<div className="size-6 shrink-0 overflow-hidden rounded-sm">
					{preview}
				</div>
				<span className="w-full flex-1 truncate text-left text-sm">
					{item.name}
				</span>
			</div>
		);
	}

	return (
		<div className="group relative w-28">
			<div className="relative flex w-full cursor-default flex-col gap-1">
				<div className="bg-accent relative aspect-video overflow-hidden">
					{preview}
				</div>
				<span
					className="text-muted-foreground w-full truncate text-left text-[0.7rem]"
					title={item.name}
				>
					<span className="sr-only">{item.name}</span>
					<span aria-hidden="true">
						{item.name.length > 8
							? `${item.name.slice(0, 16)}...${item.name.slice(-3)}`
							: item.name}
					</span>
				</span>
			</div>
		</div>
	);
}

function MediaItemWithContextMenu({
	item,
	children,
	onRemove,
}: {
	item: MediaAsset;
	children: React.ReactNode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const { copy } = useAppLocale();
	const editor = useEditor();
	const activeProject = useEditor((nextEditor) =>
		nextEditor.project.getActiveOrNull(),
	);
	const { isSelected, selectedIds } = useSelection();
	const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
	const deleteLabel =
		idsToDelete.length > 1
			? copy.editor.assets.context.deleteItems.replace(
					"{count}",
					String(idsToDelete.length),
				)
			: copy.editor.assets.context.delete;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{item.storage?.mode === "linked" ? (
					<>
						<ContextMenuItem
							onClick={() => {
								if (!activeProject) return;
								void editor.media.relinkMediaAsset({
									id: item.id,
									projectId: activeProject.metadata.id,
								});
							}}
						>
							重新定位素材
						</ContextMenuItem>
						<ContextMenuItem
							disabled={item.storage.missing === true}
							onClick={() => {
								if (!activeProject) return;
								void editor.media.consolidateMediaAsset({
									id: item.id,
									projectId: activeProject.metadata.id,
								});
							}}
						>
							归档到项目
						</ContextMenuItem>
					</>
				) : null}
				{isTimelineMediaAsset(item) ? (
					<ContextMenuItem>
						{copy.editor.assets.context.exportClips}
					</ContextMenuItem>
				) : null}
				<ContextMenuItem
					variant="destructive"
					onClick={(event: React.MouseEvent<HTMLDivElement>) =>
						onRemove({ event, ids: idsToDelete })
					}
				>
					{deleteLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function GroupedMediaItemList({
	items,
	mode,
	onRemove,
}: {
	items: MediaAsset[];
	mode: MediaViewMode;
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
}) {
	const isGrid = mode === "grid";
	const { copy } = useAppLocale();
	const assetGroups = copy.editor.assets.groups;
	const groupedItems = MEDIA_ASSET_GROUPS.map((group) => ({
		...group,
		label: assetGroups[group.type],
		items: items.filter((item) => item.type === group.type),
	})).filter((group) => group.items.length > 0);

	return (
		<div className="flex flex-col gap-5">
			{groupedItems.map((group) => (
				<section key={group.type} className="flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<p className="text-muted-foreground text-xs">{group.label}</p>
						<span className="text-muted-foreground text-xs">
							{group.items.length}
						</span>
					</div>
					<MediaItemList
						items={group.items}
						onRemove={onRemove}
						isGrid={isGrid}
					/>
				</section>
			))}
		</div>
	);
}

function MediaItemList({
	items,
	onRemove,
	isGrid,
}: {
	items: MediaAsset[];
	onRemove: ({
		event,
		ids,
	}: {
		event: React.MouseEvent;
		ids: string[];
	}) => void;
	isGrid: boolean;
}) {
	const pointSelectEnabled = useAgentContextStore(
		(state) => state.pointSelectEnabled,
	);
	const addReference = useAgentContextStore((state) => state.addReference);
	const editor = useEditor();

	return (
		<div
			className={cn(isGrid ? "grid gap-4" : "flex flex-col gap-1.5")}
			style={
				isGrid ? { gridTemplateColumns: "repeat(auto-fill, 7rem)" } : undefined
			}
		>
			{items.map((item) => (
				<MediaItemWithContextMenu item={item} onRemove={onRemove} key={item.id}>
					<SelectableItem
						className={cn(
							!isGrid && "w-full",
							pointSelectEnabled &&
								"cursor-crosshair rounded-sm ring-1 ring-transparent hover:ring-amber-400/50",
						)}
						id={item.id}
						onClick={() => {
							editor.selection.clearSelection();
							if (!pointSelectEnabled) return;
							addReference(
								createMediaAssetReference({
									asset: item,
									source: "point-select",
								}),
							);
						}}
					>
						<MediaAssetItem item={item} variant={isGrid ? "card" : "compact"} />
					</SelectableItem>
				</MediaItemWithContextMenu>
			))}
		</div>
	);
}

function MediaAssetItem({
	item,
	variant,
}: {
	item: MediaAsset;
	variant: "card" | "compact";
}) {
	const [isPreviewing, setIsPreviewing] = useState(false);
	const preview = (
		<MediaPreview
			item={item}
			variant={variant === "card" ? "grid" : "compact"}
		/>
	);

	return (
		<div className="group relative">
			{isTimelineMediaAsset(item) ? (
				<MediaAssetDraggable
					item={item}
					preview={preview}
					variant={variant}
					isRounded={variant === "card" ? false : undefined}
				/>
			) : (
				<StaticMediaAssetItem item={item} preview={preview} variant={variant} />
			)}
			{item.storage?.mode === "linked" && item.storage.missing ? (
				<span className="absolute bottom-1.5 left-1.5 z-10 rounded bg-destructive px-1.5 py-0.5 text-[0.65rem] font-medium text-destructive-foreground">
					素材已离线
				</span>
			) : null}
			<div className="absolute right-1.5 top-1.5 z-10 opacity-0 transition group-hover:opacity-100">
				<AssetIconButton
					label={`预览 ${item.name}`}
					onClick={() => setIsPreviewing(true)}
				>
					<Eye className="size-3.5" />
				</AssetIconButton>
			</div>
			<MediaAssetPreviewDialog
				open={isPreviewing}
				onOpenChange={setIsPreviewing}
				item={item}
			/>
		</div>
	);
}

function formatDuration({ duration }: { duration: number }) {
	const min = Math.floor(duration / 60);
	const sec = Math.floor(duration % 60);
	return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
			{formatDuration({ duration })}
		</div>
	);
}

function MediaDurationLabel({ duration }: { duration?: number }) {
	if (!duration) return null;

	return (
		<span className="text-xs opacity-70">{formatDuration({ duration })}</span>
	);
}

function MediaTypePlaceholder({
	icon,
	label,
	duration,
	variant,
	externalSource,
}: {
	icon: IconSvgElement;
	label: string;
	duration?: number;
	variant: "muted" | "bordered";
	externalSource?: MediaAsset["externalSource"];
}) {
	const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

	return (
		<div
			className={cn(
				"text-muted-foreground relative flex size-full flex-col items-center justify-center rounded",
				variant === "muted" ? "bg-muted/30" : "border",
			)}
		>
			<HugeiconsIcon icon={icon} className={iconClassName} />
			<span className="text-xs">{label}</span>
			<MediaDurationLabel duration={duration} />
			<ExternalSourceBadge source={externalSource} />
		</div>
	);
}

function ExternalSourceBadge({
	source,
}: {
	source?: MediaAsset["externalSource"];
}) {
	if (!source) return null;

	const providerLabel =
		source.provider.charAt(0).toUpperCase() + source.provider.slice(1);
	const title = [
		`Source: ${providerLabel}`,
		source.author?.name ? `Author: ${source.author.name}` : null,
		`License: ${source.license.name}`,
		source.license.attributionRequired ? "Attribution required" : null,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<span
			className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/70 px-1.5 py-0.5 text-[0.6rem] leading-none text-white shadow-sm"
			title={title}
		>
			{providerLabel}
		</span>
	);
}

function MediaPreview({
	item,
	variant = "grid",
}: {
	item: MediaAsset;
	variant?: "grid" | "compact";
}) {
	const { copy } = useAppLocale();
	const shouldShowDurationBadge = variant === "grid";

	if (item.type === "image") {
		return (
			<div className="relative flex size-full items-center justify-center bg-muted">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="100vw"
					className="object-cover"
					loading="lazy"
					unoptimized
				/>
				<ExternalSourceBadge source={item.externalSource} />
			</div>
		);
	}

	if (item.type === "video") {
		if (item.thumbnailUrl) {
			return (
				<div className="relative size-full">
					<Image
						src={item.thumbnailUrl}
						alt={item.name}
						fill
						sizes="100vw"
						className="rounded object-cover"
						loading="lazy"
						unoptimized
					/>
					{shouldShowDurationBadge ? (
						<MediaDurationBadge duration={item.duration} />
					) : null}
					<ExternalSourceBadge source={item.externalSource} />
				</div>
			);
		}

		return (
			<MediaTypePlaceholder
				icon={Video01Icon}
				label={copy.editor.assets.groups.video}
				duration={item.duration}
				variant="muted"
				externalSource={item.externalSource}
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<MediaTypePlaceholder
				icon={MusicNote03Icon}
				label={copy.editor.assets.groups.audio}
				duration={item.duration}
				variant="bordered"
				externalSource={item.externalSource}
			/>
		);
	}

	if (item.type === "subtitle") {
		return (
			<DocumentTypePlaceholder
				icon={<Captions className="size-6" />}
				label={copy.editor.assets.groups.subtitle}
			/>
		);
	}

	if (item.type === "text") {
		return (
			<DocumentTypePlaceholder
				icon={<FileText className="size-6" />}
				label={copy.editor.assets.groups.text}
			/>
		);
	}

	return (
		<MediaTypePlaceholder
			icon={Image02Icon}
			label={copy.editor.assets.unknown}
			variant="muted"
		/>
	);
}

function DocumentTypePlaceholder({
	icon,
	label,
}: {
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<div className="text-muted-foreground relative flex size-full flex-col items-center justify-center rounded border bg-muted/20">
			{icon}
			<span className="text-xs">{label}</span>
		</div>
	);
}

function MediaAssetPreviewDialog({
	open,
	onOpenChange,
	item,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	item: MediaAsset;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>{item.name}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<MediaAssetPreviewContent item={item} open={open} />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

function MediaAssetPreviewContent({
	item,
	open,
}: {
	item: MediaAsset;
	open: boolean;
}) {
	const { copy } = useAppLocale();
	const [textContent, setTextContent] = useState<string>("");

	useEffect(() => {
		if (!open || (item.type !== "text" && item.type !== "subtitle")) return;
		let disposed = false;
		void item.file
			.text()
			.then((content) => {
				if (!disposed) setTextContent(content);
			})
			.catch(() => {
				if (!disposed) setTextContent(copy.editor.assets.preview.readFailed);
			});
		return () => {
			disposed = true;
		};
	}, [copy.editor.assets.preview.readFailed, item, open]);

	if (item.type === "image") {
		return (
			<div className="relative h-[min(70vh,720px)] overflow-hidden rounded border bg-neutral-950">
				<Image
					src={item.url ?? ""}
					alt={item.name}
					fill
					sizes="80vw"
					className="object-contain"
					unoptimized
				/>
			</div>
		);
	}

	if (item.type === "video") {
		return (
			// eslint-disable-next-line jsx-a11y/media-has-caption -- Asset preview reflects arbitrary imported media; subtitles are separate resources.
			<video
				src={item.url}
				controls
				className="max-h-[70vh] w-full rounded border bg-neutral-950"
			/>
		);
	}

	if (item.type === "audio") {
		return (
			<div className="rounded border bg-neutral-950 p-6">
				{/* eslint-disable-next-line jsx-a11y/media-has-caption -- Audio preview is for arbitrary imported assets. */}
				<audio src={item.url} controls className="w-full" />
			</div>
		);
	}

	return (
		<pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded border bg-neutral-950 p-4 text-xs leading-relaxed text-neutral-200">
			{textContent || copy.editor.assets.preview.loading}
		</pre>
	);
}

function MediaActions({
	mediaViewMode,
	setMediaViewMode,
	isProcessing,
	sortBy,
	sortOrder,
	onSort,
	onImport,
}: {
	mediaViewMode: MediaViewMode;
	setMediaViewMode: (mode: MediaViewMode) => void;
	isProcessing: boolean;
	sortBy: MediaSortKey;
	sortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
	onImport: () => void;
}) {
	const { copy } = useAppLocale();
	const assetsCopy = copy.editor.assets;
	const sortOrderLabel =
		sortOrder === "asc"
			? assetsCopy.actions.ascending
			: assetsCopy.actions.descending;
	return (
		<div className="flex gap-1.5">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							onClick={() =>
								setMediaViewMode(mediaViewMode === "grid" ? "list" : "grid")
							}
							disabled={isProcessing}
							className="items-center justify-center"
						>
							{mediaViewMode === "grid" ? (
								<HugeiconsIcon icon={LeftToRightListDashIcon} />
							) : (
								<HugeiconsIcon icon={GridViewIcon} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>
							{mediaViewMode === "grid"
								? assetsCopy.actions.switchToList
								: assetsCopy.actions.switchToGrid}
						</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<DropdownMenu>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									size="icon"
									variant="ghost"
									disabled={isProcessing}
									className="items-center justify-center"
								>
									<HugeiconsIcon icon={SortingOneNineIcon} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<DropdownMenuContent align="end">
							<SortMenuItem
								label={assetsCopy.actions.sortLabels.name}
								sortKey="name"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={assetsCopy.actions.sortLabels.type}
								sortKey="type"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={assetsCopy.actions.sortLabels.duration}
								sortKey="duration"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
							<SortMenuItem
								label={assetsCopy.actions.sortLabels.size}
								sortKey="size"
								currentSortBy={sortBy}
								currentSortOrder={sortOrder}
								onSort={onSort}
							/>
						</DropdownMenuContent>
					</DropdownMenu>
					<TooltipContent>
						<p>
							{assetsCopy.actions.sortBy
								.replace("{key}", assetsCopy.actions.sortLabels[sortBy])
								.replace("{order}", sortOrderLabel)}
						</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
			<Button
				variant="outline"
				onClick={onImport}
				disabled={isProcessing}
				size="sm"
				className="items-center justify-center gap-1.5"
			>
				<HugeiconsIcon icon={CloudUploadIcon} />
				{assetsCopy.import}
			</Button>
		</div>
	);
}

function SortMenuItem({
	label,
	sortKey,
	currentSortBy,
	currentSortOrder,
	onSort,
}: {
	label: string;
	sortKey: MediaSortKey;
	currentSortBy: MediaSortKey;
	currentSortOrder: MediaSortOrder;
	onSort: ({ key }: { key: MediaSortKey }) => void;
}) {
	const isActive = currentSortBy === sortKey;
	const arrow = isActive ? (currentSortOrder === "asc" ? "↑" : "↓") : "";

	return (
		<DropdownMenuItem onClick={() => onSort({ key: sortKey })}>
			{label} {arrow}
		</DropdownMenuItem>
	);
}
