"use client";

import { Check, Layers3, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
	SMART_MG_COMPOSITION_TEMPLATE_LABEL,
	SMART_MG_COMPOSITION_STYLE_GUIDE,
} from "@/shotlyx/remotion-components/composition-prompt";
import {
	listShotlyxMGTemplates,
	type ShotlyxMGTemplateId,
} from "@/shotlyx/remotion-components/template-registry";
import { cn } from "@/utils/ui";

export type MGTemplatePickerValue =
	| "smart-composition"
	| ShotlyxMGTemplateId;

export interface MGTemplatePickerOption {
	value: MGTemplatePickerValue;
	label: string;
	description: string;
	componentCount: number;
	styleGuide: string;
	templateMode: "auto" | "force";
	templateId?: ShotlyxMGTemplateId;
}

export function buildMGTemplatePickerOptions(): MGTemplatePickerOption[] {
	return [
		{
			value: "smart-composition",
			label: SMART_MG_COMPOSITION_TEMPLATE_LABEL,
			description: "自动拆分标题、重点、标注、表格等多个 MG 小组件。",
			componentCount: DEFAULT_MG_COMPOSITION_COMPONENT_COUNT,
			styleGuide: SMART_MG_COMPOSITION_STYLE_GUIDE,
			templateMode: "auto",
		},
		...listShotlyxMGTemplates().map((template) => ({
			value: template.id,
			label: template.name,
			description: template.description,
			componentCount: 1,
			styleGuide: template.description,
			templateMode: "force" as const,
			templateId: template.id,
		})),
	];
}

export function getMGTemplatePickerOption({
	value,
}: {
	value: MGTemplatePickerValue;
}): MGTemplatePickerOption {
	return (
		buildMGTemplatePickerOptions().find((option) => option.value === value) ??
		buildMGTemplatePickerOptions()[0]!
	);
}

export function MGTemplatePicker({
	value,
	onChange,
}: {
	value: MGTemplatePickerValue;
	onChange: (value: MGTemplatePickerValue) => void;
}) {
	const [open, setOpen] = useState(false);
	const options = buildMGTemplatePickerOptions();
	const selected = getMGTemplatePickerOption({ value });

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="h-9 shrink-0 rounded-sm px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label="选择 MG 模板"
					title="选择 MG 模板"
				>
					<Layers3 size={16} />
					<span className="max-w-28 truncate text-sm font-semibold">
						{selected.label}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="top"
				className="w-[min(44rem,calc(100vw-2rem))] p-3"
			>
				<div className="mb-3 flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-foreground">选择模板</div>
						<div className="text-xs text-muted-foreground">
							选定后会按该模板生成可编辑 Remotion MG。
						</div>
					</div>
					<Sparkles size={16} className="shrink-0 text-cyan-500" />
				</div>
				<div className="grid gap-2 sm:grid-cols-2">
					{options.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className={cn(
								"group grid min-w-0 grid-cols-[8.5rem_minmax(0,1fr)] gap-3 rounded-sm border p-2 text-left transition-colors",
								option.value === value
									? "border-primary/45 bg-primary/10"
									: "border-border/70 bg-background hover:border-cyan-300/35 hover:bg-accent/70",
							)}
						>
							<MGTemplatePreview templateId={option.value} />
							<span className="flex min-w-0 flex-col gap-1">
								<span className="flex min-w-0 items-center gap-2">
									<span className="truncate text-sm font-semibold text-foreground">
										{option.label}
									</span>
									{option.value === value ? (
										<Check size={14} className="shrink-0 text-primary" />
									) : null}
								</span>
								<span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
									{option.description}
								</span>
								<span className="text-[11px] font-medium text-muted-foreground">
									{option.templateMode === "force"
										? "内置模板"
										: `${option.componentCount} 个组件`}
								</span>
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function MGTemplatePreview({
	templateId,
}: {
	templateId: MGTemplatePickerValue;
}) {
	return (
		<div
			data-template-preview={templateId}
			className="relative h-20 overflow-hidden rounded-sm border border-white/10 bg-[#080c16] shadow-inner"
		>
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(88,166,255,.35),transparent_38%),linear-gradient(135deg,rgba(255,255,255,.08),transparent_42%)]" />
			{templateId === "smart-composition" ? <SmartPreview /> : null}
			{templateId === "title-reveal" ? <TitlePreview /> : null}
			{templateId === "metric-emphasis" ? <MetricPreview /> : null}
			{templateId === "annotation-callout" ? <AnnotationPreview /> : null}
			{templateId === "data-table" ? <TablePreview /> : null}
		</div>
	);
}

function PreviewText({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("absolute text-[10px] font-semibold text-white", className)}>
			{children}
		</span>
	);
}

function SmartPreview() {
	return (
		<>
			<div className="absolute left-3 top-3 h-2 w-16 rounded-full bg-cyan-300" />
			<div className="absolute left-3 top-8 h-8 w-14 rounded-sm border border-white/20 bg-white/10" />
			<div className="absolute left-[4.7rem] top-8 h-8 w-12 rounded-sm border border-emerald-300/40 bg-emerald-300/15" />
			<div className="absolute right-3 top-8 h-8 w-10 rounded-sm border border-amber-300/40 bg-amber-300/15" />
			<PreviewText className="bottom-2 left-3">组合</PreviewText>
		</>
	);
}

function TitlePreview() {
	return (
		<>
			<div className="absolute left-4 top-4 h-2 w-12 rounded-full border border-cyan-300/80" />
			<div className="absolute left-4 top-8 h-3 w-24 rounded-sm bg-white" />
			<div className="absolute left-4 top-12 h-2 w-16 rounded-sm bg-white/55" />
			<div className="absolute bottom-4 left-4 h-1 w-20 rounded-full bg-cyan-300" />
			<PreviewText className="right-3 top-3 text-cyan-200">标题</PreviewText>
		</>
	);
}

function MetricPreview() {
	return (
		<>
			<div className="absolute left-4 top-4 h-2 w-14 rounded-sm bg-emerald-300/80" />
			<PreviewText className="left-4 top-7 text-[22px] leading-none text-white">
				2026
			</PreviewText>
			<div className="absolute bottom-4 left-4 h-1 w-20 rounded-full bg-emerald-300" />
			<div className="absolute right-4 top-4 size-9 rounded-full border border-emerald-300/40 bg-emerald-300/10" />
		</>
	);
}

function AnnotationPreview() {
	return (
		<>
			<PreviewText className="left-4 top-7 text-sm">标注</PreviewText>
			<div className="absolute left-3 top-5 h-8 w-12 rounded-full border-2 border-amber-300" />
			<div className="absolute left-[4.4rem] top-9 h-0.5 w-10 rounded-full bg-amber-300" />
			<div className="absolute right-4 top-6 h-8 w-12 rounded-sm border border-white/20 bg-white/10" />
		</>
	);
}

function TablePreview() {
	return (
		<>
			<div className="absolute left-4 top-4 h-2 w-20 rounded-sm bg-sky-300" />
			{[0, 1, 2].map((index) => (
				<div
					key={index}
					className={cn(
						"absolute left-4 right-4 grid h-3 grid-cols-[1fr_.8fr_1.1fr] gap-1 rounded-[2px] px-1",
						index === 2 ? "bg-sky-300/25" : "bg-white/10",
					)}
					style={{ top: 30 + index * 13 }}
				>
					<span className="mt-1 h-1 rounded-full bg-white/60" />
					<span className="mt-1 h-1 rounded-full bg-white/45" />
					<span className="mt-1 h-1 rounded-full bg-white/35" />
				</div>
			))}
		</>
	);
}
