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
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
} from "@/transcription/types";
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
import { Pencil, Scissors, Settings2, Trash2 } from "lucide-react";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { useAssetsPanelStore } from "@/components/editor/panels/assets/assets-panel-store";
import type { DiagnosticSeverity } from "@/diagnostics/types";
import type { TProjectSubtitleTrack, TProjectSubtitles } from "@/project/types";
import type { SubtitleLayerCue } from "@/subtitles/types";
import { createEmptyProjectSubtitles } from "@/subtitles/project-subtitles";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm/media-time";
import type { TimelineTrack } from "@/timeline";
import {
	editTranscriptSelection,
	findActiveTranscriptToken,
	getTranscriptCueTokens,
	isSingleCueSelection,
	isTokenAddressInSelection,
	resolveTranscriptTokenRange,
	type TranscriptTokenAddress,
	type TranscriptTokenSelection,
} from "@/subtitles/transcript-editing";
import {
	getTimelineSubtitleTrack,
	storedSubtitleSecondsToTimelineSeconds,
} from "@/subtitles/timing-bindings";

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

function transcriptTokenKey({ address }: { address: TranscriptTokenAddress }) {
	return `${address.cueIndex}-${address.tokenIndex}`;
}

function isSameTokenAddress({
	left,
	right,
}: {
	left: TranscriptTokenAddress | null;
	right: TranscriptTokenAddress | null;
}): boolean {
	return (
		!!left &&
		!!right &&
		left.cueIndex === right.cueIndex &&
		left.tokenIndex === right.tokenIndex
	);
}

function getTokenSelectionPosition({
	address,
	range,
}: {
	address: TranscriptTokenAddress;
	range: ReturnType<typeof resolveTranscriptTokenRange>;
}): "single" | "start" | "middle" | "end" | null {
	if (!range) return null;
	if (address.cueIndex !== range.start.cueIndex) return null;
	if (address.cueIndex !== range.end.cueIndex) return null;
	if (address.tokenIndex < range.start.tokenIndex) return null;
	if (address.tokenIndex > range.end.tokenIndex) return null;
	const isStart = address.tokenIndex === range.start.tokenIndex;
	const isEnd = address.tokenIndex === range.end.tokenIndex;
	if (isStart && isEnd) return "single";
	if (isStart) return "start";
	if (isEnd) return "end";
	return "middle";
}

