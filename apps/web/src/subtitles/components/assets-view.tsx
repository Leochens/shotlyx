import { Button } from "@/components/ui/button";
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
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type { CaptionChunk, TranscriptionLanguage } from "@/transcription/types";
import {
	audioRangeToSeconds,
	type TranscriptionAudioTrackOption,
	getTranscriptionAudioTrackOptions,
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
import type { TProjectSubtitleTrack, TProjectSubtitles } from "@/project/types";
import type { SubtitleLayerCue, SubtitleToken } from "@/subtitles/types";
import { createEmptyProjectSubtitles } from "@/subtitles/project-subtitles";
import { mediaTimeFromSeconds } from "@/wasm/media-time";

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
const EMPTY_PROJECT_SUBTITLES = createEmptyProjectSubtitles();
const LEGACY_TRANSCRIPT_TRACK_ID = "track:global";

function audioTrackChoiceId({
	option,
}: {
	option: TranscriptionAudioTrackOption;
}): string {
	return `track:${option.trackRef.trackId}`;
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

function getStoredTranscriptTracks({
	subtitles,
}: {
	subtitles: TProjectSubtitles;
}): TProjectSubtitleTrack[] {
	if (subtitles.tracks && subtitles.tracks.length > 0) {
		return subtitles.tracks;
	}
	if (subtitles.cues.length === 0) return [];
	return [
		{
			id: LEGACY_TRANSCRIPT_TRACK_ID,
			label: "全局字幕",
			cues: subtitles.cues,
			...(subtitles.assetId
				? {
						assetId: subtitles.assetId,
						...(subtitles.assetName ? { assetName: subtitles.assetName } : {}),
					}
				: {}),
			updatedAt: subtitles.updatedAt,
		},
	];
}

function buildTranscriptTrackChoices({
	audioTrackOptions,
	storedTracks,
}: {
	audioTrackOptions: TranscriptionAudioTrackOption[];
	storedTracks: TProjectSubtitleTrack[];
}): TProjectSubtitleTrack[] {
	const storedById = new Map(storedTracks.map((track) => [track.id, track]));
	const choices = audioTrackOptions.map((option) => {
		const id = audioTrackChoiceId({ option });
		return (
			storedById.get(id) ?? {
				id,
				label: option.label,
				cues: [],
				sourceTrackId: option.trackRef.trackId,
			}
		);
	});
	for (const track of storedTracks) {
		if (!choices.some((choice) => choice.id === track.id)) {
			choices.push(track);
		}
	}
	return choices;
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
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const sceneTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const projectSubtitles = useEditor((e) =>
		normalizeProjectSubtitles({
			subtitles: e.project.getActive().settings.subtitles,
		}),
	);

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);
	const audioTrackOptions = useMemo(
		() =>
			getTranscriptionAudioTrackOptions({
				tracks: sceneTracks,
				mediaAssets,
			}),
		[mediaAssets, sceneTracks],
	);
	const storedTranscriptTracks = useMemo(
		() => getStoredTranscriptTracks({ subtitles: projectSubtitles }),
		[projectSubtitles],
	);
	const transcriptTrackChoices = useMemo(
		() =>
			buildTranscriptTrackChoices({
				audioTrackOptions,
				storedTracks: storedTranscriptTracks,
			}),
		[audioTrackOptions, storedTranscriptTracks],
	);
	const selectedTrackId =
		projectSubtitles.selectedTrackId ??
		transcriptTrackChoices[0]?.id ??
		LEGACY_TRANSCRIPT_TRACK_ID;
	const selectedTranscriptTrack =
		transcriptTrackChoices.find((track) => track.id === selectedTrackId) ??
		transcriptTrackChoices[0] ??
		null;
	const hasTranscript = (selectedTranscriptTrack?.cues.length ?? 0) > 0;

	const insertCaptions = async ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): Promise<boolean> => {
		const selectedAudioTrack = audioTrackOptions.find(
			(option) => audioTrackChoiceId({ option }) === selectedTrackId,
		);
		const result = await editor.mcp.execute({
			toolName: "subtitles_import",
			params: {
				format: "cues",
				insertMode: "project",
				cues: captions.map((caption) => ({
					text: caption.text,
					startTimeSeconds: caption.startTime,
					durationSeconds: caption.duration,
				})),
				...(selectedAudioTrack
					? {
							sourceTrackId: selectedAudioTrack.trackRef.trackId,
							sourceTrackName: selectedAudioTrack.label,
						}
					: {}),
			},
		});
		if (result.status === "error") {
			throw new Error(result.error ?? "Subtitle import failed");
		}
		return true;
	};

	const runGenerateAllTranscripts = async () => {
		if (audioTrackOptions.length === 0) {
			dispatch({
				type: "fail",
				error: "No audio tracks were found for transcription",
			});
			return;
		}
		dispatch({
			type: "start",
			step: getCaptionProviderStartStep({ provider: selectedProvider }),
		});
		try {
			for (const [index, audioTrack] of audioTrackOptions.entries()) {
				const { startTimeSeconds, durationSeconds } = audioRangeToSeconds({
					range: audioTrack,
				});
				dispatch({
					type: "update_step",
					step: `识别 ${index + 1}/${audioTrackOptions.length}: ${audioTrack.label}`,
				});
				const result = await editor.mcp.execute({
					toolName: "subtitles_generate_from_video",
					params: {
						source: "timeline",
						provider: selectedProvider,
						language: selectedLanguage,
						style: "clean",
						placement: "bottom",
						audioRangeStartSeconds: startTimeSeconds,
						audioRangeDurationSeconds: durationSeconds,
						audioRangeTrackId: audioTrack.trackRef.trackId,
					},
					onProgress: (event) => {
						if (event.status === "running") {
							dispatch({
								type: "update_step",
								step: `${audioTrack.label}: ${event.label}`,
							});
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
			}

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
		void runGenerateAllTranscripts();
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
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const handleProviderChange = ({ value }: { value: string }) => {
		if (!isCaptionTranscriptionProvider(value)) return;
		setSelectedProvider(value);
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

	const handleSelectedTrackChange = ({ value }: { value: string }) => {
		updateProjectSubtitles({ selectedTrackId: value });
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
						<Select
							value={selectedTrackId}
							onValueChange={(value) => handleSelectedTrackChange({ value })}
						>
							<SelectTrigger
								className="h-8 w-[6.5rem]"
								aria-label="选择轨道"
							>
								<SelectValue placeholder="选择轨道" />
							</SelectTrigger>
							<SelectContent>
								{transcriptTrackChoices.length > 0 ? (
									transcriptTrackChoices.map((track) => (
										<SelectItem key={track.id} value={track.id}>
											{track.label}
										</SelectItem>
									))
								) : (
									<SelectItem value={LEGACY_TRANSCRIPT_TRACK_ID}>
										无轨道
									</SelectItem>
								)}
							</SelectContent>
						</Select>
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
						</SectionFields>

						<div className="min-h-0 flex-1 overflow-y-auto pr-1">
							<div className="mb-3 flex items-center justify-between gap-3 px-1">
								<div className="min-w-0">
									<div className="truncate text-lg font-semibold text-emerald-400">
										{selectedTranscriptTrack?.label ?? "暂无轨道"}
									</div>
									<div className="text-muted-foreground truncate text-xs">
										{hasTranscript
											? `${selectedTranscriptTrack?.cues.length ?? 0} 条文字稿，不占用时间线轨道`
											: "生成后会按轨道出现在这里"}
									</div>
								</div>
								<Switch
								checked={projectSubtitles.enabled}
								onCheckedChange={handleToggleProjectSubtitles}
								aria-label="字幕是否开启"
							/>
							</div>

							{hasTranscript ? (
								<div
									className="space-y-4 pb-4"
									data-testid="global-transcript-list"
								>
									{selectedTranscriptTrack?.cues.map((cue, cueIndex) => (
										<div
											key={`${cue.startTime}:${cueIndex}`}
											className="grid grid-cols-[0.75rem_1fr] gap-2"
										>
											<button
												type="button"
												className="text-muted-foreground/55 hover:text-muted-foreground mt-1.5 text-left text-sm leading-none"
												aria-label={`跳转到 ${getCueDisplayTime({ cue })}`}
												onClick={() => seekToSeconds({ seconds: cue.startTime })}
											>
												::
											</button>
											<p className="text-[1.03rem] leading-8 text-foreground/90">
												{splitCueTextIntoClickableUnits({ cue }).map(
													(token, tokenIndex) => (
														<button
															type="button"
															key={`${token.startTime}:${tokenIndex}:${token.text}`}
															className="rounded-[2px] px-px text-left align-baseline hover:bg-cyan-300/15 hover:text-cyan-100"
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
											</p>
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
								disabled={isProcessing || audioTrackOptions.length === 0}
							>
								Generate all tracks
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
