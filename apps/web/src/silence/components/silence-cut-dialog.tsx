"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEditor } from "@/editor/use-editor";
import { useAppLocale } from "@/i18n/use-app-locale";
import {
	analyzeSilenceForElements,
	DEFAULT_SILENCE_DETECTION_OPTIONS,
	type SilenceAnalysisResult,
	type SilenceDetectionOptions,
} from "@/silence";
import { hasMediaId, type TimelineElement } from "@/timeline";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { mediaTimeToSeconds } from "@/wasm";

export function SilenceCutDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const { copy } = useAppLocale();
	const silenceCopy = copy.editor.silence;
	const { selectedElements } = useElementSelection();
	const [options, setOptions] = useState<SilenceDetectionOptions>(
		DEFAULT_SILENCE_DETECTION_OPTIONS,
	);
	const [result, setResult] = useState<SilenceAnalysisResult | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);

	const analyzableElements = useMemo(
		() =>
			editor.timeline
				.getElementsWithTracks({ elements: selectedElements })
				.filter(({ element }) => canAnalyzeElement(element)),
		[editor.timeline, selectedElements],
	);

	const segmentCount =
		result?.targets.reduce(
			(count, target) => count + target.segments.length,
			0,
		) ?? 0;
	const totalSeconds = result
		? mediaTimeToSeconds({ time: result.totalSilenceDuration })
		: 0;

	const updateOption = ({
		key,
		value,
	}: {
		key: keyof SilenceDetectionOptions;
		value: string;
	}) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) {
			return;
		}
		setOptions((current) => ({ ...current, [key]: parsed }));
		setResult(null);
	};

	const handleAnalyze = async () => {
		if (analyzableElements.length === 0) {
			toast.error(silenceCopy.noSelection);
			return;
		}

		setIsAnalyzing(true);
		try {
			const analysis = await analyzeSilenceForElements({
				elements: analyzableElements,
				mediaAssets: editor.media.getAssets(),
				options,
			});
			setResult(analysis);
			if (analysis.targets.length === 0) {
				toast.info(silenceCopy.noSegments);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : silenceCopy.analysisFailed,
			);
		} finally {
			setIsAnalyzing(false);
		}
	};

	const handleApply = () => {
		if (!result || segmentCount === 0) {
			return;
		}

		const didApply = editor.timeline.applySilenceCutPlan({
			targets: result.targets.map((target) => ({
				trackId: target.trackId,
				elementId: target.elementId,
				ranges: target.segments.map((segment) => ({
					startTime: segment.startTime,
					endTime: segment.endTime,
				})),
			})),
		});

		if (!didApply) {
			toast.info(silenceCopy.nothingApplied);
			return;
		}

		toast.success(
			silenceCopy.applied
				.replace("{count}", String(segmentCount))
				.replace("{seconds}", totalSeconds.toFixed(1)),
		);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl overflow-hidden rounded-md">
				<DialogHeader>
					<DialogTitle>{silenceCopy.title}</DialogTitle>
					<DialogDescription>{silenceCopy.description}</DialogDescription>
				</DialogHeader>
				<DialogBody className="gap-5">
					<div className="grid grid-cols-2 gap-3">
						<OptionField
							label={silenceCopy.threshold}
							value={options.thresholdDb}
							suffix="dB"
							onChange={(value) => updateOption({ key: "thresholdDb", value })}
						/>
						<OptionField
							label={silenceCopy.minSilence}
							value={options.minSilenceMs}
							suffix="ms"
							onChange={(value) => updateOption({ key: "minSilenceMs", value })}
						/>
						<OptionField
							label={silenceCopy.padding}
							value={options.paddingMs}
							suffix="ms"
							onChange={(value) => updateOption({ key: "paddingMs", value })}
						/>
						<OptionField
							label={silenceCopy.mergeGap}
							value={options.mergeGapMs}
							suffix="ms"
							onChange={(value) => updateOption({ key: "mergeGapMs", value })}
						/>
					</div>

					<div className="rounded-md border border-border/70 bg-muted/30 p-3">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-sm font-medium">
									{silenceCopy.selectedClips.replace(
										"{count}",
										String(analyzableElements.length),
									)}
								</div>
								<div className="text-muted-foreground mt-1 text-xs">
									{result
										? silenceCopy.result
												.replace("{count}", String(segmentCount))
												.replace("{seconds}", totalSeconds.toFixed(1))
										: silenceCopy.pending}
								</div>
							</div>
							<Button
								variant="secondary"
								size="sm"
								onClick={handleAnalyze}
								disabled={isAnalyzing || analyzableElements.length === 0}
							>
								{isAnalyzing ? silenceCopy.analyzing : silenceCopy.analyze}
							</Button>
						</div>

						{result && result.targets.length > 0 && (
							<div className="mt-3 max-h-36 space-y-2 overflow-auto pr-1">
								{result.targets.map((target) => (
									<div
										key={`${target.trackId}:${target.elementId}`}
										className="flex items-center justify-between gap-3 rounded-sm bg-background/70 px-2 py-1.5 text-xs"
									>
										<span className="truncate text-foreground/85">
											{target.elementName}
										</span>
										<span className="text-muted-foreground">
											{silenceCopy.segmentCount.replace(
												"{count}",
												String(target.segments.length),
											)}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						{silenceCopy.cancel}
					</Button>
					<Button
						variant="secondary"
						onClick={handleApply}
						disabled={!result || segmentCount === 0 || isAnalyzing}
					>
						{silenceCopy.apply}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function OptionField({
	label,
	value,
	suffix,
	onChange,
}: {
	label: string;
	value: number;
	suffix: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<Label>{label}</Label>
			<div className="relative">
				<Input
					type="number"
					size="sm"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="pr-10"
				/>
				<span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.65rem]">
					{suffix}
				</span>
			</div>
		</div>
	);
}

function canAnalyzeElement(element: TimelineElement): boolean {
	if (!hasMediaId(element)) {
		return false;
	}

	return element.type === "video" || element.type === "audio";
}
