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
import { useChatStore } from "@/agent/chat/store";
import { Bot, ChevronsLeft, ChevronsRight } from "lucide-react";
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
import type { AgentPanelMode } from "@/editor/panel-store";
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
	const { copy } = useAppLocale();
	usePasteMedia();
	const {
		panels,
		setPanel,
		agentPanelOpen,
		agentPanelMode,
		setAgentPanelOpen,
		setAgentPanelMode,
	} = usePanelStore();
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const isAgentRunning = useChatStore((state) => state.isLoading);
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

	if (agentPanelOpen && agentPanelMode === "push") {
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
					<AgentPanelFrame
						mode={agentPanelMode}
						disabled={isAgentRunning}
						onClose={() => setAgentPanelOpen(false)}
						onModeChange={setAgentPanelMode}
					/>
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

	return (
		<div className="relative size-full">
			<EditorWorkspace className="px-3 pb-3" {...workspaceProps} />
			{agentPanelOpen && agentPanelMode === "drawer" && (
				<div className="absolute bottom-3 left-3 top-0 z-40 w-[min(460px,calc(100%-1.5rem))]">
					<AgentPanelFrame
						mode={agentPanelMode}
						disabled={isAgentRunning}
						onClose={() => setAgentPanelOpen(false)}
						onModeChange={setAgentPanelMode}
						className="shadow-2xl shadow-foreground/10"
					/>
				</div>
			)}
			{!agentPanelOpen && (
				<button
					type="button"
					onClick={() => setAgentPanelOpen(true)}
					className="absolute left-4 top-3 z-30 flex h-9 items-center gap-2 rounded-sm border border-cyan-300/20 bg-background/95 px-3 text-sm font-medium text-foreground shadow-lg shadow-cyan-950/30 backdrop-blur transition-colors hover:border-cyan-300/45 hover:bg-accent"
					aria-label={copy.editor.agentPanel.expand}
					title={copy.editor.agentPanel.expand}
				>
					<ChevronsRight size={16} />
					<Bot size={16} />
					<span>Agent</span>
				</button>
			)}
		</div>
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

function AgentPanelFrame({
	mode,
	disabled = false,
	onClose,
	onModeChange,
	className,
}: {
	mode: AgentPanelMode;
	disabled?: boolean;
	onClose: () => void;
	onModeChange: (mode: AgentPanelMode) => void;
	className?: string;
}) {
	const { copy } = useAppLocale();
	const agentCopy = copy.editor.agentPanel;

	return (
		<section
			className={cn(
				"panel agent-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-sm border border-cyan-700/15 bg-background text-foreground shadow-[0_24px_90px_rgba(14,116,144,0.12)] dark:border-cyan-300/15 dark:shadow-[0_24px_90px_rgba(0,0,0,0.28)]",
				className,
			)}
		>
			<div className="shrink-0 border-b border-cyan-700/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.1),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.36),transparent)] px-3 py-3 dark:border-cyan-300/10 dark:bg-[linear-gradient(135deg,rgba(34,211,238,0.09),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="flex size-8 items-center justify-center rounded-sm border border-cyan-700/25 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-300/10 dark:text-cyan-200">
								<Bot size={17} />
							</span>
							<div className="min-w-0">
								<p className="text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
									{agentCopy.kicker}
								</p>
								<h2 className="truncate text-sm font-semibold text-foreground">
									{agentCopy.title}
								</h2>
							</div>
						</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
							<span className="rounded-sm border border-cyan-700/15 bg-cyan-500/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-cyan-700 dark:border-cyan-300/15 dark:bg-cyan-300/10 dark:text-cyan-200">
								{agentCopy.context}
							</span>
							<span className="rounded-sm border border-amber-700/15 bg-amber-500/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-amber-700 dark:border-amber-300/15 dark:bg-amber-300/10 dark:text-amber-200">
								{agentCopy.tools}
							</span>
							<span className="rounded-sm border border-emerald-700/15 bg-emerald-500/10 px-1.5 py-0.5 text-[0.66rem] font-medium text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
								{agentCopy.timeline}
							</span>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<div className="flex rounded-sm border border-border bg-muted/60 p-0.5">
							<button
								type="button"
								onClick={() => onModeChange("push")}
								disabled={disabled}
								title={
									disabled ? agentCopy.runningModeTitle : agentCopy.pushTitle
								}
								className={cn(
									"rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
									mode === "push" &&
										"bg-background text-cyan-700 shadow-sm shadow-cyan-950/10 dark:text-cyan-100 dark:shadow-cyan-950/30",
									disabled &&
										"cursor-not-allowed opacity-45 hover:text-muted-foreground",
								)}
							>
								{agentCopy.push}
							</button>
							<button
								type="button"
								onClick={() => onModeChange("drawer")}
								disabled={disabled}
								title={
									disabled ? agentCopy.runningModeTitle : agentCopy.drawerTitle
								}
								className={cn(
									"rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
									mode === "drawer" &&
										"bg-background text-cyan-700 shadow-sm shadow-cyan-950/10 dark:text-cyan-100 dark:shadow-cyan-950/30",
									disabled &&
										"cursor-not-allowed opacity-45 hover:text-muted-foreground",
								)}
							>
								{agentCopy.drawer}
							</button>
						</div>
						<button
							type="button"
							onClick={onClose}
							disabled={disabled}
							className={cn(
								"flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
								disabled &&
									"cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground",
							)}
							aria-label={agentCopy.collapse}
							title={disabled ? agentCopy.collapseRunning : agentCopy.collapse}
						>
							<ChevronsLeft size={16} />
						</button>
					</div>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<ChatPanel />
			</div>
		</section>
	);
}
