"use client";

import { useMemo, useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";
import { cn } from "@/utils/ui";
import { ChevronDown, Search } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TextIcon } from "@hugeicons/core-free-icons";

interface FontPickerProps {
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

const FONT_NAMES = [...SYSTEM_FONTS].sort();

export function FontPicker({
	defaultValue,
	onValueChange,
	className,
}: FontPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const filteredFonts = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return FONT_NAMES;
		return FONT_NAMES.filter((name) => name.toLowerCase().includes(query));
	}, [search]);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) setSearch("");
			}}
		>
			<PopoverTrigger
				className={cn(
					"border-border bg-accent flex h-7 w-full cursor-pointer items-center justify-between gap-1 rounded-md border px-2.5 text-sm whitespace-nowrap focus-visible:border-primary focus-visible:ring-0 focus:outline-hidden",
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">
						<HugeiconsIcon icon={TextIcon} />
					</span>
					<span className="truncate" style={{ fontFamily: defaultValue }}>
						{defaultValue ?? "Select a font"}
					</span>
				</div>
				<ChevronDown className="size-3 shrink-0 opacity-50" />
			</PopoverTrigger>
			<PopoverContent
				className="w-72 overflow-hidden p-0"
				align="start"
				side="left"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					searchInputRef.current?.focus();
				}}
			>
				<div className="relative border-b px-3 py-2">
					<Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 opacity-50" />
					<Input
						ref={searchInputRef}
						placeholder="Search system fonts..."
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						size="xs"
						className="w-full border-none bg-transparent pl-5 shadow-none!"
					/>
				</div>
				<div className="max-h-72 overflow-y-auto py-1">
					{filteredFonts.map((fontName) => (
						<button
							key={fontName}
							type="button"
							className={cn(
								"flex h-10 w-full items-center px-3 text-left hover:bg-popover-hover",
								fontName === defaultValue && "bg-popover-hover",
							)}
							onClick={() => {
								onValueChange?.(fontName);
								setOpen(false);
							}}
						>
							<span
								className="truncate text-lg text-foreground/85"
								style={{ fontFamily: fontName }}
							>
								{fontName}
							</span>
						</button>
					))}
					{filteredFonts.length === 0 && (
						<div className="py-6 text-center text-sm text-muted-foreground">
							No system fonts found.
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
