"use client";

import Image from "@/platform/image";
import Link from "@/platform/link";
import { useRouter } from "@/platform/router";
import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { EditorCore } from "@/core";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { StoragePersistenceDialog } from "@/services/storage/components/storage-persistence-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { useProjectsStore } from "./store";
import type {
	TProjectMetadata,
	TProjectSortKey,
	TProjectSortOption,
	TProjectStage,
} from "@/project/types";
import { formatTimecode, mediaTimeToSeconds } from "opencut-wasm";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	Calendar04Icon,
	PlusSignIcon,
	Search01Icon,
	Video01Icon,
	MoreHorizontalIcon,
	Delete02Icon,
	Copy01Icon,
	Edit03Icon,
	ArrowDown02Icon,
	InformationCircleIcon,
	Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { OcVideoIcon } from "@/components/icons";
import { Label } from "@/components/ui/label";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { ProjectInfoDialog } from "@/project/components/project-info-dialog";
import { RenameProjectDialog } from "@/project/components/rename-project-dialog";
import { cn } from "@/utils/ui";
import { PRODUCT_NAME } from "@/site/brand";
import { ShotlyxLogo } from "@/components/brand-logo";
import { useTopicWorkbenchStore } from "@/topic-workbench/store";
const formatProjectDuration = ({
	duration,
}: {
	duration: number | undefined;
}): string | null => {
	if (duration === undefined) {
		return null;
	}

	const durationSeconds = mediaTimeToSeconds({ time: duration });
	const format = durationSeconds >= 3600 ? "HH:MM:SS" : "MM:SS";
	return formatTimecode({ time: duration, format }) ?? "";
};

const PROJECT_STAGE_OPTIONS = [
	{ value: "topic", label: "选题中" },
	{ value: "production", label: "制作中" },
	{ value: "review", label: "待发布" },
	{ value: "published", label: "已发布" },
] satisfies Array<{ value: TProjectStage; label: string }>;

const PROJECT_STAGE_STYLES: Record<TProjectStage, string> = {
	topic:
		"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200",
	production:
		"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
	review:
		"border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200",
	published:
		"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
};

const projectCreatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

