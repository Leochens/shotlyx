"use client";

import { Button } from "../ui/button";
import { useRef, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import Link from "next/link";
import { RenameProjectDialog } from "@/project/components/rename-project-dialog";
import { DeleteProjectDialog } from "@/project/components/delete-project-dialog";
import { useRouter } from "next/navigation";
import { FaDiscord } from "react-icons/fa6";
import { ExportButton } from "./export-button";
import { ThemeToggle } from "../theme-toggle";
import { LanguageSelector } from "../language-selector";
import { SOCIAL_LINKS } from "@/site/social";
import { toast } from "sonner";
import { useEditor } from "@/editor/use-editor";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "@/actions/components/shortcuts-dialog";
import { CommandPaletteButton } from "@/actions/components/command-palette";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";
import { ShotlyxLogo } from "@/components/brand-logo";

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
				<ProjectDropdown />
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

function ProjectDropdown() {
	const { copy } = useAppLocale();
	const [openDialog, setOpenDialog] = useState<
		"delete" | "rename" | "shortcuts" | null
	>(null);
	const [isExiting, setIsExiting] = useState(false);
	const router = useRouter();
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());

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

	const handleSaveProjectName = async (newName: string) => {
		if (
			activeProject &&
			newName.trim() &&
			newName !== activeProject.metadata.name
		) {
			try {
				await editor.project.renameProject({
					id: activeProject.metadata.id,
					name: newName.trim(),
				});
			} catch (error) {
				toast.error(copy.editor.failedRename, {
					description:
						error instanceof Error ? error.message : copy.editor.tryAgain,
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	const handleDeleteProject = async () => {
		if (activeProject) {
			try {
				await editor.project.deleteProjects({
					ids: [activeProject.metadata.id],
				});
				router.push("/projects");
			} catch (error) {
				toast.error(copy.editor.failedDelete, {
					description:
						error instanceof Error ? error.message : copy.editor.tryAgain,
				});
			} finally {
				setOpenDialog(null);
			}
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="p-0.5 rounded-sm size-8"
					>
						<ShotlyxLogo
							size={28}
							className="drop-shadow-[0_0_14px_rgba(34,211,238,0.22)]"
							alt="Shotlyx project menu"
						/>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="z-100 w-44">
					<DropdownMenuItem
						onClick={handleExit}
						disabled={isExiting}
						icon={<HugeiconsIcon icon={Logout05Icon} />}
					>
						{copy.editor.exitProject}
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => setOpenDialog("shortcuts")}
						icon={<HugeiconsIcon icon={CommandIcon} />}
					>
						{copy.editor.shortcuts}
					</DropdownMenuItem>

					<DropdownMenuSeparator />

					<DropdownMenuItem asChild icon={<FaDiscord className="size-4!" />}>
						<Link
							href={SOCIAL_LINKS.discord}
							target="_blank"
							rel="noopener noreferrer"
						>
							Discord
						</Link>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<RenameProjectDialog
				isOpen={openDialog === "rename"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
				onConfirm={(newName) => handleSaveProjectName(newName)}
				projectName={activeProject?.metadata.name || ""}
			/>
			<DeleteProjectDialog
				isOpen={openDialog === "delete"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
				onConfirm={handleDeleteProject}
				projectNames={[activeProject?.metadata.name || ""]}
			/>
			<ShortcutsDialog
				isOpen={openDialog === "shortcuts"}
				onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
			/>
		</>
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
