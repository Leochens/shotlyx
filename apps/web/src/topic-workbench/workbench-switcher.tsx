"use client";

import { Clapperboard, Lightbulb } from "lucide-react";
import { cn } from "@/utils/ui";
import { useTopicWorkbenchStore } from "./store";
import type { WorkbenchMode } from "./types";

const MODES: Array<{
	mode: WorkbenchMode;
	label: string;
	shortLabel: string;
	icon: typeof Clapperboard;
}> = [
	{
		mode: "video",
		label: "视频编辑工作台",
		shortLabel: "剪辑",
		icon: Clapperboard,
	},
	{
		mode: "topic",
		label: "选题管理工作台",
		shortLabel: "选题",
		icon: Lightbulb,
	},
];

export function WorkbenchSwitcher({ compact = false }: { compact?: boolean }) {
	const activeWorkbench = useTopicWorkbenchStore(
		(state) => state.activeWorkbench,
	);
	const setActiveWorkbench = useTopicWorkbenchStore(
		(state) => state.setActiveWorkbench,
	);

	return (
		<div
			className={cn(
				"inline-flex min-w-0 rounded-sm border border-border/80 bg-muted/35 p-0.5",
				compact ? "max-w-full" : "",
			)}
			role="tablist"
			aria-label="工作台切换"
		>
			{MODES.map(({ mode, label, shortLabel, icon: Icon }) => {
				const isActive = mode === activeWorkbench;
				return (
					<button
						key={mode}
						type="button"
						role="tab"
						aria-selected={isActive}
						onClick={() => setActiveWorkbench({ mode })}
						className={cn(
							"inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[3px] px-2 py-1 text-xs font-medium transition-colors",
							isActive
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:bg-accent hover:text-foreground",
						)}
						title={label}
					>
						<Icon size={13} />
						<span className={compact ? "hidden min-[390px]:inline" : ""}>
							{compact ? shortLabel : label}
						</span>
					</button>
				);
			})}
		</div>
	);
}

