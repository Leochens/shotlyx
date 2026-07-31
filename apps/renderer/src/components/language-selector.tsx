"use client";

import { Check, Languages } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import { APP_LOCALES, isAppLocale } from "@/i18n/locales";
import { useAppLocale } from "@/i18n/use-app-locale";

interface LanguageSelectorProps {
	className?: string;
	showLabel?: boolean;
	align?: "start" | "center" | "end";
}

export function LanguageSelector({
	className,
	showLabel = true,
	align = "end",
}: LanguageSelectorProps) {
	const { locale, setLocale, copy, localeMeta } = useAppLocale();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size={showLabel ? "sm" : "icon"}
					variant="ghost"
					className={cn(
						showLabel ? "h-8 gap-2 px-2.5" : "size-8",
						"border border-border/70 bg-background/60 text-foreground/75 hover:bg-accent hover:text-foreground",
						className,
					)}
					aria-label={copy.preferences.language}
				>
					<Languages className="size-4" />
					{showLabel && (
						<span className="font-mono text-[0.68rem] uppercase tracking-[0.14em]">
							{localeMeta.nativeLabel}
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="w-44">
				<DropdownMenuLabel>{copy.preferences.language}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{APP_LOCALES.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onSelect={() => {
							if (isAppLocale(option.value)) setLocale(option.value);
						}}
						className="justify-between"
					>
						<span>{option.nativeLabel}</span>
						{locale === option.value && <Check className="size-4" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
