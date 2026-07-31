"use client";

import { useSyncExternalStore, type MouseEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { useTheme } from "@/platform/theme";
import { cn } from "@/utils/ui";
import { useAppLocale } from "@/i18n/use-app-locale";

interface ThemeToggleProps {
	className?: string;
	iconClassName?: string;
	labelClassName?: string;
	showLabel?: boolean;
	onToggle?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle({
	className,
	iconClassName,
	labelClassName,
	showLabel = true,
	onToggle,
}: ThemeToggleProps) {
	const { theme, resolvedTheme, setTheme } = useTheme();
	const { copy } = useAppLocale();
	const mounted = useSyncExternalStore(
		subscribeToHydration,
		getClientSnapshot,
		getServerSnapshot,
	);

	const activeTheme = mounted ? (resolvedTheme ?? theme ?? "dark") : "light";
	const isDark = activeTheme === "dark";
	const Icon = isDark ? Moon : Sun;
	const label = mounted
		? isDark
			? copy.preferences.dark
			: copy.preferences.light
		: copy.preferences.theme;
	const nextLabel = !mounted
		? copy.preferences.theme
		: isDark
			? copy.preferences.switchToLight
			: copy.preferences.switchToDark;

	return (
		<Button
			size={showLabel ? "sm" : "icon"}
			variant="ghost"
			aria-label={nextLabel}
			title={nextLabel}
			className={cn(
				showLabel ? "h-8 gap-2 px-2.5" : "size-8",
				"border border-border/70 bg-background/60 text-foreground/75 hover:bg-accent hover:text-foreground",
				className,
			)}
			onClick={(e) => {
				setTheme(isDark ? "light" : "dark");
				onToggle?.(e);
			}}
		>
			<Icon className={cn("size-4", iconClassName)} />
			{showLabel && (
				<span
					className={cn(
						"font-mono text-[0.68rem] uppercase tracking-[0.14em]",
						labelClassName,
					)}
				>
					{label}
				</span>
			)}
		</Button>
	);
}
