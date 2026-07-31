"use client";

import Image from "@/platform/image";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DraggableItem } from "@/components/editor/panels/assets/draggable-item";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { showMediaUploadToast } from "@/media/upload-toast";
import { useFileUpload } from "@/media/use-file-upload";
import { useAnimatedStickerLibraryStore } from "@/stickers/animated-sticker-library-store";
import { resolveStickerIntrinsicSize } from "@/stickers";
import {
	ANIMATED_STICKER_UPLOAD_ACCEPT,
	filterAnimatedStickerLibraryItems,
	insertAnimatedStickerLibraryItem,
	isAnimatedStickerUploadFile,
	type AnimatedStickerLibraryItem,
} from "@/stickers/animated-user-stickers";
import {
	buildGraphicElement,
	buildStickerElement,
} from "@/timeline/element-utils";
import { MASKABLE_ELEMENT_TYPES } from "@/timeline";
import { STICKER_CATEGORIES } from "@/stickers/categories";
import { getGraphicStickerPreset } from "@/stickers/graphic-sticker";
import type { TimelineDragData } from "@/timeline/drag";
import type {
	StickerBrowseSection,
	StickerCategory,
	StickerItem as StickerData,
} from "@/stickers";
import { useStickersStore } from "@/stickers/stickers-store";
import { cn } from "@/utils/ui";
import {
	CloudUploadIcon,
	HappyIcon,
	Image02Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Check, Pencil, X } from "lucide-react";

export function StickersView() {
	const {
		browseContent,
		browseStickers,
		searchQuery,
		searchStickers,
		selectedCategory,
		setSearchQuery,
		setSelectedCategory,
		viewMode,
	} = useStickersStore();
	const effectiveSelectedCategory = isStickerCategory(selectedCategory)
		? selectedCategory
		: "all";

	useEffect(() => {
		if (!isStickerCategory(selectedCategory)) {
			setSelectedCategory({ category: "all" });
		}
	}, [selectedCategory, setSelectedCategory]);

	useEffect(() => {
		if (viewMode === "browse" && !browseContent) {
			void browseStickers();
		}
	}, [browseContent, browseStickers, viewMode]);

	return (
		<div className="flex h-full flex-col py-2">
			<div className="px-2">
				<Input
					size="sm"
					variant="default"
					placeholder="Search..."
					value={searchQuery}
					onChange={(e) => {
						setSearchQuery({ query: e.target.value });
						void searchStickers({ query: e.target.value });
					}}
					showClearIcon
					onClear={() => {
						setSearchQuery({ query: "" });
						void searchStickers({ query: "" });
					}}
					className="w-full"
					containerClassName="w-full"
				/>
			</div>

			<Tabs
				value={effectiveSelectedCategory}
				onValueChange={(value) => {
					if (isStickerCategory(value)) {
						setSelectedCategory({ category: value });
					}
				}}
				variant="underline"
				className="mt-2 flex min-h-0 flex-1 flex-col"
			>
				<TabsList aria-label="Sticker categories">
					{Object.entries(STICKER_CATEGORIES).map(([key, label]) => (
						<TabsTrigger key={key} value={key}>
							{label}
						</TabsTrigger>
					))}
				</TabsList>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
					<StickersContentView />
				</div>
			</Tabs>
		</div>
	);
}

function isStickerCategory(value: string): value is StickerCategory {
	return value in STICKER_CATEGORIES;
}

function StickerGrid({
	items,
	shouldCapSize = false,
}: {
	items: StickerData[];
	shouldCapSize?: boolean;
}) {
	const gridStyle: CSSProperties & {
		"--sticker-min": string;
		"--sticker-max"?: string;
	} = {
		gridTemplateColumns: shouldCapSize
			? "repeat(auto-fill, minmax(var(--sticker-min, 80px), var(--sticker-max, 140px)))"
			: "repeat(auto-fill, minmax(var(--sticker-min, 80px), 1fr))",
		"--sticker-min": "80px",
		...(shouldCapSize ? { "--sticker-max": "140px" } : {}),
	};

	return (
		<div className="grid gap-2" style={gridStyle}>
			{items.map((item) => (
				<StickerItem key={item.id} item={item} shouldCapSize={shouldCapSize} />
			))}
		</div>
	);
}