function trackElementsOverlappingRange({
	track,
	startTime,
	endTime,
}: {
	track: TimelineTrack;
	startTime: number;
	endTime: number;
}): { trackId: string; elementId: string }[] {
	return track.elements
		.filter((element) => {
			const elementStart = element.startTime;
			const elementEnd = element.startTime + element.duration;
			return elementStart < endTime && elementEnd > startTime;
		})
		.map((element) => ({
			trackId: track.id,
			elementId: element.id,
		}));
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
	const isSelectingRef = useRef(false);
	const selectionMovedRef = useRef(false);
	const [tokenSelection, setTokenSelection] =
		useState<TranscriptTokenSelection | null>(null);
	const [activeTokenAddress, setActiveTokenAddress] =
		useState<TranscriptTokenAddress | null>(null);
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [editDraft, setEditDraft] = useState("");
	const setInspectorFocus = usePropertiesStore(
		(state) => state.setInspectorFocus,
	);
	const clearSelectedAssetRefs = useAssetsPanelStore(
		(state) => state.clearSelectedAssetRefs,
	);
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
	const selectedTimelineTranscriptTrack = useMemo(
		() =>
			selectedTranscriptTrack
				? getTimelineSubtitleTrack({
						track: selectedTranscriptTrack,
						tracks: sceneTracks,
					})
				: null,
		[selectedTranscriptTrack, sceneTracks],
	);
	const displayTranscriptTrack =
		selectedTimelineTranscriptTrack ?? selectedTranscriptTrack;
	const hasTranscript = (selectedTranscriptTrack?.cues.length ?? 0) > 0;
	const isSelectedTrackRenderEnabled =
		selectedTranscriptTrack?.renderEnabled !== false;
	const selectedTokenRange = useMemo(
		() =>
			selectedTranscriptTrack
				? resolveTranscriptTokenRange({
						track: selectedTranscriptTrack,
						selection: tokenSelection,
					})
				: null,
		[selectedTranscriptTrack, tokenSelection],
	);

	useEffect(() => {
		const handlePointerUp = () => {
			isSelectingRef.current = false;
		};
		window.addEventListener("pointerup", handlePointerUp);
		return () => window.removeEventListener("pointerup", handlePointerUp);
	}, []);

	useEffect(() => {
		const updateActiveToken = (time: number) => {
			const nextAddress = findActiveTranscriptToken({
				track: selectedTimelineTranscriptTrack,
				timeSeconds: mediaTimeToSeconds({ time }),
			});
			setActiveTokenAddress((previous) =>
				isSameTokenAddress({ left: previous, right: nextAddress })
					? previous
					: nextAddress,
			);
		};

		updateActiveToken(editor.playback.getCurrentTime());
		const unsubscribeUpdate = editor.playback.onUpdate(updateActiveToken);
		const unsubscribeSeek = editor.playback.onSeek(updateActiveToken);
		const unsubscribePlayback = editor.playback.subscribe(() =>
			updateActiveToken(editor.playback.getCurrentTime()),
		);
		return () => {
			unsubscribeUpdate();
			unsubscribeSeek();
			unsubscribePlayback();
		};
	}, [editor, selectedTimelineTranscriptTrack]);

	useEffect(() => {
		if (!activeTokenAddress || !containerRef.current) return;
		const tokenElement = containerRef.current.querySelector(
			`[data-transcript-token-key="${transcriptTokenKey({
				address: activeTokenAddress,
			})}"]`,
		);
		tokenElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [activeTokenAddress]);

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

	const handleCutFillerWords = async () => {
		if (!selectedTranscriptTrack) return;
		dispatch({
			type: "start",
			step: "正在让 AI 分析气口...",
		});
		const result = await editor.mcp.execute({
			toolName: "subtitles_cut_filler_words",
			params: {
				transcriptTrackId: selectedTranscriptTrack.id,
			},
			onProgress: (event) => {
				if (event.status === "running") {
					dispatch({
						type: "update_step",
						step: event.label,
					});
				}
			},
		});
		if (result.status === "error") {
			dispatch({
				type: "fail",
				error: result.error ?? "剪气口失败",
			});
			return;
		}
		const message =
			typeof result.data === "object" &&
			result.data !== null &&
			"message" in result.data &&
			typeof result.data.message === "string"
				? result.data.message
				: "剪气口完成";
		dispatch({ type: "succeed", warnings: [message] });
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

	const handleOpenSubtitleSettings = () => {
		editor.selection.clearSelection();
		clearSelectedAssetRefs();
		setInspectorFocus("project-subtitles");
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

	const updateTranscriptTracks = ({
		tracks,
	}: {
		tracks: TProjectSubtitleTrack[];
	}) => {
		const currentSubtitles =
			editor.project.getActive().settings.subtitles ??
			createEmptyProjectSubtitles();
		const isLegacyOnly =
			(!currentSubtitles.tracks || currentSubtitles.tracks.length === 0) &&
			tracks.length === 1 &&
			tracks[0]?.id === LEGACY_TRANSCRIPT_TRACK_ID;
		void editor.project.updateSettings({
			settings: {
				subtitles: {
					...currentSubtitles,
					tracks,
					cues: isLegacyOnly ? (tracks[0]?.cues ?? []) : currentSubtitles.cues,
					selectedTrackId: selectedTrackId,
					updatedAt: new Date().toISOString(),
				},
			},
		});
	};

	const replaceTranscriptTrack = ({
		track,
	}: {
		track: TProjectSubtitleTrack;
	}) => {
		const currentSubtitles =
			editor.project.getActive().settings.subtitles ??
			createEmptyProjectSubtitles();
		const tracks = getStoredTranscriptTracks({ subtitles: currentSubtitles });
		updateTranscriptTracks({
			tracks: tracks.map((item) => (item.id === track.id ? track : item)),
		});
	};

	const handleToggleProjectSubtitles = (enabled: boolean) => {
		updateProjectSubtitles({ enabled });
	};

	const handleSelectedTrackChange = ({ value }: { value: string }) => {
		setTokenSelection(null);
		updateProjectSubtitles({ selectedTrackId: value });
	};

	const handleToggleSelectedTrackRender = (enabled: boolean) => {
		if (!selectedTranscriptTrack) return;
		const currentSubtitles =
			editor.project.getActive().settings.subtitles ??
			createEmptyProjectSubtitles();
		const tracks = getStoredTranscriptTracks({ subtitles: currentSubtitles });
		updateTranscriptTracks({
			tracks: tracks.map((track) =>
				track.id === selectedTranscriptTrack.id
					? { ...track, renderEnabled: enabled }
					: track,
			),
		});
	};

	const handleTokenPointerDown = ({
		address,
	}: {
		address: TranscriptTokenAddress;
	}) => {
		isSelectingRef.current = true;
		selectionMovedRef.current = false;
		setTokenSelection({ anchor: address, focus: address });
	};

	const handleTokenPointerEnter = ({
		address,
	}: {
		address: TranscriptTokenAddress;
	}) => {
		if (!isSelectingRef.current) return;
		selectionMovedRef.current = true;
		setTokenSelection((previous) => {
			if (!previous) return previous;
			if (previous.anchor.cueIndex !== address.cueIndex) return previous;
			return { ...previous, focus: address };
		});
	};

	const handleTokenClick = ({
		event,
		seconds,
	}: {
		event: React.MouseEvent<HTMLButtonElement>;
		seconds: number;
	}) => {
		event.preventDefault();
		if (selectionMovedRef.current) {
			selectionMovedRef.current = false;
			return;
		}
		seekToSeconds({ seconds });
	};

	const handleOpenEditSelection = () => {
		if (!selectedTokenRange || !tokenSelection) return;
		if (!isSingleCueSelection({ selection: tokenSelection })) return;
		setEditDraft(selectedTokenRange.text);
		setIsEditDialogOpen(true);
	};

	const handleSaveEditSelection = () => {
		if (!selectedTranscriptTrack || !tokenSelection) return;
		const nextTrack = editTranscriptSelection({
			track: selectedTranscriptTrack,
			selection: tokenSelection,
			text: editDraft,
		});
		replaceTranscriptTrack({ track: nextTrack });
		setIsEditDialogOpen(false);
		setTokenSelection(null);
	};

	const handleDeleteSelection = () => {
		if (!selectedTranscriptTrack || !selectedTokenRange || !tokenSelection) {
			return;
		}
		if (!isSingleCueSelection({ selection: tokenSelection })) return;
		const sourceTrackId =
			selectedTranscriptTrack.sourceTrackId ??
			(selectedTrackId.startsWith("track:")
				? selectedTrackId.slice("track:".length)
				: null);
		if (!sourceTrackId) {
			dispatch({
				type: "fail",
				error: "当前文字稿没有绑定素材轨道，无法剪辑对应素材",
			});
			return;
		}

		const sourceTrack = editor.timeline.getTrackById({
			trackId: sourceTrackId,
		});
		if (!sourceTrack) {
			dispatch({
				type: "fail",
				error: "没有找到当前文字稿对应的素材轨道",
			});
			return;
		}

		const timelineStartSeconds = storedSubtitleSecondsToTimelineSeconds({
			track: selectedTranscriptTrack,
			tracks: sceneTracks,
			seconds: selectedTokenRange.startTime,
		});
		const timelineEndSeconds = storedSubtitleSecondsToTimelineSeconds({
			track: selectedTranscriptTrack,
			tracks: sceneTracks,
			seconds: selectedTokenRange.endTime,
		});
		const startTime = mediaTimeFromSeconds({
			seconds: timelineStartSeconds,
		});
		const endTime = mediaTimeFromSeconds({
			seconds: timelineEndSeconds,
		});
		const targets = trackElementsOverlappingRange({
			track: sourceTrack,
			startTime,
			endTime,
		}).map((target) => ({
			...target,
			ranges: [{ startTime, endTime }],
		}));

		if (targets.length === 0) {
			dispatch({
				type: "fail",
				error: "选中的文字没有命中对应素材片段",
			});
			return;
		}

		const didApply = editor.timeline.applySilenceCutPlan({ targets });
		if (!didApply) {
			dispatch({ type: "fail", error: "剪辑没有产生可应用的时间线变更" });
			return;
		}

		setTokenSelection(null);
		seekToSeconds({ seconds: timelineStartSeconds });
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
							<SelectTrigger className="h-8 w-[6.5rem]" aria-label="选择轨道">
								<SelectValue placeholder="选择轨道" />
							</SelectTrigger>
							<SelectContent>
								{transcriptTrackChoices.length > 0 ? (
									transcriptTrackChoices.map((track) => (
										<SelectItem key={track.id} value={track.id}>
											{track.label}
											{track.renderEnabled === false ? "（已关闭）" : ""}
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
							size="icon"
							aria-label="字幕设置"
							onClick={handleOpenSubtitleSettings}
							className="h-8 w-8"
						>
							<Settings2 className="h-4 w-4" />
						</Button>
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
										? `${selectedTranscriptTrack?.cues.length ?? 0} 条文字稿，${
												isSelectedTrackRenderEnabled
													? "正在显示字幕"
													: "字幕显示已关闭"
											}`
										: "生成后会按轨道出现在这里"}
								</div>
							</div>
							<div className="flex shrink-0 flex-col items-end gap-2">
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-xs">
										全部字幕
									</span>
									<Switch
										checked={projectSubtitles.enabled}
										onCheckedChange={handleToggleProjectSubtitles}
										aria-label="字幕是否开启"
									/>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-muted-foreground text-xs">
										当前轨道
									</span>
									<Switch
										checked={isSelectedTrackRenderEnabled}
										onCheckedChange={handleToggleSelectedTrackRender}
										disabled={!selectedTranscriptTrack}
										aria-label="当前轨道字幕是否显示"
									/>
								</div>
							</div>
						</div>

						{hasTranscript ? (
							<div
								className="space-y-2.5 pt-4 pb-3"
								data-testid="global-transcript-list"
							>
								{displayTranscriptTrack?.cues.map((cue, cueIndex) => (
									<div
										key={`${cue.startTime}:${cueIndex}`}
										className="group relative grid grid-cols-[0.75rem_1fr] gap-1.5"
									>
										<button
											type="button"
											className="text-muted-foreground/55 hover:text-muted-foreground mt-1.5 text-left text-sm leading-none"
											aria-label={`跳转到 ${getCueDisplayTime({ cue })}`}
											onClick={() => seekToSeconds({ seconds: cue.startTime })}
										>
											::
										</button>
										<p className="text-[1.01rem] leading-7 text-foreground/90">
											{getTranscriptCueTokens({ cue }).map(
												(token, tokenIndex) => {
													const address = { cueIndex, tokenIndex };
													const tokenKey = transcriptTokenKey({ address });
													const isActive = isSameTokenAddress({
														left: activeTokenAddress,
														right: address,
													});
													const isSelected = isTokenAddressInSelection({
														address,
														selection: tokenSelection,
													});
													const selectionPosition = getTokenSelectionPosition({
														address,
														range: selectedTokenRange,
													});
													return (
														<span
															key={`${token.startTime}:${tokenIndex}:${token.text}`}
														>
															{(selectionPosition === "start" ||
																selectionPosition === "single") && (
																<span
																	className="relative inline-block h-[1lh] w-0 align-baseline"
																	data-testid="transcript-selection-anchor"
																>
																	<span
																		className="absolute bottom-full left-0 z-20 mb-1 flex items-center gap-1 rounded-md border border-cyan-300/20 bg-background/95 p-1 shadow-lg backdrop-blur"
																		data-testid="transcript-selection-toolbar"
																	>
																		<TooltipProvider>
																			<Tooltip>
																				<TooltipTrigger asChild>
																					<Button
																						type="button"
																						size="icon"
																						variant="outline"
																						className="h-7 w-7"
																						aria-label="编辑选区"
																						onClick={handleOpenEditSelection}
																					>
																						<Pencil className="h-3.5 w-3.5" />
																					</Button>
																				</TooltipTrigger>
																				<TooltipContent>
																					编辑选区
																				</TooltipContent>
																			</Tooltip>
																			<Tooltip>
																				<TooltipTrigger asChild>
																					<Button
																						type="button"
																						size="icon"
																						variant="destructive"
																						className="h-7 w-7"
																						aria-label="删除选区"
																						onClick={handleDeleteSelection}
																					>
																						<Trash2 className="h-3.5 w-3.5" />
																					</Button>
																				</TooltipTrigger>
																				<TooltipContent>
																					删除选区
																				</TooltipContent>
																			</Tooltip>
																		</TooltipProvider>
																	</span>
																</span>
															)}
															<button
																type="button"
																data-testid={`transcript-token-${cueIndex}-${tokenIndex}`}
																data-transcript-token-key={tokenKey}
																data-active={isActive ? "true" : "false"}
																data-selected={isSelected ? "true" : "false"}
																data-selection-position={
																	selectionPosition ?? undefined
																}
																className={[
																	"border border-transparent px-px text-left align-baseline transition-colors",
																	"hover:bg-cyan-300/10 hover:text-cyan-100",
																	isActive && !isSelected
																		? "rounded-[5px] border-cyan-300/35 bg-cyan-400/[0.18] text-cyan-50"
																		: "",
																	isSelected
																		? "bg-cyan-400/[0.18] text-cyan-50 ring-0 border-y-cyan-300/35"
																		: "",
																	selectionPosition === "single"
																		? "rounded-[5px] border-x-cyan-300/35"
																		: "",
																	selectionPosition === "start"
																		? "rounded-l-[5px] rounded-r-none border-l-cyan-300/35 border-r-transparent"
																		: "",
																	selectionPosition === "middle"
																		? "rounded-none border-x-transparent"
																		: "",
																	selectionPosition === "end"
																		? "rounded-l-none rounded-r-[5px] border-l-transparent border-r-cyan-300/35"
																		: "",
																].join(" ")}
																onPointerDown={() =>
																	handleTokenPointerDown({ address })
																}
																onPointerEnter={() =>
																	handleTokenPointerEnter({ address })
																}
																onClick={(event) =>
																	handleTokenClick({
																		event,
																		seconds: token.startTime,
																	})
																}
															>
																{token.text}
															</button>
														</span>
													);
												},
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
						<div className="grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant="outline"
								className="w-full"
								onClick={() => void handleCutFillerWords()}
								disabled={isProcessing || !hasTranscript}
							>
								<Scissors className="h-4 w-4" />
								一键剪气口
							</Button>
							<Button
								type="button"
								className="w-full"
								onClick={handleGenerateTranscript}
								disabled={isProcessing || audioTrackOptions.length === 0}
							>
								Generate all tracks
							</Button>
						</div>
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
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className="max-w-md overflow-hidden rounded-md">
					<DialogHeader>
						<DialogTitle>编辑文字稿</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<Textarea
							value={editDraft}
							onChange={(event) => setEditDraft(event.target.value)}
							className="min-h-28"
							aria-label="编辑选中文字"
						/>
					</DialogBody>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setIsEditDialogOpen(false)}
						>
							取消
						</Button>
						<Button type="button" onClick={handleSaveEditSelection}>
							保存
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PanelView>
	);
}
