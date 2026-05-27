"use client";

import { Button } from "../ui/button";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { LanguageSelector } from "../language-selector";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "@/actions/components/shortcuts-dialog";
import { CommandPaletteButton } from "@/actions/components/command-palette";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";
import { ShotlyxLogo } from "@/components/brand-logo";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OcVideoIcon } from "@/components/icons";
import type { TProjectMetadata } from "@/project/types";
import { formatDate } from "@/utils/date";
import { formatTimecode, mediaTimeToSeconds } from "opencut-wasm";

const DEFAULT_EDITOR_PROJECT_TITLES = new Set([
	"",
	"New project",
	"New Project",
	"新建项目",
	"新建绘画",
]);

function getEditorProjectTitle(name: string): string {
	return DEFAULT_EDITOR_PROJECT_TITLES.has(name.trim()) ? "Agent" : name;
}

export function EditorHeader() {
	return (
		<header className="flex h-[3.4rem] items-center justify-between border-b border-cyan-300/10 bg-background px-3 pt-0.5 text-foreground">
			<div className="flex items-center gap-1">
				<ProjectSwitcher />
				<EditableProjectName />
			</div>
			<nav className="flex items-center gap-2">
				<CommandPaletteButton />
				<ExportButton />
				<LanguageSelector showLabel={false} />
				<ThemeToggle showLabel={false} />
			</nav>
		</header>
	);
}

const formatProjectDuration = ({
	duration,
}: {
	duration: number | undefined;
}): string | null => {
	if (duration === undefined) return null;
	const durationSeconds = mediaTimeToSeconds({ time: duration });
	const format = durationSeconds >= 3600 ? "HH:MM:SS" : "MM:SS";
	return formatTimecode({ time: duration, format }) ?? "";
};

function ProjectSwitcher() {
	const { copy } = useAppLocale();
	const [isProjectDialogOpen, setProjectDialogOpen] = useState(false);
	const [isShortcutsOpen, setShortcutsOpen] = useState(false);
	const [isExiting, setIsExiting] = useState(false);
	const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const savedProjects = useEditor((e) => e.project.getSavedProjects());
	const isProjectsInitialized = useEditor((e) => e.project.getIsInitialized());
	const isProjectsLoading = useEditor((e) => e.project.getIsLoading());

	useEffect(() => {
		if (!isProjectDialogOpen || isProjectsInitialized) return;
		editor.project.loadAllProjects();
	}, [editor.project, isProjectDialogOpen, isProjectsInitialized]);

	const projects = getProjectDialogItems({
		activeProject: activeProject?.metadata ?? null,
		savedProjects,
	});

	const handleExit = async () => {
		if (isExiting) return;
		setIsExiting(true);

		try {
			await editor.project.prepareExit();
			editor.project.closeProject();
		} catch (error) {
			console.error("Failed to prepare project exit:", error);
		} finally {
			editor.project.closeProject();
			router.push("/projects");
		}
	};

	const handleOpenProject = async (projectId: string) => {
		if (openingProjectId) return;
		if (projectId === activeProject?.metadata.id) {
			setProjectDialogOpen(false);
			return;
		}

		setOpeningProjectId(projectId);
		try {
			await editor.project.prepareExit();
			setProjectDialogOpen(false);
			router.push(`/editor/${projectId}`);
		} catch (error) {
			toast.error(copy.editor.projectSwitcher.failedOpen, {
				description:
					error instanceof Error ? error.message : copy.editor.tryAgain,
			});
		} finally {
			setOpeningProjectId(null);
		}
	};

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				className="p-0.5 rounded-sm size-8"
				aria-label={copy.editor.projectSwitcher.open}
				onClick={() => setProjectDialogOpen(true)}
			>
				<ShotlyxLogo
					size={28}
					className="drop-shadow-[0_0_14px_rgba(34,211,238,0.22)]"
					alt={copy.editor.projectSwitcher.logoAlt}
				/>
			</Button>
			<ProjectSwitcherDialog
				activeProjectId={activeProject?.metadata.id ?? null}
				isLoading={isProjectsLoading && projects.length === 0}
				open={isProjectDialogOpen}
				openingProjectId={openingProjectId}
				projects={projects}
				onExit={handleExit}
				onOpenChange={setProjectDialogOpen}
				onOpenProject={handleOpenProject}
				onOpenProjectsPage={() => {
					setProjectDialogOpen(false);
					router.push("/projects");
				}}
				onOpenShortcuts={() => setShortcutsOpen(true)}
			/>
			<ShortcutsDialog
				isOpen={isShortcutsOpen}
				onOpenChange={setShortcutsOpen}
			/>
		</>
	);
}

