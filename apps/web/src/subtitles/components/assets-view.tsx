import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useMemo, useReducer, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type { CaptionChunk, TranscriptionLanguage } from "@/transcription/types";
import {
	getTimelineAudioRange,
	getTranscriptionAudioElementOptions,
	resolveSelectedTranscriptionAudioRange,
	type TranscriptionAudioRange,
	type TranscriptionAudioElementOption,
} from "@/transcription/audio-range";
import {
	CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS,
	DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER,
	type CaptionTranscriptionProvider,
	getCaptionProviderStartStep,
	isCaptionTranscriptionProvider,
} from "@/subtitles/caption-provider";
import { parseSubtitleFile } from "@/subtitles/parse";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import type { TProjectSubtitles } from "@/project/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import { createEmptyProjectSubtitles } from "@/subtitles/project-subtitles";
import { mediaTimeFromSeconds } from "@/wasm/media-time";
import {
	buildAsrDebugConfirmation,
	type AsrAudioRangeParams,
	type AsrDebugConfirmation,
	type AsrDebugConfirmationMode,
} from "./asr-debug-confirmation";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| { status: "idle"; error: string | null; warnings: string[] }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[] }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
};
const AUTO_AUDIO_RANGE_CHOICE = "auto";
const TIMELINE_AUDIO_RANGE_CHOICE = "timeline";

type AudioRangeChoice = typeof AUTO_AUDIO_RANGE_CHOICE | string;

const EMPTY_PROJECT_SUBTITLES = createEmptyProjectSubtitles();

function elementAudioRangeChoice({
	option,
}: {
	option: TranscriptionAudioElementOption;
}): string {
	return `element:${option.elementRef.trackId}:${option.elementRef.elementId}`;
}

function normalizeProjectSubtitles({
	subtitles,
}: {
	subtitles: TProjectSubtitles | null | undefined;
}): TProjectSubtitles {
	return subtitles ?? EMPTY_PROJECT_SUBTITLES;
}