function formatProjectCreatedAt({ date }: { date: Date }): string {
	return projectCreatedAtFormatter.format(date).replace(/\//g, "-");
}

export default function ProjectsPage() {
	const { searchQuery, sortKey, sortOrder } = useProjectsStore();
	const editor = useEditor();
	const sortOption: TProjectSortOption = `${sortKey}-${sortOrder}`;

	const isLoading = useEditor((e) => e.project.getIsLoading());
	const isInitialized = useEditor((e) => e.project.getIsInitialized());
	const projectsToDisplay = useEditor((e) =>
		e.project.getFilteredAndSortedProjects({ searchQuery, sortOption }),
	);

	useEffect(() => {
		if (!editor.project.getIsInitialized()) {
			editor.project.loadAllProjects();
		}
	}, [editor.project]);

	return (
		<div className="bg-background min-h-screen">
			<MigrationDialog />
			<StoragePersistenceDialog />
			<ProjectsHeader />
			<ProjectsToolbar projectIds={projectsToDisplay.map((p) => p.id)} />
			<main className="mx-auto flex w-full max-w-[1560px] flex-col gap-4 px-6 pt-5 pb-8">
				{isLoading || !isInitialized ? (
					<ProjectsSkeleton />
				) : projectsToDisplay.length === 0 ? (
					<EmptyState />
				) : (
					<div className="overflow-hidden bg-background">
						{projectsToDisplay.map((project) => (
							<ProjectItem
								key={project.id}
								project={project}
								allProjectIds={projectsToDisplay.map((p) => p.id)}
							/>
						))}
					</div>
				)}
			</main>
		</div>
	);
}

function ProjectsHeader() {
	return (
		<header className="electron-drag-region sticky top-0 z-20 flex flex-col gap-2 border-b bg-background px-8">
			<div className="mx-auto flex h-16 w-full max-w-[1560px] items-center justify-between pt-2">
				<div className="flex items-center gap-5">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link
										href="/"
										className="flex items-center gap-2 text-sm sm:text-base"
									>
										<ShotlyxLogo
											size={28}
											alt=""
											className="drop-shadow-[0_0_16px_rgba(34,211,238,0.2)]"
										/>
										<span className="font-medium">{PRODUCT_NAME}</span>
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage className="text-sm sm:text-base font-medium">
									项目管理
								</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</div>

				<div className="flex items-center gap-3 md:gap-4">
					<SearchBar className="hidden md:block" />
					<NewProjectButton />
					<Button asChild variant="outline">
						<Link href="/settings">设置</Link>
					</Button>
				</div>
			</div>
			<SearchBar className="mx-auto mb-4 block w-full max-w-[1560px] md:hidden" />
		</header>
	);
}

const SORT_LABELS: Record<TProjectSortKey, string> = {
	createdAt: "创建时间",
	updatedAt: "更新时间",
	name: "项目名",
	duration: "时长",
};

function ProjectsToolbar({ projectIds }: { projectIds: string[] }) {
	const {
		selectedProjectIds,
		sortKey,
		sortOrder,
		setSortOrder,
		setSelectedProjects,
		clearSelectedProjects,
	} = useProjectsStore();

	const selectedProjectCount = selectedProjectIds.length;
	const isAllSelected =
		projectIds.length > 0 && selectedProjectCount === projectIds.length;
	const hasSomeSelected =
		selectedProjectCount > 0 && selectedProjectCount < projectIds.length;

	const handleSelectAll = ({ checked }: { checked: boolean }) => {
		if (checked) {
			setSelectedProjects({ projectIds });
			return;
		}
		clearSelectedProjects();
	};

	return (
		<div className="bg-background/95">
			<div className="mx-auto flex h-14 w-full max-w-[1560px] items-center justify-between px-6">
				<div className="flex items-center gap-2">
					<Label
						className="flex items-center gap-3 cursor-pointer px-2"
						htmlFor="select-all-projects"
					>
						<Checkbox
							className="size-5"
							id="select-all-projects"
							checked={
								isAllSelected ? true : hasSomeSelected ? "indeterminate" : false
							}
							onCheckedChange={(checked) =>
								handleSelectAll({ checked: checked === true })
							}
						/>
						<span className="text-muted-foreground hidden md:block">全选</span>
					</Label>

					<div className="h-4 w-px bg-border/50" />

					<SortDropdown>
						<Button variant="text" className="text-muted-foreground pl-2">
							{SORT_LABELS[sortKey]}
						</Button>
					</SortDropdown>
					<Button
						variant="text"
						className="text-muted-foreground"
						onClick={() =>
							setSortOrder({
								sortOrder: sortOrder === "asc" ? "desc" : "asc",
							})
						}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								setSortOrder({
									sortOrder: sortOrder === "asc" ? "desc" : "asc",
								});
							}
						}}
						aria-label={`${SORT_LABELS[sortKey]}${
							sortOrder === "asc" ? "升序" : "降序"
						}`}
					>
						<HugeiconsIcon
							icon={ArrowDown02Icon}
							className={sortOrder === "asc" ? "rotate-180" : ""}
						/>
					</Button>
					<span className="text-muted-foreground hidden text-sm md:block">
						共 {projectIds.length} 个项目
					</span>
				</div>
				{selectedProjectCount > 0 ? <ProjectActions /> : null}
			</div>
		</div>
	);
}

function SearchBar({
	className,
	collapsed,
}: {
	className?: string;
	collapsed?: boolean;
}) {
	const { searchQuery, setSearchQuery } = useProjectsStore();

	return (
		<>
			{collapsed ? (
				<div className="block md:hidden">
					<Button
						size="icon"
						variant="outline"
						className="size-10.5 rounded-full"
					>
						<HugeiconsIcon icon={Search01Icon} />
					</Button>
				</div>
			) : (
				<div className={cn("relative", className)}>
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						placeholder="搜索项目"
						value={searchQuery}
						onChange={(event) => setSearchQuery({ query: event.target.value })}
						size="lg"
						className="pl-9"
					/>
				</div>
			)}
		</>
	);
}

const PROJECT_ACTIONS = [
	{
		id: "duplicate",
		label: "复制",
		icon: Copy01Icon,
		variant: "outline" as const,
	},
	{
		id: "delete",
		label: "删除",
		icon: Delete02Icon,
		variant: "destructive-foreground" as const,
	},
] as const;

