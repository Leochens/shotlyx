"use client";

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
import { getPropertiesConfig } from "./registry";
import { cn } from "@/utils/ui";
import { EmptyView } from "./empty-view";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import { ResourcePropertiesPanel } from "@/components/editor/panels/properties/resource-properties-panel";
import { createTimelineElementReference } from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import { usePanelStore } from "@/editor/panel-store";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAppLocale } from "@/i18n/use-app-locale";

export function PropertiesPanel() {
	const { copy } = useAppLocale();
	const propertiesCopy = copy.editor.properties;
	const editor = useEditor();
	useEditor((e) => e.scenes.getActiveSceneOrNull());
	useEditor((e) => e.media.getAssets());
	const { selectedElements } = useElementSelection();
	const { activeTabPerType, setActiveTab } = usePropertiesStore();
	const selectedAssetRefs = useAssetsPanelStore(
		(state) => state.selectedAssetRefs,
	);
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
		if (selectedAssetRefs.length > 0) {
			return (
				<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
					<ScrollArea className="flex-1 scrollbar-hidden">
						<ResourcePropertiesPanel selectedAssetRefs={selectedAssetRefs} />
					</ScrollArea>
				</div>
			);
		}

		return (
			<div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-sm border">
				<EmptyView />
			</div>
		);
	}

	if (selectedElements.length > 1) {
		return (
			<div className="panel bg-background flex h-full flex-col overflow-hidden rounded-sm border">
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
			</div>
		);
	}

	const mediaAssets = editor.media.getAssets();

	const elementsWithTracks = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const elementWithTrack = elementsWithTracks[0];

	if (!elementWithTrack) return null;

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

	if (!activeTab) return null;

	return (
		<div className="panel bg-background flex h-full overflow-hidden rounded-sm border">
			<TooltipProvider delayDuration={0}>
				<div className="flex shrink-0 flex-col gap-0.5 border-r p-1 scrollbar-hidden overflow-y-auto">
					{visibleTabs.map((tab) => (
						<Tooltip key={tab.id}>
							<TooltipTrigger asChild>
								<Button
									variant={tab.id === activeTab.id ? "secondary" : "ghost"}
									size="icon"
									onClick={() =>
										setActiveTab({
											elementType: element.type,
											tabId: tab.id,
										})
									}
									aria-label={tab.label}
									className={cn(
										"shrink-0",
										"h-8 w-8",
										tab.id !== activeTab.id && "text-muted-foreground",
									)}
								>
									{tab.icon}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">{tab.label}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</TooltipProvider>
			<div className="flex min-w-0 flex-1 flex-col">
				<InspectorAgentBar label={element.name} onAskAgent={handleAskAgent} />
				<ScrollArea className="min-h-0 flex-1 scrollbar-hidden">
					{activeTab.content({ trackId: track.id })}
				</ScrollArea>
			</div>
		</div>
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
		<div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-cyan-300/10 bg-cyan-300/[0.035] px-3 py-2">
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
