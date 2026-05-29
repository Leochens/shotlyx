"use client";

import { useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import {
	getExportMimeType,
	getExportFileExtension,
	downloadBuffer,
} from "@/export";
import {
	formatExportRemainingTime,
	formatExportSubProgressLabel,
	getExportSubProgressPercent,
} from "@/export/progress";
import { Check, Copy, Download, RotateCcw } from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportStage,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { useAppLocale } from "@/i18n/use-app-locale";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

function getExportStageLabel({
	dialogCopy,
	stage,
}: {
	dialogCopy: ReturnType<typeof useAppLocale>["copy"]["editor"]["exportDialog"];
	stage?: ExportStage;
}): string | null {
	if (stage === "preparing") return dialogCopy.stages.preparing;
	if (stage === "prerendering-mg") return dialogCopy.stages.prerenderingMG;
	if (stage === "mixing-audio") return dialogCopy.stages.mixingAudio;
	if (stage === "encoding") return dialogCopy.stages.encoding;
	return null;
}

export function ExportButton() {
	const { copy } = useAppLocale();
	const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const isExporting = useEditor((e) => e.project.getExportState().isExporting);
	const hasProject = !!activeProject;

	const handleDialogOpenChange = ({ open }: { open: boolean }) => {
		if (!open && isExporting) return;
		if (!open) {
			editor.project.clearExportState();
		}
		setIsExportDialogOpen(open);
	};

	return (
		<>
			<button
				type="button"
				className={cn(
					"inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-medium text-cyan-700 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/15 dark:text-cyan-100",
					hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
				)}
				aria-label={copy.editor.export}
				title={copy.editor.export}
				onClick={hasProject ? () => setIsExportDialogOpen(true) : undefined}
				disabled={!hasProject}
				onKeyDown={(event) => {
					if (hasProject && (event.key === "Enter" || event.key === " ")) {
						event.preventDefault();
						setIsExportDialogOpen(true);
					}
				}}
			>
				<HugeiconsIcon icon={TransitionTopIcon} className="size-3.5" />
				<span>{copy.editor.export}</span>
			</button>
			{hasProject && (
				<Dialog
					open={isExportDialogOpen}
					onOpenChange={(open) => handleDialogOpenChange({ open })}
				>
					<ExportDialog onOpenChange={setIsExportDialogOpen} />
				</Dialog>
			)}
		</>
	);
}

function ExportDialog({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const { copy } = useAppLocale();
	const editor = useEditor();
	const dialogCopy = copy.editor.exportDialog;
	const activeProject = useEditor((e) => e.project.getActive());
	const exportState = useEditor((e) => e.project.getExportState());
	const {
		estimatedRemainingSeconds,
		isExporting,
		progress,
		result: exportResult,
		stage,
		subProgress,
	} = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);

	const handleExport = async () => {
		if (!activeProject) return;

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: activeProject.settings.fps,
				includeAudio: shouldIncludeAudio,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			downloadBuffer({
				buffer: result.buffer,
				filename: `${activeProject.metadata.name}${getExportFileExtension({ format })}`,
				mimeType: getExportMimeType({ format }),
			});

			editor.project.clearExportState();
			onOpenChange(false);
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};
	const remainingTimeLabel = formatExportRemainingTime({
		copy: dialogCopy.subProgress.timeUnits,
		seconds: estimatedRemainingSeconds,
	});
	const subProgressLabel = subProgress
		? formatExportSubProgressLabel({
				copy: dialogCopy.subProgress,
				subProgress,
			})
		: null;
	const subProgressPercent = subProgress
		? getExportSubProgressPercent({ subProgress })
		: null;
	const subProgressStepLabel =
		subProgress &&
		typeof subProgress.stepIndex === "number" &&
		typeof subProgress.stepCount === "number"
			? `${dialogCopy.subProgress.mgSegment} ${subProgress.stepIndex + 1}/${subProgress.stepCount}`
			: null;
	const subProgressFrameLabel =
		subProgress &&
		typeof subProgress.current === "number" &&
		typeof subProgress.total === "number"
			? `${dialogCopy.subProgress.frame} ${subProgress.current}/${subProgress.total}`
			: null;
	const subProgressRemainingLabel = subProgress
		? formatExportRemainingTime({
				copy: dialogCopy.subProgress.timeUnits,
				seconds: subProgress.estimatedRemainingSeconds,
			})
		: null;

	return (
		<DialogContent
			className="max-w-md p-0"
			showCloseButton={!isExporting}
			onPointerDownOutside={(event) => {
				if (isExporting) event.preventDefault();
			}}
			onEscapeKeyDown={(event) => {
				if (isExporting) event.preventDefault();
			}}
		>
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || dialogCopy.unknownError}
					onRetry={handleExport}
				/>
			) : (
				<>
					<DialogHeader className="p-3">
						<DialogTitle className="text-sm">
							{isExporting ? copy.editor.exporting : copy.editor.export}
						</DialogTitle>
					</DialogHeader>

					<DialogBody className="flex flex-col gap-4 p-0">
						{!isExporting && (
							<>
								<div className="flex flex-col">
									<Section
										collapsible
										defaultOpen={false}
										showTopBorder={false}
									>
										<SectionHeader>
											<SectionTitle>{dialogCopy.format}</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">{dialogCopy.mp4}</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">{dialogCopy.webm}</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>{dialogCopy.quality}</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low">{dialogCopy.low}</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium">{dialogCopy.medium}</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high">{dialogCopy.high}</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high">
														{dialogCopy.veryHigh}
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>{dialogCopy.audio}</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
													onCheckedChange={(checked) =>
														setShouldIncludeAudio(!!checked)
													}
												/>
												<Label htmlFor="include-audio">
													{dialogCopy.includeAudio}
												</Label>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-3 pt-0">
									<Button onClick={handleExport} className="w-full gap-2">
										<Download className="size-4" />
										{copy.editor.export}
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<p className="text-muted-foreground text-xs">
										{getExportStageLabel({ dialogCopy, stage }) ??
											copy.editor.exporting}
									</p>
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{Math.round(progress * 100)}%
										</p>
										{remainingTimeLabel && (
											<p className="text-muted-foreground text-xs">
												{dialogCopy.subProgress.estimatedRemaining}{" "}
												{remainingTimeLabel}
											</p>
										)}
										<p className="text-muted-foreground text-sm">100%</p>
									</div>
									<Progress value={progress * 100} className="w-full" />
								</div>

								{subProgress && subProgressLabel && (
									<div className="rounded-md border border-border/60 bg-muted/20 p-2">
										<div className="flex items-center justify-between gap-3 text-xs">
											<p className="text-muted-foreground">
												{subProgressStepLabel ?? subProgress.label}
											</p>
											<p className="text-muted-foreground shrink-0">
												{subProgressPercent}%
											</p>
										</div>
										{subProgressStepLabel && subProgress.label && (
											<p
												className="text-muted-foreground mt-1 truncate text-xs"
												title={subProgressLabel}
											>
												{subProgress.label}
											</p>
										)}
										{(subProgressFrameLabel || subProgressRemainingLabel) && (
											<div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
												{subProgressFrameLabel && (
													<p className="text-muted-foreground">
														{subProgressFrameLabel}
													</p>
												)}
												{subProgressRemainingLabel && (
													<p className="text-muted-foreground shrink-0">
														{dialogCopy.subProgress.estimatedRemaining}{" "}
														{subProgressRemainingLabel}
													</p>
												)}
											</div>
										)}
										<Progress
											value={(subProgressPercent ?? 0)}
											className="mt-2 h-1.5 w-full"
										/>
									</div>
								)}

								<Button
									variant="outline"
									className="w-full rounded-md"
									onClick={handleCancel}
								>
									{dialogCopy.cancel}
								</Button>
							</div>
						)}
					</DialogBody>
				</>
			)}
		</DialogContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const { copy } = useAppLocale();
	const dialogCopy = copy.editor.exportDialog;
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">
					{dialogCopy.failed}
				</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					{dialogCopy.copy}
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					{dialogCopy.retry}
				</Button>
			</div>
		</div>
	);
}