async function deleteProjects({
	editor,
	ids,
}: {
	editor: EditorCore;
	ids: string[];
}) {
	await editor.project.deleteProjects({ ids });
}

async function duplicateProjects({
	editor,
	ids,
}: {
	editor: EditorCore;
	ids: string[];
}) {
	const sourceProjectIds = Array.from(new Set(ids));
	const duplicatedProjectIds = await editor.project.duplicateProjects({
		ids: sourceProjectIds,
	});
	useTopicWorkbenchStore.getState().duplicateEditorProjectTopicState({
		pairs: sourceProjectIds.flatMap((sourceEditorProjectId, index) => {
			const targetEditorProjectId = duplicatedProjectIds[index];
			if (!targetEditorProjectId) return [];
			return [{ sourceEditorProjectId, targetEditorProjectId }];
		}),
	});
}

async function renameProject({
	editor,
	id,
	name,
}: {
	editor: EditorCore;
	id: string;
	name: string;
}) {
	await editor.project.renameProject({ id, name });
}

function ProjectActions() {
	const editor = useEditor();
	const { selectedProjectIds, clearSelectedProjects } = useProjectsStore();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	const savedProjects = editor.project.getSavedProjects();
	const selectedProjectNames = savedProjects
		.filter((project) => selectedProjectIds.includes(project.id))
		.map((project) => project.name);

	const handleDuplicate = async () => {
		await duplicateProjects({ editor, ids: selectedProjectIds });
		clearSelectedProjects();
	};

	const handleDeleteClick = () => {
		setIsDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = async () => {
		await deleteProjects({ editor, ids: selectedProjectIds });
		clearSelectedProjects();
		setIsDeleteDialogOpen(false);
	};

	const actionHandlers: Record<string, () => void> = {
		duplicate: handleDuplicate,
		delete: handleDeleteClick,
	};

	return (
		<>
			<div className="flex items-center gap-2.5 px-3">
				<div className="hidden sm:flex items-center gap-2.5">
					{PROJECT_ACTIONS.map((action) => (
						<Button
							key={action.id}
							size="icon"
							variant={action.variant}
							className="size-9"
							onClick={actionHandlers[action.id]}
						>
							<HugeiconsIcon icon={action.icon} />
						</Button>
					))}
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild className="sm:hidden">
						<Button size="icon" variant="outline" className="size-9">
							<HugeiconsIcon icon={MoreHorizontalIcon} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{PROJECT_ACTIONS.map((action) => (
							<DropdownMenuItem
								key={action.id}
								variant={action.id === "delete" ? "destructive" : undefined}
								onClick={actionHandlers[action.id]}
							>
								<HugeiconsIcon icon={action.icon} />
								{action.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				projectNames={selectedProjectNames}
				onConfirm={handleDeleteConfirm}
			/>
		</>
	);
}

function SortDropdown({ children }: { children: React.ReactNode }) {
	const { sortKey, setSortKey } = useProjectsStore();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="center">
				<DropdownMenuCheckboxItem
					checked={sortKey === "createdAt"}
					onCheckedChange={() => setSortKey({ sortKey: "createdAt" })}
				>
					创建时间
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "updatedAt"}
					onCheckedChange={() => setSortKey({ sortKey: "updatedAt" })}
				>
					更新时间
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "name"}
					onCheckedChange={() => setSortKey({ sortKey: "name" })}
				>
					项目名
				</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem
					checked={sortKey === "duration"}
					onCheckedChange={() => setSortKey({ sortKey: "duration" })}
				>
					时长
				</DropdownMenuCheckboxItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NewProjectButton() {
	const editor = useEditor();
	const router = useRouter();

	const handleCreateProject = async () => {
		const projectId = await editor.project.createNewProject({
			name: "新项目",
		});
		router.push(`/editor/${projectId}`);
	};

	return (
		<Button
			size="lg"
			className="flex gap-2 px-5 md:px-6"
			onClick={handleCreateProject}
		>
			<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
			<span className="text-sm font-medium hidden md:block">新建项目</span>
			<span className="text-sm font-medium block md:hidden">新建</span>
		</Button>
	);
}

type ProjectOverviewMetadataUpdates = Partial<
	Pick<TProjectMetadata, "stage" | "note" | "tags">
>;

const EMPTY_PROJECT_ASSET_SUMMARY = {
	videoCount: 0,
	imageCount: 0,
	subtitleCount: 0,
};

function isProjectStage(value: string): value is TProjectStage {
	return PROJECT_STAGE_OPTIONS.some((option) => option.value === value);
}

function normalizeTagList({ tags }: { tags: string[] }): string[] {
	return Array.from(
		new Set(tags.map((tag) => tag.trim()).filter(Boolean)),
	).slice(0, 8);
}

function ProjectStatusSelect({
	stage,
	onStageChange,
	className,
}: {
	stage: TProjectStage;
	onStageChange: (stage: TProjectStage) => void;
	className?: string;
}) {
	return (
		<Select
			value={stage}
			onValueChange={(value) => {
				if (isProjectStage(value)) {
					onStageChange(value);
				}
			}}
		>
			<SelectTrigger
				variant="outline"
				className={cn(
					"h-8 w-full min-w-0 justify-between border px-2 text-xs font-medium",
					PROJECT_STAGE_STYLES[stage],
					className,
				)}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="start">
				{PROJECT_STAGE_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function ProjectNoteDialog({
	isOpen,
	onOpenChange,
	projectName,
	note,
	onConfirm,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	projectName: string;
	note?: string;
	onConfirm: (note: string) => void;
}) {
	const [draft, setDraft] = useState(note ?? "");

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setDraft(note ?? "");
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{note ? "编辑备注" : "添加备注"}</DialogTitle>
					<DialogDescription>
						备注会显示在项目标题下方，便于回顾这个项目的创作思路。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="gap-3">
					<Label className="line-clamp-1 text-muted-foreground">
						{projectName}
					</Label>
					<Textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						placeholder="暂无简介"
						className="min-h-28 bg-background"
					/>
				</DialogBody>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						取消
					</Button>
					<Button onClick={() => onConfirm(draft)}>保存备注</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function ProjectTagsEditor({
	project,
	onUpdate,
}: {
	project: TProjectMetadata;
	onUpdate: (updates: ProjectOverviewMetadataUpdates) => Promise<void>;
}) {
	const tags = project.tags ?? [];
	const [tagInput, setTagInput] = useState("");
	const [isAddingTag, setIsAddingTag] = useState(false);
	const tagInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isAddingTag) {
			tagInputRef.current?.focus();
		}
	}, [isAddingTag]);

	const addTag = async () => {
		const tag = tagInput.trim();
		if (!tag) return;
		const nextTags = normalizeTagList({ tags: [...tags, tag] });
		setTagInput("");
		setIsAddingTag(false);
		if (
			nextTags.length === tags.length &&
			nextTags.every((nextTag, index) => nextTag === tags[index])
		) {
			return;
		}
		await onUpdate({ tags: nextTags });
	};

	const removeTag = async ({ tag }: { tag: string }) => {
		await onUpdate({ tags: tags.filter((item) => item !== tag) });
	};

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			{tags.map((tag) => (
				<Badge
					key={tag}
					variant="outline"
					className="group/tag relative max-w-full rounded-sm bg-muted/35 px-2 py-1 font-medium"
					onContextMenu={(event) => {
						event.preventDefault();
						event.stopPropagation();
						void removeTag({ tag });
					}}
				>
					<span className="truncate">{tag}</span>
					<button
						type="button"
						className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border hover:text-foreground group-hover/tag:flex"
						aria-label={`移除标签 ${tag}`}
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							void removeTag({ tag });
						}}
					>
						<HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
					</button>
				</Badge>
			))}
			{isAddingTag ? (
				<Input
					ref={tagInputRef}
					value={tagInput}
					onChange={(event) => setTagInput(event.target.value)}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter") {
							event.preventDefault();
							void addTag();
						}
						if (event.key === "Escape") {
							setTagInput("");
							setIsAddingTag(false);
						}
					}}
					onBlur={() => {
						if (!tagInput.trim()) {
							setIsAddingTag(false);
						}
					}}
					placeholder="标签"
					size="xs"
					variant="outline"
					className="h-7 w-28 bg-background"
				/>
			) : (
				<Button
					size="icon"
					variant="outline"
					className="size-7 shrink-0 rounded-sm bg-muted/20"
					aria-label="添加标签"
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						setIsAddingTag(true);
					}}
				>
					<HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
				</Button>
			)}
		</div>
	);
}

