"use client";

import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig, type PropertiesTabDef } from "./registry";
import { cn } from "@/utils/ui";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import type { SelectedAssetRef } from "@/components/editor/panels/assets/assets-panel-store";
import { ResourcePropertiesPanel } from "@/components/editor/panels/properties/resource-properties-panel";
import { EmptyView } from "@/components/editor/panels/properties/empty-view";
import { ProjectSubtitlePropertiesPanel } from "@/components/editor/panels/properties/project-subtitle-properties-panel";
import { createTimelineElementReference } from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import { usePanelStore } from "@/editor/panel-store";
import { Captions, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppLocale } from "@/i18n/use-app-locale";
import type { ElementRef } from "@/timeline/types";

function getSelectionKey({
	selectedElements,
	selectedAssetRefs,
}: {
	selectedElements: ElementRef[];
	selectedAssetRefs: SelectedAssetRef[];
}): string | null {
	if (selectedElements.length > 0) {
		return `elements:${selectedElements
			.map((item) => `${item.trackId}:${item.elementId}`)
			.sort()
			.join("|")}`;
	}

	if (selectedAssetRefs.length > 0) {
		return `assets:${selectedAssetRefs
			.map((item) => `${item.kind}:${item.id}`)
			.sort()
			.join("|")}`;
	}

	return null;
}

export function PropertiesPanel({ onCollapse }: { onCollapse?: () => void }) {
	const { selectedElements } = useElementSelection();
	const selectedAssetRefs = useAssetsPanelStore(
		(state) => state.selectedAssetRefs,
	);
	const inspectorFocus = usePropertiesStore((state) => state.inspectorFocus);
	const selectionKey = useMemo(
		() => getSelectionKey({ selectedElements, selectedAssetRefs }),
		[selectedAssetRefs, selectedElements],
	);

	return (
		<PropertiesPanelContent
			key={selectionKey ?? inspectorFocus ?? "empty"}
			selectedElements={selectedElements}
			selectedAssetRefs={selectedAssetRefs}
			inspectorFocus={inspectorFocus}
			onCollapse={onCollapse}
		/>
	);
}

