"use client";

import { useState } from "react";
import { Check, Palette, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";
import { BrandKitDialog } from "./brand-kit-dialog";
import type { ProjectBrandKit } from "../types";

export function BrandKitMenu({ className }: { className?: string }) {
	const { copy } = useAppLocale();
	const brandKitCopy = copy.editor.brandKit;
	const editor = useEditor();
	const brandKits = useEditor((currentEditor) =>
		currentEditor.project.getBrandKits(),
	);
	const activeBrandKit = useEditor((currentEditor) =>
		currentEditor.project.getActiveBrandKit(),
	);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingKit, setEditingKit] = useState<ProjectBrandKit | null>(null);
	const [dialogVersion, setDialogVersion] = useState(0);

	const openCreateDialog = () => {
		setEditingKit(null);
		setDialogVersion((version) => version + 1);
		setDialogOpen(true);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className={cn(
							"size-9 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
							activeBrandKit && "bg-primary/15 text-primary",
							className,
						)}
						aria-label={brandKitCopy.label}
						title={activeBrandKit?.name ?? brandKitCopy.label}
					>
						<Palette size={18} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-64">
					<DropdownMenuItem
						onClick={() => editor.project.setActiveBrandKit({ id: null })}
						className="h-9"
					>
						<span className="flex size-4 items-center justify-center">
							{!activeBrandKit ? <Check size={14} /> : null}
						</span>
						{brandKitCopy.noBrand}
					</DropdownMenuItem>
					{brandKits.map((kit) => (
						<DropdownMenuItem
							key={kit.id}
							onClick={() => editor.project.setActiveBrandKit({ id: kit.id })}
							onDoubleClick={() => {
								setEditingKit(kit);
								setDialogVersion((version) => version + 1);
								setDialogOpen(true);
							}}
							className="h-9"
						>
							<span className="flex size-4 items-center justify-center">
								{activeBrandKit?.id === kit.id ? <Check size={14} /> : null}
							</span>
							<span className="min-w-0 flex-1 truncate">{kit.name}</span>
							<span className="text-xs text-neutral-500">
								{kit.colors.length} {brandKitCopy.colorUnit}
							</span>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={openCreateDialog} className="h-9">
						<Plus size={14} />
						{brandKitCopy.create}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<BrandKitDialog
				key={`${dialogVersion}-${editingKit?.id ?? "new"}`}
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				kit={editingKit}
			/>
		</>
	);
}