function ProjectItem({
	project,
	allProjectIds,
}: {
	project: TProjectMetadata;
	allProjectIds: string[];
}) {
	const { selectedProjectIds, setProjectSelected, selectProjectRange } =
		useProjectsStore();
	const selectedProjectIdSet = new Set(selectedProjectIds);
	const isSelected = selectedProjectIdSet.has(project.id);
	const selectedProjectCount = selectedProjectIds.length;
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
	const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
	const editor = useEditor();
	const durationLabel = formatProjectDuration({ duration: project.duration });
	const isMultiSelect = selectedProjectCount > 1;
	const stage = project.stage ?? "topic";
	const assetSummary = project.assetSummary ?? EMPTY_PROJECT_ASSET_SUMMARY;

	const updateOverviewMetadata = async (
		updates: ProjectOverviewMetadataUpdates,
	) => {
		await editor.project.updateProjectOverviewMetadata({
			id: project.id,
			updates,
		});
	};

	const handleRename = () => setIsRenameDialogOpen(true);
	const handleDuplicate = async () => {
		await duplicateProjects({ editor, ids: [project.id] });
	};
	const handleDeleteClick = () => setIsDeleteDialogOpen(true);
	const handleInfoClick = () => setIsInfoDialogOpen(true);
	const handleNoteClick = () => setIsNoteDialogOpen(true);
	const handleDeleteConfirm = async () => {
		await deleteProjects({ editor, ids: [project.id] });
		setIsDeleteDialogOpen(false);
	};

	const handleCheckboxChange = ({
		checked,
		shiftKey,
	}: {
		checked: boolean;
		shiftKey: boolean;
	}) => {
		if (shiftKey && checked) {
			selectProjectRange({ projectId: project.id, allProjectIds });
			return;
		}
		setProjectSelected({ projectId: project.id, isSelected: checked });
	};

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						className={cn(
							"group flex gap-3 border-b border-border/60 px-1 py-5 transition-colors last:border-b-0 hover:bg-muted/15",
							isSelected && "bg-primary/5",
						)}
					>
						<Checkbox
							checked={isSelected}
							onMouseDown={(event) => event.preventDefault()}
							onClick={(event) => {
								handleCheckboxChange({
									checked: !isSelected,
									shiftKey: event.shiftKey,
								});
							}}
							onCheckedChange={() => {}}
							className="mt-1 size-5 shrink-0 sm:mt-[52px]"
						/>

						<div className="flex min-w-0 flex-1 gap-4">
							<Link
								href={`/editor/${project.id}`}
								className="relative hidden h-[124px] w-[220px] shrink-0 overflow-hidden rounded-sm bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:block"
							>
								{project.thumbnail ? (
									<Image
										src={project.thumbnail}
										alt="Project thumbnail"
										fill
										className="object-cover"
									/>
								) : (
									<div className="flex size-full items-center justify-center">
										<OcVideoIcon className="size-12 shrink-0 text-muted-foreground" />
									</div>
								)}
								<div className="absolute right-1.5 bottom-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
									{durationLabel ?? "00:00"}
								</div>
							</Link>

							<div className="flex min-w-0 flex-1 flex-col self-stretch py-1">
								<Link
									href={`/editor/${project.id}`}
									className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
								>
									<h3 className="line-clamp-2 text-base leading-snug font-medium text-foreground group-hover:text-foreground/90">
										{project.name}
									</h3>
								</Link>

								<p
									className={cn(
										"mt-2 line-clamp-2 max-w-3xl text-sm leading-6",
										project.note
											? "text-muted-foreground"
											: "text-muted-foreground/70",
									)}
								>
									{project.note || "暂无简介"}
								</p>

								<div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-3">
									<span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-sm bg-muted/35 px-2.5 text-xs font-medium text-muted-foreground">
										<span className="sm:hidden">
											{durationLabel ?? "00:00"}
										</span>
										<HugeiconsIcon
											icon={Calendar04Icon}
											className="size-3.5 shrink-0"
										/>
										<span className="truncate text-foreground">
											{formatProjectCreatedAt({ date: project.createdAt })}
										</span>
									</span>
									<span className="inline-flex h-7 items-center rounded-sm bg-muted/35 px-2.5 text-xs font-medium">
										素材数量 {assetSummary.videoCount + assetSummary.imageCount}
									</span>
									<ProjectStatusSelect
										stage={stage}
										className="h-7 w-[5.8rem]"
										onStageChange={(nextStage) => {
											void updateOverviewMetadata({ stage: nextStage });
										}}
									/>
									<ProjectTagsEditor
										project={project}
										onUpdate={updateOverviewMetadata}
									/>
								</div>
							</div>
						</div>

						<div className="flex items-start justify-end">
							{!isMultiSelect && (
								<ProjectMenu
									isOpen={isDropdownOpen}
									onOpenChange={setIsDropdownOpen}
									variant="list"
									onRenameClick={handleRename}
									onDuplicateClick={handleDuplicate}
									onDeleteClick={handleDeleteClick}
									onInfoClick={handleInfoClick}
									onNoteClick={handleNoteClick}
									hasNote={Boolean(project.note)}
								/>
							)}
						</div>
					</div>
				</ContextMenuTrigger>
				<ProjectContextMenuContent
					onRenameClick={handleRename}
					onDuplicateClick={handleDuplicate}
					onDeleteClick={handleDeleteClick}
					onInfoClick={handleInfoClick}
				/>
			</ContextMenu>

			<RenameProjectDialog
				isOpen={isRenameDialogOpen}
				onOpenChange={setIsRenameDialogOpen}
				projectName={project.name}
				onConfirm={async (newName) => {
					await renameProject({ editor, id: project.id, name: newName });
					setIsRenameDialogOpen(false);
				}}
			/>

			<DeleteProjectDialog
				isOpen={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				projectNames={[project.name]}
				onConfirm={handleDeleteConfirm}
			/>

			<ProjectInfoDialog
				isOpen={isInfoDialogOpen}
				onOpenChange={setIsInfoDialogOpen}
				project={project}
			/>

			<ProjectNoteDialog
				isOpen={isNoteDialogOpen}
				onOpenChange={setIsNoteDialogOpen}
				projectName={project.name}
				note={project.note}
				onConfirm={(nextNote) => {
					void updateOverviewMetadata({ note: nextNote });
					setIsNoteDialogOpen(false);
				}}
			/>
		</>
	);
}