function StickerRow({ items }: { items: StickerData[] }) {
	return (
		<div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hidden">
			{items.map((item) => (
				<div key={item.id} className="w-20 shrink-0">
					<StickerItem item={item} shouldCapSize containerClassName="w-full" />
				</div>
			))}
		</div>
	);
}

function EmptyView({ message }: { message: string }) {
	return (
		<div className="bg-background flex h-full flex-col items-center justify-center gap-3 p-4">
			<HugeiconsIcon
				icon={HappyIcon}
				className="text-muted-foreground size-10"
			/>
			<div className="flex flex-col gap-2 text-center">
				<p className="text-lg font-medium">No stickers found</p>
				<p className="text-muted-foreground text-sm text-balance">{message}</p>
			</div>
		</div>
	);
}

function AnimatedStickersContentView() {
	const {
		browseContent,
		clearRecentStickers,
		isBrowsing,
		isSearching,
		searchQuery,
		searchResults,
		setSelectedCategory,
		viewMode,
	} = useStickersStore();
	const {
		addProcessedAssets,
		isLoaded: isLibraryLoaded,
		isLoading: isLibraryLoading,
		items: libraryItems,
		loadItems,
	} = useAnimatedStickerLibraryStore();
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);

	useEffect(() => {
		void loadItems();
	}, [loadItems]);

	const uploadedAssets = useMemo(
		() =>
			filterAnimatedStickerLibraryItems({
				items: libraryItems,
				query: viewMode === "search" ? searchQuery : "",
			}),
		[libraryItems, searchQuery, viewMode],
	);

	const builtInSections = useMemo<StickerBrowseSection[]>(() => {
		if (viewMode === "search") {
			const items = searchResults?.items ?? [];
			return items.length
				? [
						{
							id: "built-in",
							title: "Built-in motion",
							items,
							layout: "grid",
						},
					]
				: [];
		}
		return browseContent?.sections ?? [];
	}, [browseContent?.sections, searchResults?.items, viewMode]);

	const processFiles = async ({ files }: { files: File[] }) => {
		if (!files.length) return;

		const acceptedFiles = files.filter((file) =>
			isAnimatedStickerUploadFile({ file }),
		);
		if (!acceptedFiles.length) {
			toast.error("Upload a video, GIF, or image");
			return;
		}

		setIsProcessing(true);
		setProgress(0);
		try {
			await showMediaUploadToast({
				filesCount: acceptedFiles.length,
				promise: async () => {
					const processedAssets = await processMediaAssets({
						files: acceptedFiles,
						onProgress: ({ progress }) => setProgress(progress),
					});
					const stickerAssets = await addProcessedAssets({
						assets: processedAssets,
					});
					return {
						uploadedCount: stickerAssets.length,
						assetNames: stickerAssets.map((asset) => asset.name),
					};
				},
			});
		} catch (error) {
			console.error("Failed to upload animated stickers:", error);
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	const { isDragOver, dragProps, openFilePicker, fileInputProps } =
		useFileUpload({
			accept: ANIMATED_STICKER_UPLOAD_ACCEPT,
			multiple: true,
			onFilesSelected: (files) => void processFiles({ files }),
		});

	const hasContent = uploadedAssets.length > 0 || builtInSections.length > 0;

	return (
		<div className="flex flex-col gap-4 pb-4">
			<input {...fileInputProps} />
			<AnimatedStickerUploadPanel
				isDragOver={isDragOver}
				isProcessing={isProcessing}
				progress={progress}
				onUpload={openFilePicker}
				dragProps={dragProps}
			/>

			{isSearching ||
			isLibraryLoading ||
			!isLibraryLoaded ||
			(isBrowsing && !browseContent) ? (
				<div className="flex items-center justify-center py-8">
					<Spinner className="text-muted-foreground size-6" />
				</div>
			) : (
				<>
					{uploadedAssets.length > 0 && (
						<AnimatedStickerMediaSection items={uploadedAssets} />
					)}
					{builtInSections.map((section) => (
						<StickerSection
							key={section.id}
							section={section}
							onClearRecent={clearRecentStickers}
							onSeeAll={(category) => {
								setSelectedCategory({ category });
							}}
						/>
					))}
					{!hasContent && searchQuery ? (
						<EmptyView message={`No stickers found for "${searchQuery}"`} />
					) : null}
				</>
			)}
		</div>
	);
}

function AnimatedStickerUploadPanel({
	isDragOver,
	isProcessing,
	progress,
	onUpload,
	dragProps,
}: {
	isDragOver: boolean;
	isProcessing: boolean;
	progress: number;
	onUpload: () => void;
	dragProps: ReturnType<typeof useFileUpload>["dragProps"];
}) {
	return (
		<div
			className={cn(
				"flex min-h-20 items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/20 p-3",
				isDragOver && "border-primary bg-primary/10",
			)}
			{...dragProps}
		>
			<div className="flex min-w-0 items-center gap-2">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background">
					<HugeiconsIcon
						icon={CloudUploadIcon}
						className="text-muted-foreground size-5"
					/>
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">
						{isProcessing ? `Uploading ${progress}%` : "Upload motion sticker"}
					</p>
					<p className="truncate text-xs text-muted-foreground">
						Video, GIF, image
					</p>
				</div>
			</div>
			<Button
				type="button"
				size="sm"
				variant="secondary"
				onClick={onUpload}
				disabled={isProcessing}
				className="shrink-0 gap-1.5"
			>
				{isProcessing ? (
					<Spinner className="size-4" />
				) : (
					<HugeiconsIcon icon={CloudUploadIcon} className="size-4" />
				)}
				Upload
			</Button>
		</div>
	);
}

function AnimatedStickerMediaSection({
	items,
}: {
	items: AnimatedStickerLibraryItem[];
}) {
	const gridStyle: CSSProperties & {
		"--sticker-min": string;
	} = {
		gridTemplateColumns:
			"repeat(auto-fill, minmax(var(--sticker-min, 80px), 1fr))",
		"--sticker-min": "80px",
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<p className="text-xs text-muted-foreground">Uploaded motion</p>
				<span className="text-xs text-muted-foreground">{items.length}</span>
			</div>
			<div className="grid gap-2" style={gridStyle}>
				{items.map((item) => (
					<AnimatedStickerMediaItem key={item.id} item={item} />
				))}
			</div>
		</div>
	);
}

function AnimatedStickerMediaItem({
	item,
}: {
	item: AnimatedStickerLibraryItem;
}) {
	const editor = useEditor();
	const [isAdding, setIsAdding] = useState(false);
	const [isRenaming, setIsRenaming] = useState(false);
	const [draftName, setDraftName] = useState(item.name);
	const { renameItem } = useAnimatedStickerLibraryStore();

	const handleAdd = async () => {
		setIsAdding(true);
		try {
			await insertAnimatedStickerLibraryItem({
				editor,
				item,
				startTime: editor.playback.getCurrentTime(),
			});
		} catch (error) {
			console.error("Failed to add uploaded motion sticker:", error);
			toast.error("Failed to add sticker to timeline");
		} finally {
			setIsAdding(false);
		}
	};

	const handleRename = async () => {
		const updated = await renameItem({ id: item.id, name: draftName });
		if (!updated) {
			toast.error("Failed to rename sticker");
			return;
		}
		setIsRenaming(false);
	};

	const preview = (
		<div className="relative flex size-full items-center justify-center overflow-hidden bg-muted">
			<AnimatedStickerMediaPreview item={item} />
			<AnimatedStickerMediaBadge item={item} />
		</div>
	);

	return (
		<div
			className={cn(
				"group relative",
				isAdding && "pointer-events-none opacity-50",
			)}
		>
			<DraggableItem
				name={item.name}
				preview={preview}
				dragData={{
					id: item.id,
					type: "animated-sticker-upload",
					item,
					name: item.name,
					targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
				}}
				onAddToTimeline={() => void handleAdd()}
				aspectRatio={1}
				shouldShowLabel={false}
				isRounded
				variant="card"
				containerClassName="w-full"
			/>
			<div className="mt-1 min-h-8">
				{isRenaming ? (
					<form
						className="flex items-center gap-1"
						onSubmit={(event) => {
							event.preventDefault();
							void handleRename();
						}}
					>
						<Input
							value={draftName}
							onChange={(event) => setDraftName(event.target.value)}
							size="sm"
							className="h-7 min-w-0 text-xs"
						/>
						<Button
							type="submit"
							size="icon"
							variant="ghost"
							className="size-7 shrink-0"
							aria-label="Save name"
						>
							<Check className="size-3.5" />
						</Button>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-7 shrink-0"
							aria-label="Cancel rename"
							onClick={() => {
								setDraftName(item.name);
								setIsRenaming(false);
							}}
						>
							<X className="size-3.5" />
						</Button>
					</form>
				) : (
					<div className="flex items-center gap-1">
						<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
							{item.name}
						</span>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							className="size-6 shrink-0 opacity-70 hover:opacity-100"
							aria-label={`Rename ${item.name}`}
							onClick={() => {
								setDraftName(item.name);
								setIsRenaming(true);
							}}
						>
							<Pencil className="size-3.5" />
						</Button>
					</div>
				)}
			</div>
			{isAdding && (
				<div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/60">
					<Spinner className="size-6 text-white" />
				</div>
			)}
		</div>
	);
}

function AnimatedStickerMediaPreview({
	item,
}: {
	item: AnimatedStickerLibraryItem;
}) {
	if (item.type === "video") {
		return (
			<video
				src={item.url}
				className="size-full object-contain"
				autoPlay
				loop
				muted
				playsInline
			/>
		);
	}

	return (
		<Image
			src={item.url ?? item.thumbnailUrl ?? ""}
			alt={item.name}
			width={64}
			height={64}
			className="size-full object-contain"
			loading="lazy"
			unoptimized
		/>
	);
}

function AnimatedStickerMediaBadge({
	item,
}: {
	item: Pick<AnimatedStickerLibraryItem, "type" | "file">;
}) {
	const isGif = item.file.type === "image/gif";
	const label = isGif ? "GIF" : item.type === "video" ? "Video" : "Image";
	const icon = item.type === "video" ? Video01Icon : Image02Icon;
	return (
		<span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[0.6rem] leading-none text-white">
			<HugeiconsIcon icon={icon} className="size-3" />
			{label}
		</span>
	);
}

function StickersContentView() {
	const {
		browseContent,
		clearRecentStickers,
		isBrowsing,
		isSearching,
		searchQuery,
		searchResults,
		selectedCategory,
		setSelectedCategory,
		viewMode,
	} = useStickersStore();
	const effectiveSelectedCategory = isStickerCategory(selectedCategory)
		? selectedCategory
		: "all";
	const browseSections = useMemo(
		() => browseContent?.sections ?? [],
		[browseContent?.sections],
	);

	if (effectiveSelectedCategory === "animated-stickers") {
		return <AnimatedStickersContentView />;
	}

	if (viewMode === "search") {
		if (isSearching) {
			return (
				<div className="flex items-center justify-center py-8">
					<Spinner className="text-muted-foreground size-6" />
				</div>
			);
		}

		const searchItems = searchResults?.items ?? [];

		if (searchItems.length) {
			const total = searchResults?.total ?? 0;

			return (
				<div className="flex flex-col gap-3 pb-4">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground text-sm">
							{total} results
						</span>
					</div>
					<StickerGrid items={searchItems} />
				</div>
			);
		}

		// "all" tab search — sections are in browseContent, fall through to section rendering below
		if (effectiveSelectedCategory !== "all" && searchQuery) {
			return <EmptyView message={`No stickers found for "${searchQuery}"`} />;
		}
	}

	if (isBrowsing && !browseContent) {
		return (
			<div className="flex items-center justify-center py-8">
				<Spinner className="text-muted-foreground size-6" />
			</div>
		);
	}

	if (!browseSections.length) {
		const categoryLabel = STICKER_CATEGORIES[effectiveSelectedCategory];
		return (
			<EmptyView
				message={
					viewMode === "search"
						? `No stickers found for "${searchQuery}"`
						: effectiveSelectedCategory === "all"
							? "No stickers available yet."
							: `No stickers available in ${categoryLabel.toLowerCase()} yet.`
				}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4 pb-4">
			{browseSections.map((section) => (
				<StickerSection
					key={section.id}
					section={section}
					onClearRecent={clearRecentStickers}
					onSeeAll={(category) => {
						setSelectedCategory({ category });
					}}
				/>
			))}
		</div>
	);
}

function StickerSection({
	section,
	onClearRecent,
	onSeeAll,
}: {
	section: StickerBrowseSection;
	onClearRecent: () => void;
	onSeeAll: (category: StickerCategory) => void;
}) {
	const hasHeader =
		Boolean(section.title) || section.id === "recent" || section.action;

	return (
		<div className="flex flex-col gap-2">
			{hasHeader && (
				<div className="flex items-center justify-between gap-2">
					{section.title ? (
						<p className="text-xs text-muted-foreground">{section.title}</p>
					) : (
						<div />
					)}

					<div className="ml-auto flex items-center gap-2">
						{section.id === "recent" && (
							<Button
								onClick={onClearRecent}
								variant="text"
								size="sm"
								className="h-auto gap-1 p-0 text-xs text-muted-foreground"
							>
								Clear
							</Button>
						)}

						{section.action?.type === "see-all" && section.action.category && (
							<Button
								variant="text"
								size="sm"
								className="h-auto gap-1 p-0 text-xs text-primary"
								onClick={() => {
									const category = section.action?.category;
									if (category) {
										onSeeAll(category);
									}
								}}
							>
								See all
							</Button>
						)}
					</div>
				</div>
			)}

			{section.layout === "row" ? (
				<StickerRow items={section.items} />
			) : (
				<StickerGrid items={section.items} />
			)}
		</div>
	);
}

interface StickerItemProps {
	item: StickerData;
	shouldCapSize?: boolean;
	containerClassName?: string;
}

function StickerItem({
	item,
	shouldCapSize = false,
	containerClassName,
}: StickerItemProps) {
	const editor = useEditor();
	const { addToRecentStickers } = useStickersStore();
	const [isAdding, setIsAdding] = useState(false);
	const [imageErrorItemId, setImageErrorItemId] = useState<string | null>(null);
	const hasImageError = imageErrorItemId === item.id;

	const displayName = item.name;
	const graphicPreset = getGraphicStickerPreset({ item });

	const handleAdd = async () => {
		setIsAdding(true);
		try {
			const currentTime = editor.playback.getCurrentTime();

			let element:
				| ReturnType<typeof buildGraphicElement>
				| ReturnType<typeof buildStickerElement>;
			if (graphicPreset) {
				element = buildGraphicElement({
					definitionId: graphicPreset.definitionId,
					name: graphicPreset.name,
					startTime: currentTime,
					params: graphicPreset.params,
					duration: graphicPreset.duration,
					animations: graphicPreset.animations,
				});
			} else {
				const { width: intrinsicWidth, height: intrinsicHeight } =
					await resolveStickerIntrinsicSize({ stickerId: item.id });
				element = buildStickerElement({
					stickerId: item.id,
					name: item.name,
					startTime: currentTime,
					intrinsicWidth,
					intrinsicHeight,
				});
			}

			editor.timeline.insertElement({
				placement: { mode: "auto" },
				element,
			});

			addToRecentStickers({ stickerId: item.id });
		} catch (error) {
			console.error("Failed to add sticker:", error);
			toast.error("Failed to add sticker to timeline");
		} finally {
			setIsAdding(false);
		}
	};

	const preview = (
		<div className="flex size-full items-center justify-center p-3">
			{hasImageError ? (
				<span className="text-muted-foreground text-center text-xs break-all">
					{displayName}
				</span>
			) : (
				<Image
					src={item.previewUrl}
					alt={displayName}
					width={64}
					height={64}
					className="size-full object-contain"
					style={
						shouldCapSize
							? {
									maxWidth: "var(--sticker-max, 160px)",
									maxHeight: "var(--sticker-max, 160px)",
								}
							: undefined
					}
					onError={() => setImageErrorItemId(item.id)}
					loading="lazy"
					unoptimized
				/>
			)}
		</div>
	);

	const dragData: TimelineDragData = graphicPreset
		? {
				id: item.id,
				type: "graphic",
				name: displayName,
				definitionId: graphicPreset.definitionId,
				params: graphicPreset.params ?? {},
				duration: graphicPreset.duration,
				animations: graphicPreset.animations,
			}
		: {
				id: item.id,
				type: "sticker",
				name: displayName,
				stickerId: item.id,
			};

	return (
		<div
			className={cn(
				"group relative",
				isAdding && "pointer-events-none opacity-50",
			)}
		>
			<DraggableItem
				name={displayName}
				preview={preview}
				dragData={dragData}
				onAddToTimeline={handleAdd}
				aspectRatio={1}
				shouldShowLabel={false}
				isRounded
				variant="card"
				containerClassName={containerClassName ?? "w-full"}
			/>
			{isAdding && (
				<div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/60">
					<Spinner className="size-6 text-white" />
				</div>
			)}
		</div>
	);
}