function PropertiesPanelContent({
	selectedElements,
	selectedAssetRefs,
	inspectorFocus,
	onCollapse,
}: {
	selectedElements: ElementRef[];
	selectedAssetRefs: SelectedAssetRef[];
	inspectorFocus: "project-subtitles" | null;
	onCollapse?: () => void;
}) {
	const { copy } = useAppLocale();
	const propertiesCopy = copy.editor.properties;
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { activeTabPerType, setActiveTab } = usePropertiesStore();
	const addReference = useAgentContextStore((state) => state.addReference);
	const setAgentPanelOpen = usePanelStore((state) => state.setAgentPanelOpen);

	const addSelectedElementsToAgent = ({
		elements,
		label,
	}: {
		elements: typeof selectedElements;
		label: string;
	}) => {
		let count = 0;
		for (const item of elements) {
			const reference = createTimelineElementReference({
				editor,
				trackId: item.trackId,
				elementId: item.elementId,
				source: "manual-add",
			});
			if (!reference) continue;
			addReference(reference);
			count += 1;
		}
		if (count === 0) return;
		setAgentPanelOpen(true);
		toast.success(label);
	};

	if (selectedElements.length === 0) {
		if (inspectorFocus === "project-subtitles") {
			return (
				<PropertiesPanelFrame onCollapse={onCollapse}>
					<InspectorContextHeader
						icon={<Captions className="size-4" />}
						label="全局字幕"
						description="字幕颜色、位置与显示方式"
					/>
					<ScrollArea className="min-h-0 flex-1 scrollbar-hidden">
						<ProjectSubtitlePropertiesPanel />
					</ScrollArea>
				</PropertiesPanelFrame>
			);
		}

		if (selectedAssetRefs.length > 0) {
			return (
				<PropertiesPanelFrame onCollapse={onCollapse}>
					<ScrollArea className="min-h-0 flex-1 scrollbar-hidden">
						<ResourcePropertiesPanel selectedAssetRefs={selectedAssetRefs} />
					</ScrollArea>
				</PropertiesPanelFrame>
			);
		}

		return (
			<PropertiesPanelFrame onCollapse={onCollapse}>
				<EmptyView />
			</PropertiesPanelFrame>
		);
	}

	if (selectedElements.length > 1) {
		return (
			<PropertiesPanelFrame onCollapse={onCollapse}>
				<InspectorAgentBar
					label={`${selectedElements.length} ${propertiesCopy.selectedClips}`}
					onAskAgent={() =>
						addSelectedElementsToAgent({
							elements: selectedElements,
							label: propertiesCopy.addedSelectedClips,
						})
					}
				/>
				<div className="flex flex-1 items-center justify-center p-4 text-center">
					<p className="text-muted-foreground text-sm">
						{selectedElements.length} {propertiesCopy.elementsSelected}
					</p>
				</div>
			</PropertiesPanelFrame>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) {
		return (
			<PropertiesPanelFrame onCollapse={onCollapse}>
				<EmptyView />
			</PropertiesPanelFrame>
		);
	}

	const { element, track } = elementWithTrack;
	const handleAskAgent = () =>
		addSelectedElementsToAgent({
			elements: selectedElements,
			label: "已把当前片段加入 Agent 引用",
		});
	const config = getPropertiesConfig({ element, mediaAssets });
	const visibleTabs = config.tabs;

	const storedTabId = activeTabPerType[element.type];
	const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
	const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
	const activeTab =
		visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

	if (!activeTab) {
		return (
			<PropertiesPanelFrame onCollapse={onCollapse}>
				<EmptyView />
			</PropertiesPanelFrame>
		);
	}

	return (
		<PropertiesPanelFrame onCollapse={onCollapse}>
			<InspectorTabMenu
				activeTabId={activeTab.id}
				tabs={visibleTabs}
				onSelect={(tabId) =>
					setActiveTab({
						elementType: element.type,
						tabId,
					})
				}
			/>
			<InspectorAgentBar label={element.name} onAskAgent={handleAskAgent} />
			<ScrollArea className="min-h-0 flex-1 scrollbar-hidden">
				{activeTab.content({ trackId: track.id })}
			</ScrollArea>
		</PropertiesPanelFrame>
	);
}

function PropertiesPanelFrame({
	children,
	onCollapse,
}: {
	children: React.ReactNode;
	onCollapse?: () => void;
}) {
	return (
		<section className="panel relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-border/80 bg-background/92 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur">
			{onCollapse ? (
				<button
					type="button"
					aria-label="Collapse properties panel"
					onClick={onCollapse}
					className="absolute right-2 top-2 z-20 flex size-7 items-center justify-center rounded-md border border-cyan-300/14 bg-background/72 text-muted-foreground shadow-sm transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-foreground"
				>
					<ChevronRight className="size-3.5" />
				</button>
			) : null}
			{children}
		</section>
	);
}

function InspectorContextHeader({
	icon,
	label,
	description,
}: {
	icon: React.ReactNode;
	label: string;
	description: string;
}) {
	return (
		<div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-cyan-300/10 bg-cyan-300/[0.035] py-2 pl-3 pr-10">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-100">
				{icon}
			</div>
			<div className="min-w-0">
				<p className="truncate text-xs font-medium text-foreground">{label}</p>
				<p className="truncate text-[0.68rem] text-muted-foreground">
					{description}
				</p>
			</div>
		</div>
	);
}

export function CollapsedPropertiesPanel({
	onExpand,
}: {
	onExpand: () => void;
}) {
	return (
		<section className="panel flex h-full min-h-0 items-start justify-center overflow-hidden rounded-sm border border-border/80 bg-background/92 px-1.5 py-2 text-foreground backdrop-blur">
			<TooltipProvider delayDuration={200}>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Expand properties panel"
							className="size-8 rounded-md border border-cyan-300/14 text-muted-foreground hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-foreground"
							onClick={onExpand}
						>
							<ChevronLeft className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="left">Properties</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</section>
	);
}

function InspectorTabMenu({
	activeTabId,
	tabs,
	onSelect,
}: {
	activeTabId: string;
	tabs: PropertiesTabDef[];
	onSelect: (tabId: string) => void;
}) {
	return (
		<TooltipProvider delayDuration={0}>
			<div className="scrollbar-hidden flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-cyan-300/10 bg-background/45 px-2 py-1.5 pr-11">
				{tabs.map((tab) => {
					const active = tab.id === activeTabId;
					return (
						<Tooltip key={tab.id}>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onSelect(tab.id)}
									aria-label={tab.label}
									className={cn(
										"size-8 shrink-0 rounded-md border transition-colors",
										active
											? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-cyan-300/15"
											: "border-transparent text-muted-foreground hover:border-cyan-300/20 hover:bg-cyan-300/[0.06] hover:text-foreground",
									)}
								>
									<span className="flex size-4 items-center justify-center">
										{tab.icon}
									</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">{tab.label}</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
}

function InspectorAgentBar({
	label,
	onAskAgent,
}: {
	label: string;
	onAskAgent: () => void;
}) {
	return (
		<div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-cyan-300/10 bg-cyan-300/[0.035] py-2 pl-3 pr-10">
			<div className="min-w-0">
				<p className="truncate text-xs font-medium text-foreground">{label}</p>
				<p className="truncate text-[0.68rem] text-muted-foreground">
					把当前对象交给 Agent 作为上下文
				</p>
			</div>
			<button
				type="button"
				onClick={onAskAgent}
				className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-cyan-300/20 bg-cyan-300/10 px-2.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-300/20"
			>
				<Sparkles className="size-3.5" />
				Ask AI
			</button>
		</div>
	);
}