function getProjectDialogItems({
	activeProject,
	savedProjects,
}: {
	activeProject: TProjectMetadata | null;
	savedProjects: TProjectMetadata[];
}): TProjectMetadata[] {
	const projectsById = new Map<string, TProjectMetadata>();
	for (const project of savedProjects) {
		projectsById.set(project.id, project);
	}
	if (activeProject) {
		projectsById.set(activeProject.id, activeProject);
	}

	return Array.from(projectsById.values()).sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

function ProjectSwitcherDialog({
	activeProjectId,
	isLoading,
	open,
	openingProjectId,
	projects,
	onExit,
	onOpenChange,
	onOpenProject,
	onOpenProjectsPage,
	onOpenShortcuts,
}: {
	activeProjectId: string | null;
	isLoading: boolean;
	open: boolean;
	openingProjectId: string | null;
	projects: TProjectMetadata[];
	onExit: () => void;
	onOpenChange: (open: boolean) => void;
	onOpenProject: (projectId: string) => void;
	onOpenProjectsPage: () => void;
	onOpenShortcuts: () => void;
}) {
	const { copy } = useAppLocale();
	const switcherCopy = copy.editor.projectSwitcher;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden rounded-sm border-cyan-300/20 sm:max-w-[620px]">
				<DialogHeader className="gap-1">
					<DialogTitle>{switcherCopy.title}</DialogTitle>
					<DialogDescription>{switcherCopy.description}</DialogDescription>
				</DialogHeader>
				<DialogBody className="p-0">
					<ScrollArea className="max-h-[420px]">
						<div className="flex flex-col gap-1 p-3">
							{isLoading ? (
								<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
									{switcherCopy.loading}
								</div>
							) : projects.length === 0 ? (
								<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
									{switcherCopy.empty}
								</div>
							) : (
								projects.map((project) => (
									<ProjectSwitcherItem
										key={project.id}
										active={project.id === activeProjectId}
										disabled={openingProjectId !== null}
										isOpening={openingProjectId === project.id}
										project={project}
										onOpen={() => onOpenProject(project.id)}
									/>
								))
							)}
						</div>
					</ScrollArea>
				</DialogBody>
				<DialogFooter className="items-center justify-between gap-2 sm:flex-row">
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onOpenProjectsPage}
						>
							{switcherCopy.allProjects}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenShortcuts}
						>
							<HugeiconsIcon icon={CommandIcon} />
							{copy.editor.shortcuts}
						</Button>
					</div>
					<Button type="button" variant="ghost" size="sm" onClick={onExit}>
						<HugeiconsIcon icon={Logout05Icon} />
						{copy.editor.exitProject}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProjectSwitcherItem({
	active,
	disabled,
	isOpening,
	project,
	onOpen,
}: {
	active: boolean;
	disabled: boolean;
	isOpening: boolean;
	project: TProjectMetadata;
	onOpen: () => void;
}) {
	const { copy } = useAppLocale();
	const switcherCopy = copy.editor.projectSwitcher;
	const durationLabel = formatProjectDuration({ duration: project.duration });

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onOpen}
			className={cn(
				"flex min-w-0 items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-60",
				active
					? "border-cyan-300/35 bg-cyan-300/10"
					: "border-transparent hover:border-border hover:bg-accent/70",
			)}
		>
			<div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-muted">
				{project.thumbnail ? (
					<Image
						src={project.thumbnail}
						alt=""
						fill
						className="object-cover"
						unoptimized
					/>
				) : (
					<div className="flex size-full items-center justify-center">
						<OcVideoIcon className="size-6 text-muted-foreground" />
					</div>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<p className="truncate text-sm font-medium">{project.name}</p>
					{active ? (
						<span className="shrink-0 rounded-sm border border-cyan-300/25 bg-cyan-300/10 px-1.5 py-0.5 text-[0.65rem] font-medium text-cyan-600 dark:text-cyan-200">
							{switcherCopy.current}
						</span>
					) : null}
				</div>
				<div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<span className="truncate">
						{switcherCopy.updated} {formatDate({ date: project.updatedAt })}
					</span>
					{durationLabel ? (
						<>
							<span aria-hidden="true">/</span>
							<span>{durationLabel}</span>
						</>
					) : null}
				</div>
			</div>
			<span className="shrink-0 text-xs text-muted-foreground">
				{isOpening
					? switcherCopy.opening
					: active
						? switcherCopy.openProject
						: switcherCopy.switchProject}
			</span>
		</button>
	);
}

function EditableProjectName() {
	const { copy } = useAppLocale();
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const [isEditing, setIsEditing] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const originalNameRef = useRef("");

	const projectName = activeProject?.metadata.name || "";
	const displayProjectName = getEditorProjectTitle(projectName);

	const startEditing = () => {
		if (isEditing) return;
		originalNameRef.current = displayProjectName;
		setIsEditing(true);

		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	};

	const saveEdit = async () => {
		if (!inputRef.current || !activeProject) return;
		const newName = inputRef.current.value.trim();
		setIsEditing(false);

		if (!newName) {
			inputRef.current.value = originalNameRef.current;
			return;
		}

		if (newName !== originalNameRef.current) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName,
				});
			} catch (error) {
				toast.error(copy.editor.failedRename, {
					description:
						error instanceof Error ? error.message : copy.editor.tryAgain,
				});
			}
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter") {
			event.preventDefault();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			if (inputRef.current) {
				inputRef.current.value = originalNameRef.current;
				inputRef.current.setSelectionRange(0, 0);
			}
			setIsEditing(false);
			inputRef.current?.blur();
		}
	};

	return (
		<input
			ref={inputRef}
			type="text"
			key={activeProject?.metadata.id ?? "agent-title"}
			defaultValue={displayProjectName}
			readOnly={!isEditing}
			onClick={startEditing}
			onBlur={saveEdit}
			onKeyDown={handleKeyDown}
			style={{ fieldSizing: "content" }}
			className={cn(
				"text-[0.9rem] h-8 px-2 py-1 rounded-sm bg-transparent outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
				isEditing && "ring-1 ring-ring cursor-text hover:bg-transparent",
			)}
		/>
	);
}