function ProjectContextMenuContent({
	onRenameClick,
	onDuplicateClick,
	onDeleteClick,
	onInfoClick,
}: {
	onRenameClick: () => void;
	onDuplicateClick: () => void;
	onDeleteClick: () => void;
	onInfoClick: () => void;
}) {
	return (
		<ContextMenuContent>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={Edit03Icon} />}
				onClick={onRenameClick}
			>
				重命名
			</ContextMenuItem>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={Copy01Icon} />}
				onClick={onDuplicateClick}
			>
				复制
			</ContextMenuItem>
			<ContextMenuItem
				icon={<HugeiconsIcon icon={InformationCircleIcon} />}
				onClick={onInfoClick}
			>
				详情
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				variant="destructive"
				icon={<HugeiconsIcon icon={Delete02Icon} />}
				onClick={onDeleteClick}
			>
				删除
			</ContextMenuItem>
		</ContextMenuContent>
	);
}

function ProjectMenu({
	isOpen,
	onOpenChange,
	variant = "grid",
	onRenameClick,
	onDuplicateClick,
	onDeleteClick,
	onInfoClick,
	onNoteClick,
	hasNote,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	variant?: "grid" | "list";
	onRenameClick: () => void;
	onDuplicateClick: () => void;
	onDeleteClick: () => void;
	onInfoClick: () => void;
	onNoteClick: () => void;
	hasNote: boolean;
}) {
	const handleMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
	};

	const handleMenuKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
	};

	const handleRename = () => {
		onRenameClick();
		onOpenChange(false);
	};

	const handleDuplicate = () => {
		onDuplicateClick();
		onOpenChange(false);
	};

	const handleDeleteClick = () => {
		onDeleteClick();
		onOpenChange(false);
	};

	const handleInfoClick = () => {
		onInfoClick();
		onOpenChange(false);
	};

	const handleNoteClick = () => {
		onNoteClick();
		onOpenChange(false);
	};

	const isGrid = variant === "grid";

	return (
		<DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="background"
					className={
						isGrid
							? `absolute z-10 top-3 right-3 ${isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
							: "!bg-transparent !shadow-none"
					}
					size="icon"
					aria-label="项目菜单"
					onClick={handleMenuClick}
					onMouseDown={(event) => event.stopPropagation()}
					onKeyDown={handleMenuKeyDown}
				>
					<HugeiconsIcon
						icon={MoreHorizontalIcon}
						className="text-foreground"
						aria-hidden="true"
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-48" align="end">
				<DropdownMenuItem onClick={handleRename}>
					<HugeiconsIcon icon={Edit03Icon} />
					重命名
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleDuplicate}>
					<HugeiconsIcon icon={Copy01Icon} />
					复制
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleInfoClick}>
					<HugeiconsIcon icon={InformationCircleIcon} />
					详情
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleNoteClick}>
					<HugeiconsIcon icon={Edit03Icon} />
					{hasNote ? "编辑备注" : "添加备注"}
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onClick={handleDeleteClick}>
					<HugeiconsIcon icon={Delete02Icon} />
					删除
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ProjectsSkeleton() {
	const skeletonIds = Array.from(
		{ length: 8 },
		(_, index) => `skeleton-${index}`,
	);

	return (
		<div className="overflow-hidden bg-background">
			{skeletonIds.map((skeletonId) => (
				<div
					key={skeletonId}
					className="flex gap-3 border-b border-border/60 px-1 py-5 last:border-b-0"
				>
					<div className="flex min-w-0 flex-1 items-start gap-3">
						<Skeleton className="mt-1 size-5 shrink-0 sm:mt-[52px]" />
						<Skeleton className="hidden h-[124px] w-[220px] shrink-0 rounded-sm sm:block" />
						<div className="flex min-w-0 flex-1 flex-col gap-3 py-1">
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className="h-8 w-full max-w-3xl" />
							<div className="mt-auto flex flex-wrap gap-2 pt-3">
								<Skeleton className="h-7 w-36" />
								<Skeleton className="h-7 w-16" />
								<Skeleton className="h-7 w-16" />
								<Skeleton className="h-7 w-16" />
								<Skeleton className="h-7 w-24" />
								<Skeleton className="h-7 w-24" />
							</div>
						</div>
					</div>
					<Skeleton className="hidden size-8 shrink-0 lg:block" />
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	const { searchQuery, setSearchQuery } = useProjectsStore();
	const router = useRouter();
	const editor = useEditor();
	const savedProjects = editor.project.getSavedProjects();

	const handleCreateProject = async () => {
		try {
			const projectId = await editor.project.createNewProject({
				name: "新项目",
			});
			router.push(`/editor/${projectId}`);
		} catch (error) {
			toast.error("新建项目失败", {
				description: error instanceof Error ? error.message : "请稍后重试",
			});
		}
	};

	if (savedProjects.length > 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
				<div className="flex flex-col items-center gap-8">
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground size-16 bg-accent/35 border rounded-md p-4"
					/>
					<div className="flex flex-col items-center gap-3">
						<h3 className="text-lg font-medium">没有找到项目</h3>
						<p className="text-muted-foreground max-w-md">
							当前搜索“{searchQuery}”没有匹配结果。
						</p>
					</div>
				</div>
				<Button
					onClick={() => setSearchQuery({ query: "" })}
					variant="outline"
					size="lg"
				>
					清空搜索
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
			<div className="flex flex-col items-center gap-2">
				<div className="bg-muted/30 flex size-16 items-center justify-center rounded-full">
					<HugeiconsIcon
						icon={Video01Icon}
						className="text-muted-foreground size-8"
					/>
				</div>
				<h3 className="text-lg font-medium">还没有项目</h3>
				<p className="text-muted-foreground max-w-md">开始整理你的创作项目。</p>
			</div>
			<Button size="lg" className="gap-2" onClick={handleCreateProject}>
				<HugeiconsIcon icon={PlusSignIcon} />
				创建第一个项目
			</Button>
		</div>
	);
}