function getCueDisplayTime({ cue }: { cue: SubtitleLayerCue }): string {
	const minutes = Math.floor(cue.startTime / 60);
	const seconds = Math.floor(cue.startTime % 60);
	const milliseconds = Math.round((cue.startTime % 1) * 1000);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
		2,
		"0",
	)}.${String(milliseconds).padStart(3, "0")}`;
}

function splitCueTextIntoClickableUnits({
	cue,
}: {
	cue: SubtitleLayerCue;
}): SubtitleToken[] {
	if (cue.tokens && cue.tokens.length > 0) {
		return cue.tokens;
	}
	return [{ text: cue.text, startTime: cue.startTime, duration: cue.duration }];
}

/* eslint-disable shotlyx/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return { status: "idle", error: null, warnings: action.warnings };
		case "fail":
			return { status: "idle", error: action.error, warnings: [] };
	}
}
/* eslint-enable shotlyx/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [selectedProvider, setSelectedProvider] =
		useState<CaptionTranscriptionProvider>(
			DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER,
		);
	const [audioRangeChoice, setAudioRangeChoice] = useState<AudioRangeChoice>(
		AUTO_AUDIO_RANGE_CHOICE,
	);
	const [asrDebugConfirmation, setAsrDebugConfirmation] =
		useState<AsrDebugConfirmation | null>(null);
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();
	const { selectedElements } = useElementSelection();
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const sceneTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const totalDuration = useEditor((e) => e.timeline.getTotalDuration());
	const projectSubtitles = useEditor((e) =>
		normalizeProjectSubtitles({
			subtitles: e.project.getActive().settings.subtitles,
		}),
	);

	const isProcessing = processing.status === "processing";
	const hasTranscript = projectSubtitles.cues.length > 0;

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);
	const selectedAudioRange = useMemo(
		() =>
			resolveSelectedTranscriptionAudioRange({
				selectedElements,
				elementsWithTracks: editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				}),
				mediaAssets,
			}),
		[editor, mediaAssets, selectedElements],
	);
	const timelineAudioRange = useMemo(
		() => getTimelineAudioRange({ totalDuration }),
		[totalDuration],
	);
	const audioElementOptions = useMemo(
		() =>
			getTranscriptionAudioElementOptions({
				tracks: sceneTracks,
				mediaAssets,
			}),
		[mediaAssets, sceneTracks],
	);

	const insertCaptions = async ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): Promise<boolean> => {
		const result = await editor.mcp.execute({
			toolName: "subtitles_import",
			params: {
				format: "cues",
				insertMode: "layer",
				cues: captions.map((caption) => ({
					text: caption.text,
					startTimeSeconds: caption.startTime,
					durationSeconds: caption.duration,
				})),
			},
		});
		if (result.status === "error") {
			throw new Error(result.error ?? "Subtitle import failed");
		}
		return true;
	};

	const getChosenAudioRange = (): TranscriptionAudioRange | null => {
		if (audioRangeChoice === AUTO_AUDIO_RANGE_CHOICE) {
			return selectedAudioRange;
		}
		if (audioRangeChoice === TIMELINE_AUDIO_RANGE_CHOICE) {
			return timelineAudioRange;
		}

		return (
			audioElementOptions.find(
				(option) => elementAudioRangeChoice({ option }) === audioRangeChoice,
			) ?? null
		);
	};

	const getAudioRangeForAsrDebugConfirmation = (): TranscriptionAudioRange => {
		return getChosenAudioRange() ?? timelineAudioRange;
	};

	const prepareAsrDebugConfirmation = ({
		mode,
	}: {
		mode: AsrDebugConfirmationMode;
	}) => {
		setAsrDebugConfirmation(
			buildAsrDebugConfirmation({
				mode,
				range: getAudioRangeForAsrDebugConfirmation(),
			}),
		);
	};

	const runGenerateTranscript = async ({
		audioRangeParams,
	}: {
		audioRangeParams: AsrAudioRangeParams;
	}) => {
		dispatch({
			type: "start",
			step: getCaptionProviderStartStep({ provider: selectedProvider }),
		});
		try {
			const result = await editor.mcp.execute({
				toolName: "subtitles_generate_from_video",
				params: {
					source: "timeline",
					provider: selectedProvider,
					language: selectedLanguage,
					style: "clean",
					placement: "bottom",
					...audioRangeParams,
				},
				onProgress: (event) => {
					if (event.status === "running") {
						dispatch({ type: "update_step", step: event.label });
					}
				},
			});
			if (result.status === "error") {
				dispatch({
					type: "fail",
					error: result.error ?? "Subtitle generation failed",
				});
				return;
			}

			setAsrDebugConfirmation(null);
			dispatch({ type: "succeed", warnings: [] });
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleGenerateTranscript = () => {
		prepareAsrDebugConfirmation({ mode: "transcript" });
	};

	const handleContinueAsrDebugConfirmation = async () => {
		const confirmation = asrDebugConfirmation;
		if (!confirmation) return;

		await runGenerateTranscript({
			audioRangeParams: confirmation.params,
		});
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			if (!(await insertCaptions({ captions: result.captions }))) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			dispatch({ type: "succeed", warnings: nextWarnings });
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			setAsrDebugConfirmation(null);
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
		setAsrDebugConfirmation(null);
	};

	const handleProviderChange = ({ value }: { value: string }) => {
		if (!isCaptionTranscriptionProvider(value)) return;
		setSelectedProvider(value);
		setAsrDebugConfirmation(null);
	};

	const updateProjectSubtitles = (updates: Partial<TProjectSubtitles>) => {
		const currentSubtitles =
			editor.project.getActive().settings.subtitles ??
			createEmptyProjectSubtitles();
		void editor.project.updateSettings({
			settings: {
				subtitles: {
					...currentSubtitles,
					...updates,
					updatedAt: new Date().toISOString(),
				},
			},
		});
	};

	const handleToggleProjectSubtitles = (enabled: boolean) => {
		updateProjectSubtitles({ enabled });
	};

	const handleCueTextChange = ({
		index,
		text,
	}: {
		index: number;
		text: string;
	}) => {
		updateProjectSubtitles({
			cues: projectSubtitles.cues.map((cue, cueIndex) =>
				cueIndex === index ? { ...cue, text } : cue,
			),
		});
	};

	const seekToSeconds = ({ seconds }: { seconds: number }) => {
		editor.playback.seek({ time: mediaTimeFromSeconds({ seconds }) });
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];

	return (
		<PanelView
			title="Transcript"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Recognition">
							<Select
								value={selectedProvider}
								onValueChange={(value) => handleProviderChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a provider" />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS.map((provider) => (
										<SelectItem key={provider.id} value={provider.id}>
											{provider.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
						<SectionField label="Audio Source">
							<Select
								value={audioRangeChoice}
								onValueChange={(value) => {
									setAudioRangeChoice(value);
									setAsrDebugConfirmation(null);
								}}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select audio source" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={AUTO_AUDIO_RANGE_CHOICE}>
										{selectedAudioRange
											? `Auto: ${selectedAudioRange.label}`
											: "Auto: Full timeline"}
									</SelectItem>
									<SelectItem value={TIMELINE_AUDIO_RANGE_CHOICE}>
										Full timeline mixed audio
									</SelectItem>
									{audioElementOptions.map((option) => (
										<SelectItem
											key={`${option.elementRef.trackId}:${option.elementRef.elementId}`}
											value={elementAudioRangeChoice({ option })}
										>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
					</SectionFields>

					<div className="min-h-0 flex-1 overflow-y-auto pr-1">
						<div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-border/70 bg-accent/25 px-3 py-2">
							<div className="min-w-0">
								<div className="text-sm font-medium">全局字幕</div>
								<div className="text-muted-foreground truncate text-xs">
									{hasTranscript
										? `${projectSubtitles.cues.length} 条字幕，不占用时间线轨道`
										: "生成或导入后会出现在这里"}
								</div>
							</div>
							<Switch
								checked={projectSubtitles.enabled}
								onCheckedChange={handleToggleProjectSubtitles}
								aria-label="字幕是否开启"
							/>
						</div>

						{hasTranscript ? (
							<div className="space-y-3" data-testid="global-transcript-list">
								{projectSubtitles.cues.map((cue, cueIndex) => (
									<div
										key={`${cue.startTime}:${cueIndex}`}
										className="rounded-md border border-border/70 bg-background/60 p-2.5"
									>
										<div className="mb-2 flex items-center justify-between gap-2">
											<button
												type="button"
												className="text-muted-foreground rounded-sm font-mono text-[0.7rem] hover:text-foreground"
												onClick={() =>
													seekToSeconds({ seconds: cue.startTime })
												}
											>
												{getCueDisplayTime({ cue })}
											</button>
											<span className="text-muted-foreground text-[0.7rem]">
												#{cueIndex + 1}
											</span>
										</div>
										<div className="mb-2 flex flex-wrap gap-x-1 gap-y-1">
											{splitCueTextIntoClickableUnits({ cue }).map(
												(token, tokenIndex) => (
													<button
														type="button"
														key={`${token.startTime}:${tokenIndex}:${token.text}`}
														className="rounded-sm px-0.5 text-left text-sm leading-6 text-foreground hover:bg-cyan-300/15 hover:text-cyan-100"
														onClick={() =>
															seekToSeconds({
																seconds: token.startTime,
															})
														}
													>
														{token.text}
													</button>
												),
											)}
										</div>
										<Textarea
											value={cue.text}
											onChange={(event) =>
												handleCueTextChange({
													index: cueIndex,
													text: event.target.value,
												})
											}
											className="min-h-16 text-sm"
											aria-label={`编辑第 ${cueIndex + 1} 条字幕`}
										/>
									</div>
								))}
							</div>
						) : (
							<div className="text-muted-foreground rounded-md border border-dashed border-border/70 px-3 py-8 text-center text-sm">
								暂无文字稿
							</div>
						)}
					</div>

					<div className="mt-auto space-y-2">
						{asrDebugConfirmation && !isProcessing && (
							<div className="rounded-md border border-cyan-500/25 bg-cyan-500/10 p-3">
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-muted-foreground text-xs">
											ASR debug check
										</div>
										<div className="truncate text-sm font-medium">
											{asrDebugConfirmation.label}
										</div>
										<div className="text-muted-foreground mt-1 text-xs">
											Start {asrDebugConfirmation.startLabel} / Duration{" "}
											{asrDebugConfirmation.durationLabel}
										</div>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setAsrDebugConfirmation(null)}
										>
											Cancel
										</Button>
										<Button
											type="button"
											size="sm"
											onClick={() =>
												void handleContinueAsrDebugConfirmation()
											}
										>
											Next
										</Button>
									</div>
								</div>
							</div>
						)}
						{isProcessing && (
							<div className="text-muted-foreground flex items-center gap-2 text-xs">
								<Spinner />
								<span>{processing.step}</span>
							</div>
						)}
						<Button
							type="button"
							className="w-full"
							onClick={handleGenerateTranscript}
							disabled={isProcessing || activeDiagnostics.length > 0}
						>
							Generate transcript
						</Button>
					</div>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
