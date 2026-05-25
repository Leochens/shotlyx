"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";
import {
	tabs,
	useAssetsPanelStore,
	VISIBLE_TAB_KEYS,
} from "@/components/editor/panels/assets/assets-panel-store";

export function TabBar() {
	const { activeTab, setActiveTab } = useAssetsPanelStore();
	const [showStartFade, setShowStartFade] = useState(false);
	const [showEndFade, setShowEndFade] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const checkScrollPosition = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;

		const { scrollLeft, scrollWidth, clientWidth } = element;
		setShowStartFade(scrollLeft > 0);
		setShowEndFade(scrollLeft < scrollWidth - clientWidth - 1);
	}, []);

	useEffect(() => {
		const element = scrollRef.current;
		if (!element) return;

		checkScrollPosition();
		element.addEventListener("scroll", checkScrollPosition);

		const resizeObserver = new ResizeObserver(checkScrollPosition);
		resizeObserver.observe(element);

		return () => {
			element.removeEventListener("scroll", checkScrollPosition);
			resizeObserver.disconnect();
		};
	}, [checkScrollPosition]);

	return (
		<div className="bg-background/95 relative shrink-0 border-b border-cyan-300/10">
			<div
				ref={scrollRef}
				className="scrollbar-hidden relative flex min-h-11 items-center gap-1 overflow-x-auto px-2 py-1.5"
			>
				{VISIBLE_TAB_KEYS.map((tabKey) => {
					const tab = tabs[tabKey];
					return (
						<Tooltip key={tabKey} delayDuration={10}>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									aria-label={tab.label}
									className={cn(
										"size-8 shrink-0 rounded-md border transition-colors",
										activeTab === tabKey
											? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:bg-cyan-300/15"
											: "border-transparent text-muted-foreground hover:border-cyan-300/20 hover:bg-cyan-300/[0.06] hover:text-foreground",
									)}
									onClick={() => setActiveTab(tabKey)}
								>
									<tab.icon className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								align="center"
								variant="sidebar"
								sideOffset={6}
							>
								<div className="text-foreground text-sm leading-none font-medium">
									{tab.label}
								</div>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>

			<FadeOverlay direction="left" show={showStartFade} />
			<FadeOverlay direction="right" show={showEndFade} />
		</div>
	);
}

function FadeOverlay({
	direction,
	show,
}: {
	direction: "left" | "right";
	show: boolean;
}) {
	return (
		<div
			className={cn(
				"from-background pointer-events-none absolute top-0 bottom-0 w-8 to-transparent transition-opacity",
				show ? "opacity-100" : "opacity-0",
				direction === "left"
					? "left-0 bg-linear-to-r"
					: "right-0 bg-linear-to-l",
			)}
		/>
	);
}
