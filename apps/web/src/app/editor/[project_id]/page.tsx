"use client";

import { useParams } from "next/navigation";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { MobileGate } from "@/components/editor/mobile-gate";
import { useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import { ChatPanel } from "@/agent/chat/panel";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
} from "@/preview/overlays";
import type {
	PreviewOverlayControl,
	PreviewOverlayInstance,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";

export default function Editor() {
	const params = useParams<{ project_id: string }>();
	const projectId = params.project_id;

	return (
		<MobileGate>
			<EditorProvider projectId={projectId}>
				<div className="editor-workbench flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
					<DegradedRendererBanner />
					<EditorHeader />
					<div className="min-h-0 min-w-0 flex-1">
						<EditorLayout />
					</div>
					<Onboarding />
					<MigrationDialog />
					<ChangelogNotification />
				</div>
			</EditorProvider>
		</MobileGate>
	);
}

function DegradedRendererBanner() {
	const { copy } = useAppLocale();
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="bg-accent border-b h-9 flex items-center justify-center gap-2 text-xs text-muted-foreground">
			<span>{copy.editor.chromeWarning}</span>
			<Button
				variant="text"
				size="icon"
				className="p-0 w-auto [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label={copy.editor.dismiss}
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

function EditorLayout() {
	usePasteMedia();
	const { panels, setPanel } = usePanelStore();
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);

	const agentPanelSize = Math.min(42, Math.max(18, panels.chat));
	const workspaceProps = {
		overlayControls,
		overlayInstances: overlaySource.instances,
		onOverlayVisibilityChange: setOverlayVisibility,
	};

	return (
		<ResizablePanelGroup
			direction="horizontal"
			className="size-full gap-[0.19rem] px-3 pb-3"
			onLayout={(sizes) => {
				setPanel({ panel: "chat", size: sizes[0] ?? agentPanelSize });
			}}
		>
			<ResizablePanel
				defaultSize={agentPanelSize}
				minSize={18}
				maxSize={42}
				className="min-h-0 min-w-[22rem]"
			>
				<AgentPanelFrame />
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={100 - agentPanelSize}
				minSize={50}
				className="min-h-0 min-w-0"
			>
				<EditorWorkspace {...workspaceProps} />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function EditorWorkspace({
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
	className,
}: {
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
	className?: string;
}) {
	const { panels, setPanel } = usePanelStore();

	return (
		<ResizablePanelGroup
			direction="vertical"
			className={cn("size-full gap-[0.18rem]", className)}
			onLayout={(sizes) => {
				setPanel({
					panel: "mainContent",
					size: sizes[0] ?? panels.mainContent,
				});
				setPanel({
					panel: "timeline",
					size: sizes[1] ?? panels.timeline,
				});
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem]"
					onLayout={(sizes) => {
						setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
						setPanel({
							panel: "preview",
							size: sizes[1] ?? panels.preview,
						});
						setPanel({
							panel: "properties",
							size: sizes[2] ?? panels.properties,
						});
					}}
				>
					<ResizablePanel
						defaultSize={panels.tools}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel
							overlayControls={overlayControls}
							overlayInstances={overlayInstances}
							onOverlayVisibilityChange={onOverlayVisibilityChange}
						/>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.properties}
						minSize={15}
						maxSize={40}
						className="min-w-0"
					>
						<PropertiesPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function AgentPanelFrame() {
	return (
		<section className="panel agent-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border/80 bg-background text-foreground">
			<div className="min-h-0 flex-1 overflow-hidden">
				<ChatPanel />
			</div>
		</section>
	);
}
