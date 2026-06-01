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
import { resolveStickerIntrinsicSize } from "@/stickers";
import {
	buildGraphicElement,
	buildStickerElement,
} from "@/timeline/element-utils";
import { STICKER_CATEGORIES } from "@/stickers/categories";
import { getRegionLabel, resolveQueryToRegions } from "@/stickers";
import { getGraphicStickerPreset } from "@/stickers/graphic-sticker";
import type { TimelineDragData } from "@/timeline/drag";
import type {
	StickerBrowseSection,
	StickerCategory,
	StickerItem as StickerData,
} from "@/stickers";
import { useStickersStore } from "@/stickers/stickers-store";
import { cn } from "@/utils/ui";
import { HappyIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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

function RegionBanner({ region }: { region: string }) {
	return (
		<div className="flex h-7 items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50 px-2">
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="shrink-0 text-sky-600"
				aria-hidden="true"
			>
				<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
				<circle cx="12" cy="10" r="3" />
			</svg>
			<span className="text-xs font-semibold text-sky-600">{region}</span>
		</div>
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
			const normalizedQuery = searchQuery.trim().toLowerCase();
			const isRegionSearch =
				effectiveSelectedCategory === "flags" &&
				resolveQueryToRegions({ query: normalizedQuery }) !== null;
			const regionLabel = getRegionLabel({ query: normalizedQuery });
			const total = searchResults?.total ?? 0;

			return (
				<div className="flex flex-col gap-3 pb-4">
					{isRegionSearch && <RegionBanner region={regionLabel} />}
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
