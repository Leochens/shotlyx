"use client";

import {
	Clapperboard,
	Image,
	Layers3,
	MessageSquare,
	Music,
	Palette,
	Sparkles,
	Video,
	X,
} from "lucide-react";
import type { AgentContextReference } from "@/agent/context/types";
import { formatReferenceForChip } from "@/agent/context/reference-format";
import { cn } from "@/utils/ui";

function ReferenceIcon({ reference }: { reference: AgentContextReference }) {
	if (reference.kind === "brand-kit") return <Palette size={14} />;
	if (reference.kind === "timeline-track") return <Layers3 size={14} />;
	if (reference.kind === "timeline-element") return <Sparkles size={14} />;
	if (reference.kind === "topic-workbench") return <MessageSquare size={14} />;
	if (reference.kind === "media-asset") {
		const type = reference.payload.type;
		if (type === "image") return <Image size={14} />;
		if (type === "audio") return <Music size={14} />;
		return <Video size={14} />;
	}
	return <Clapperboard size={14} />;
}

export function ReferenceChipList({
	references,
	primaryReferenceId,
	onRemove,
	onPrimaryChange,
	className,
}: {
	references: AgentContextReference[];
	primaryReferenceId?: string | null;
	onRemove?: (id: string) => void;
	onPrimaryChange?: (id: string) => void;
	className?: string;
}) {
	if (references.length === 0) return null;

	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{references.map((reference) => {
				const isPrimary = reference.id === primaryReferenceId;
				return (
					<div
						key={reference.id}
						onClick={() => onPrimaryChange?.(reference.id)}
						onKeyDown={(event) => {
							if (!onPrimaryChange) return;
							if (event.key !== "Enter" && event.key !== " ") return;
							event.preventDefault();
							onPrimaryChange(reference.id);
						}}
						role={onPrimaryChange ? "button" : undefined}
						tabIndex={onPrimaryChange ? 0 : undefined}
						className={cn(
							"group flex max-w-56 items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs",
							onPrimaryChange && "cursor-pointer",
							isPrimary
								? "border-neutral-500 bg-neutral-700 text-neutral-100"
								: "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600",
						)}
						title={formatReferenceForChip(reference)}
					>
						<span className="shrink-0 text-neutral-300">
							<ReferenceIcon reference={reference} />
						</span>
						<span className="min-w-0 truncate">
							{formatReferenceForChip(reference)}
						</span>
						{onRemove ? (
							<span
								role="button"
								tabIndex={0}
								className="ml-1 rounded p-0.5 opacity-50 hover:bg-neutral-600 hover:opacity-100"
								onClick={(event) => {
									event.stopPropagation();
									onRemove(reference.id);
								}}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									event.stopPropagation();
									onRemove(reference.id);
								}}
								aria-label="移除引用"
							>
								<X size={12} />
							</span>
						) : null}
					</div>
				);
			})}
		</div>
	);
}
