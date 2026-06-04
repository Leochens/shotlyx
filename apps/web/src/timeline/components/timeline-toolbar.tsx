import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import {
	TooltipProvider,
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { BatchCommand } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	SplitButton,
	SplitButtonLeft,
	SplitButtonRight,
	SplitButtonSeparator,
} from "@/components/ui/split-button";
import { Slider } from "@/components/ui/slider";
import {
	AUDIO_RECORDING_COUNTDOWN_OPTIONS,
	buildAudioRecordingConstraints,
	createAudioRecordingFile,
	formatRecordingDuration,
	getSupportedAudioRecordingMimeType,
	parseAudioRecordingCountdownSeconds,
	type AudioRecordingCountdownSeconds,
} from "@/media/audio-recording";
import { processMediaAssets } from "@/media/processing";
import { TIMELINE_ZOOM_BUTTON_FACTOR } from "./interaction";
import { TIMELINE_ZOOM_MAX } from "@/timeline/scale";
import { sliderToZoom, zoomToSlider } from "@/timeline/zoom-utils";
import { ScenesView } from "@/components/editor/scenes-view";
import { type TActionWithOptionalArgs, invokeAction } from "@/actions";
import {
	canToggleSourceAudio,
	getSourceAudioActionLabel,
	isSourceAudioSeparated,
} from "@/timeline/audio-separation";
import { hasMediaId } from "@/timeline";
import { cn } from "@/utils/ui";
import { useTimelineStore, type TimelineMode } from "@/timeline/timeline-store";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Bookmark02Icon,
	Delete02Icon,
	SnowIcon,
	ScissorIcon,
	MagnetIcon,
	SearchAddIcon,
	SearchMinusIcon,
	Copy01Icon,
	AlignLeftIcon,
	AlignRightIcon,
	JoinStraightIcon,
	Link02Icon,
	Layers01Icon,
	Chart03Icon,
	Unlink02Icon,
	AudioWave01Icon,
	Mic02Icon,
	RecordIcon,
	RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { OcRippleIcon } from "@/components/icons";
import { GraphEditorPopover } from "./graph-editor/popover";
import { PopoverTrigger } from "@/components/ui/popover";
import { useGraphEditorController } from "./graph-editor/use-controller";
import { SilenceCutDialog } from "@/silence/components/silence-cut-dialog";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import { toast } from "sonner";

export function TimelineToolbar({
	zoomLevel,
	minZoom,
	setZoomLevel,
}: {
	zoomLevel: number;
	minZoom: number;
	setZoomLevel: ({ zoom }: { zoom: number }) => void;
}) {
	const handleZoom = ({ direction }: { direction: "in" | "out" }) => {
		const newZoomLevel =
			direction === "in"
				? Math.min(TIMELINE_ZOOM_MAX, zoomLevel * TIMELINE_ZOOM_BUTTON_FACTOR)
				: Math.max(minZoom, zoomLevel / TIMELINE_ZOOM_BUTTON_FACTOR);
		setZoomLevel({ zoom: newZoomLevel });
	};
	const timelineMode = useTimelineStore((s) => s.timelineMode);
	const setTimelineMode = useTimelineStore((s) => s.setTimelineMode);

	return (
		<ScrollArea className="scrollbar-hidden">
			<div className="flex h-10 items-center justify-between border-b px-2 py-1">
				<ToolbarLeftSection mode={timelineMode} />

				<div className="flex items-center gap-2">
					<TimelineModeSwitch
						mode={timelineMode}
						onModeChange={setTimelineMode}
					/>
					<SceneSelector />
				</div>

				<ToolbarRightSection
					zoomLevel={zoomLevel}
					minZoom={minZoom}
					onZoomChange={(zoom) => setZoomLevel({ zoom })}
					onZoom={handleZoom}
				/>
			</div>
		</ScrollArea>
	);
}

function ToolbarLeftSection({ mode }: { mode: TimelineMode }) {
	const editor = useEditor();
	const [silenceDialogOpen, setSilenceDialogOpen] = useState(false);
	const mediaAssets = useEditor((currentEditor) =>
		currentEditor.media.getAssets(),
	);
	const { selectedElements } = useElementSelection();
	const graphEditor = useGraphEditorController();
	const isCurrentlyBookmarked = useEditor((e) =>
		e.scenes.isBookmarked({ time: e.playback.getCurrentTime() }),
	);
	const selectedElement =
		selectedElements.length === 1
			? (editor.timeline.getElementsWithTracks({
					elements: selectedElements,
				})[0] ?? null)
			: null;
	const selectedElementEntries = editor.timeline.getElementsWithTracks({
		elements: selectedElements,
	});
	const canOpenSilenceCut = selectedElementEntries.some(({ element }) => {
		if (!hasMediaId(element)) {
			return false;
		}

		return element.type === "video" || element.type === "audio";
	});
	const canMergeSelectedElements = editor.timeline.canMergeElements({
		elements: selectedElements,
	});
	const selectedMediaAsset = (() => {
		if (!selectedElement) {
			return null;
		}

		const { element } = selectedElement;
		if (!hasMediaId(element)) {
			return null;
		}

		return mediaAssets.find((asset) => asset.id === element.mediaId) ?? null;
	})();
	const canToggleSelectedSourceAudio =
		!!selectedElement &&
		canToggleSourceAudio(selectedElement.element, selectedMediaAsset);
	const sourceAudioLabel =
		selectedElement?.element.type === "video"
			? getSourceAudioActionLabel({
					element: selectedElement.element,
				})
			: "Extract audio";
	const isSelectedSourceAudioSeparated =
		selectedElement?.element.type === "video" &&
		isSourceAudioSeparated({
			element: selectedElement.element,
		});

	const handleAction = ({
		action,
		event,
	}: {
		action: TActionWithOptionalArgs;
		event: React.MouseEvent;
	}) => {
		event.stopPropagation();
		invokeAction(action);
	};

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<ToolbarButton
					icon={<HugeiconsIcon icon={ScissorIcon} />}
					tooltip="Split element"
					onClick={({ event }) => handleAction({ action: "split", event })}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={AlignLeftIcon} />}
					tooltip="Split left"
					hidden={mode === "simple"}
					onClick={({ event }) => handleAction({ action: "split-left", event })}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={AlignRightIcon} />}
					tooltip="Split right"
					hidden={mode === "simple"}
					onClick={({ event }) =>
						handleAction({ action: "split-right", event })
					}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={JoinStraightIcon} />}
					tooltip="Merge selected clips"
					disabled={!canMergeSelectedElements}
					onClick={({ event }) =>
						handleAction({ action: "merge-selected", event })
					}
				/>

				<ToolbarButton
					icon={
						<HugeiconsIcon
							icon={isSelectedSourceAudioSeparated ? Unlink02Icon : Link02Icon}
						/>
					}
					tooltip={sourceAudioLabel}
					disabled={!canToggleSelectedSourceAudio}
					hidden={mode === "simple"}
					onClick={({ event }) =>
						handleAction({ action: "toggle-source-audio", event })
					}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={AudioWave01Icon} />}
					tooltip="Remove silence"
					disabled={!canOpenSilenceCut}
					hidden={mode === "simple"}
					onClick={({ event }) => {
						event.stopPropagation();
						setSilenceDialogOpen(true);
					}}
				/>

				<AudioRecordingToolbarButton />

				<ToolbarButton
					icon={<HugeiconsIcon icon={Copy01Icon} />}
					tooltip="Duplicate element"
					onClick={({ event }) =>
						handleAction({ action: "duplicate-selected", event })
					}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={SnowIcon} />}
					tooltip="Freeze frame (coming soon)"
					disabled={true}
					hidden={mode === "simple"}
					onClick={({ event: _event }) => {}}
				/>

				<ToolbarButton
					icon={<HugeiconsIcon icon={Delete02Icon} />}
					tooltip="Delete element"
					onClick={({ event }) =>
						handleAction({ action: "delete-selected", event })
					}
				/>

				{mode === "pro" && <div className="bg-border mx-1 h-6 w-px" />}

				{mode === "pro" && (
					<ToolbarButton
						icon={<HugeiconsIcon icon={Bookmark02Icon} />}
						isActive={isCurrentlyBookmarked}
						tooltip={isCurrentlyBookmarked ? "Remove bookmark" : "Add bookmark"}
						onClick={({ event }) =>
							handleAction({ action: "toggle-bookmark", event })
						}
					/>
				)}

				{mode === "pro" && (
					<GraphEditorPopover
						open={graphEditor.open}
						onOpenChange={graphEditor.onOpenChange}
						value={
							graphEditor.state.status === "ready"
								? graphEditor.state.cubicBezier
								: null
						}
						message={graphEditor.state.message}
						componentOptions={graphEditor.state.componentOptions}
						activeComponentKey={graphEditor.state.activeComponentKey}
						onActiveComponentKeyChange={graphEditor.onActiveComponentKeyChange}
						onPreviewValue={graphEditor.onPreviewValue}
						onCommitValue={graphEditor.onCommitValue}
						onCancelPreview={graphEditor.onCancelPreview}
					>
						<ToolbarButton
							icon={<HugeiconsIcon icon={Chart03Icon} />}
							tooltip={graphEditor.tooltip}
							disabled={!graphEditor.canOpen}
							buttonWrapper={(button) =>
								graphEditor.canOpen ? (
									<PopoverTrigger asChild>{button}</PopoverTrigger>
								) : (
									button
								)
							}
						/>
					</GraphEditorPopover>
				)}
				<SilenceCutDialog
					open={silenceDialogOpen}
					onOpenChange={setSilenceDialogOpen}
				/>
			</TooltipProvider>
		</div>
	);
}

type AudioRecordingStatus =
	| "idle"
	| "requesting"
	| "countdown"
	| "recording"
	| "saving";

const DEFAULT_AUDIO_INPUT_DEVICE_ID = "__default_microphone__";

function isAudioRecordingBusy(status: AudioRecordingStatus): boolean {
	return (
		status === "requesting" ||
		status === "countdown" ||
		status === "recording" ||
		status === "saving"
	);
}

function getAudioInputLabel({
	device,
	index,
}: {
	device: MediaDeviceInfo;
	index: number;
}): string {
	return device.label || `Microphone ${index + 1}`;
}

async function readMicrophonePermissionState(): Promise<
	PermissionState | "unknown"
> {
	if (!navigator.permissions?.query) return "unknown";
	try {
		const status = await navigator.permissions.query({
			name: "microphone" as PermissionName,
		});
		return status.state;
	} catch {
		return "unknown";
	}
}

function AudioRecordingToolbarButton({ hidden }: { hidden?: boolean }) {
	const editor = useEditor();
	const [open, setOpen] = useState(false);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState(
		DEFAULT_AUDIO_INPUT_DEVICE_ID,
	);
	const [countdownSeconds, setCountdownSeconds] =
		useState<AudioRecordingCountdownSeconds>(3);
	const [status, setStatus] = useState<AudioRecordingStatus>("idle");
	const [permissionState, setPermissionState] = useState<
		PermissionState | "unknown"
	>("unknown");
	const [countdownRemaining, setCountdownRemaining] = useState(0);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const shouldSaveRef = useRef(false);
	const elapsedTimerRef = useRef<number | null>(null);
	const countdownTimerRef = useRef<number | null>(null);
	const countdownResolveRef = useRef<((completed: boolean) => void) | null>(
		null,
	);
	const requestIdRef = useRef(0);
	const openRef = useRef(open);

	useEffect(() => {
		openRef.current = open;
	}, [open]);

	const clearElapsedTimer = useCallback(() => {
		if (elapsedTimerRef.current === null) return;
		window.clearInterval(elapsedTimerRef.current);
		elapsedTimerRef.current = null;
	}, []);

	const stopStream = useCallback(() => {
		streamRef.current?.getTracks().forEach((track) => track.stop());
		streamRef.current = null;
	}, []);

	const clearRecordingSession = useCallback(() => {
		clearElapsedTimer();
		stopStream();
		recorderRef.current = null;
		chunksRef.current = [];
		shouldSaveRef.current = false;
	}, [clearElapsedTimer, stopStream]);

	const refreshDevices = useCallback(async () => {
		if (!navigator.mediaDevices?.enumerateDevices) {
			setDevices([]);
			return;
		}
		const mediaDevices = await navigator.mediaDevices.enumerateDevices();
		const audioInputs = mediaDevices.filter(
			(device) => device.kind === "audioinput",
		);
		setDevices(audioInputs);
		setSelectedDeviceId((current) =>
			current === DEFAULT_AUDIO_INPUT_DEVICE_ID ||
			audioInputs.some((device) => device.deviceId === current)
				? current
				: DEFAULT_AUDIO_INPUT_DEVICE_ID,
		);
	}, []);

	const cancelCountdown = useCallback(() => {
		if (countdownTimerRef.current !== null) {
			window.clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
		countdownResolveRef.current?.(false);
		countdownResolveRef.current = null;
		setCountdownRemaining(0);
	}, []);

	const runCountdown = useCallback((seconds: number) => {
		if (seconds <= 0) return Promise.resolve(true);
		setStatus("countdown");
		setCountdownRemaining(seconds);
		return new Promise<boolean>((resolve) => {
			let remaining = seconds;
			countdownResolveRef.current = resolve;
			countdownTimerRef.current = window.setInterval(() => {
				remaining -= 1;
				if (remaining <= 0) {
					if (countdownTimerRef.current !== null) {
						window.clearInterval(countdownTimerRef.current);
						countdownTimerRef.current = null;
					}
					countdownResolveRef.current = null;
					setCountdownRemaining(0);
					resolve(true);
					return;
				}
				setCountdownRemaining(remaining);
			}, 1_000);
		});
	}, []);

	const insertRecording = useCallback(
		async ({
			blob,
			fallbackSeconds,
		}: {
			blob: Blob;
			fallbackSeconds: number;
		}) => {
			const activeProject = editor.project.getActiveOrNull();
			if (!activeProject) {
				throw new Error("No active project");
			}
			const file = createAudioRecordingFile({ blob });
			const processedAssets = await processMediaAssets({ files: [file] });
			const asset = processedAssets[0];
			if (!asset) {
				throw new Error("Could not process recorded audio");
			}
			const addMediaCommand = new AddMediaAssetCommand({
				projectId: activeProject.metadata.id,
				asset,
			});
			const assetId = addMediaCommand.getAssetId();
			const duration =
				asset.duration && Number.isFinite(asset.duration)
					? mediaTimeFromSeconds({ seconds: asset.duration })
					: fallbackSeconds > 0
						? mediaTimeFromSeconds({ seconds: fallbackSeconds })
						: DEFAULT_NEW_ELEMENT_DURATION;
			const element = buildElementFromMedia({
				mediaId: assetId,
				mediaType: "audio",
				name: asset.name,
				duration,
				startTime: editor.playback.getCurrentTime(),
			});
			const insertCommand = new InsertElementCommand({
				element,
				placement: { mode: "auto", trackType: "audio" },
			});
			editor.command.execute({
				command: new BatchCommand([addMediaCommand, insertCommand]),
			});
		},
		[editor],
	);

	const handleRecorderStop = useCallback(
		async ({ mimeType, elapsed }: { mimeType: string; elapsed: number }) => {
			const chunks = chunksRef.current;
			const shouldSave = shouldSaveRef.current;
			clearRecordingSession();
			if (!shouldSave) {
				setStatus("idle");
				return;
			}
			if (chunks.length === 0) {
				setStatus("idle");
				toast.error("No audio was captured");
				return;
			}

			setStatus("saving");
			try {
				const blob = new Blob(chunks, {
					type: mimeType || chunks[0]?.type || "audio/webm",
				});
				await insertRecording({ blob, fallbackSeconds: elapsed });
				toast.success("Audio recording added to timeline");
				setOpen(false);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Could not save recording",
				);
			} finally {
				setStatus("idle");
			}
		},
		[clearRecordingSession, insertRecording],
	);

	const cancelRecording = useCallback(() => {
		requestIdRef.current += 1;
		cancelCountdown();
		const recorder = recorderRef.current;
		shouldSaveRef.current = false;
		if (recorder && recorder.state !== "inactive") {
			recorder.stop();
		} else {
			clearRecordingSession();
		}
		setStatus("idle");
	}, [cancelCountdown, clearRecordingSession]);

	useEffect(() => {
		return () => {
			cancelRecording();
		};
	}, [cancelRecording]);

	const startRecording = useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			toast.error("Microphone recording is not available");
			return;
		}
		if (typeof MediaRecorder === "undefined") {
			toast.error("Audio recording is not available in this browser");
			return;
		}
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setStatus("requesting");
		setElapsedSeconds(0);
		setCountdownRemaining(0);
		try {
			const deviceId =
				selectedDeviceId === DEFAULT_AUDIO_INPUT_DEVICE_ID
					? undefined
					: selectedDeviceId;
			const stream = await navigator.mediaDevices.getUserMedia(
				buildAudioRecordingConstraints({ deviceId }),
			);
			if (requestIdRef.current !== requestId || !openRef.current) {
				stream.getTracks().forEach((track) => track.stop());
				setStatus("idle");
				return;
			}

			streamRef.current = stream;
			void refreshDevices().catch(() => undefined);
			setPermissionState("granted");
			const didFinishCountdown = await runCountdown(countdownSeconds);
			if (!didFinishCountdown) {
				stream.getTracks().forEach((track) => track.stop());
				setStatus("idle");
				return;
			}

			const mimeType = getSupportedAudioRecordingMimeType();
			const recorder = new MediaRecorder(
				stream,
				mimeType ? { mimeType } : undefined,
			);
			const startedAt = performance.now();
			recorderRef.current = recorder;
			chunksRef.current = [];
			shouldSaveRef.current = true;
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};
			recorder.onstop = () => {
				const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
				void handleRecorderStop({
					mimeType: recorder.mimeType || mimeType,
					elapsed,
				});
			};
			recorder.start();
			setStatus("recording");
			elapsedTimerRef.current = window.setInterval(() => {
				setElapsedSeconds((performance.now() - startedAt) / 1000);
			}, 250);
		} catch (error) {
			clearRecordingSession();
			setStatus("idle");
			setPermissionState(await readMicrophonePermissionState());
			toast.error(
				error instanceof Error ? error.message : "Microphone permission denied",
			);
		}
	}, [
		clearRecordingSession,
		countdownSeconds,
		handleRecorderStop,
		refreshDevices,
		runCountdown,
		selectedDeviceId,
	]);

	const stopRecording = useCallback(() => {
		const recorder = recorderRef.current;
		if (!recorder || recorder.state === "inactive") return;
		shouldSaveRef.current = true;
		clearElapsedTimer();
		recorder.stop();
		setStatus("saving");
	}, [clearElapsedTimer]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) {
			void refreshDevices().catch(() => undefined);
			void readMicrophonePermissionState().then(setPermissionState);
		}
		if (!nextOpen && isAudioRecordingBusy(status)) {
			cancelRecording();
		}
		setOpen(nextOpen);
	};

	if (hidden) return null;

	const selectedDeviceValue = selectedDeviceId || DEFAULT_AUDIO_INPUT_DEVICE_ID;
	const isRecording = status === "recording";
	const isBusy = isAudioRecordingBusy(status);
	const statusLabel =
		status === "requesting"
			? "Requesting microphone"
			: status === "countdown"
				? `${countdownRemaining}`
				: status === "recording"
					? `Recording ${formatRecordingDuration(elapsedSeconds)}`
					: status === "saving"
						? "Saving audio"
						: permissionState === "denied"
							? "Permission denied"
							: "Ready";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<ToolbarButton
				icon={<HugeiconsIcon icon={isRecording ? RecordIcon : Mic02Icon} />}
				isActive={isBusy}
				tooltip={isRecording ? "Recording audio" : "Record audio"}
				buttonWrapper={(button) => (
					<DialogTrigger asChild>{button}</DialogTrigger>
				)}
			/>
			<DialogContent className="max-w-md rounded-sm">
				<DialogHeader>
					<DialogTitle>Record audio</DialogTitle>
					<DialogDescription>Microphone recording</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="timeline-audio-recording-device">Microphone</Label>
						<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
							<Select
								value={selectedDeviceValue}
								onValueChange={setSelectedDeviceId}
								disabled={isBusy}
							>
								<SelectTrigger
									id="timeline-audio-recording-device"
									className="w-full"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={DEFAULT_AUDIO_INPUT_DEVICE_ID}>
										System default
									</SelectItem>
									{devices.map((device, index) => (
										<SelectItem
											key={device.deviceId || `mic-${index}`}
											value={device.deviceId}
										>
											{getAudioInputLabel({ device, index })}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button
								variant="outline"
								size="icon"
								disabled={isBusy}
								onClick={() => void refreshDevices()}
								title="Refresh microphones"
							>
								<HugeiconsIcon icon={RefreshIcon} />
							</Button>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="timeline-audio-recording-countdown">
							Countdown
						</Label>
						<Select
							value={String(countdownSeconds)}
							onValueChange={(value) =>
								setCountdownSeconds(parseAudioRecordingCountdownSeconds(value))
							}
							disabled={isBusy}
						>
							<SelectTrigger id="timeline-audio-recording-countdown">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{AUDIO_RECORDING_COUNTDOWN_OPTIONS.map((seconds) => (
									<SelectItem key={seconds} value={String(seconds)}>
										{seconds === 0 ? "No countdown" : `${seconds} seconds`}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="rounded-sm border border-border/75 bg-muted/20 px-3 py-2">
						<div className="text-xs font-medium text-muted-foreground">
							Status
						</div>
						<div className="mt-1 text-sm font-semibold text-foreground">
							{statusLabel}
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						disabled={status === "saving"}
						onClick={() => {
							if (isBusy) {
								cancelRecording();
								return;
							}
							setOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button
						variant={isRecording ? "destructive" : "default"}
						disabled={
							status === "requesting" ||
							status === "countdown" ||
							status === "saving"
						}
						onClick={() =>
							isRecording ? stopRecording() : void startRecording()
						}
					>
						<HugeiconsIcon icon={isRecording ? RecordIcon : Mic02Icon} />
						{isRecording ? "Stop" : "Start recording"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function TimelineModeSwitch({
	mode,
	onModeChange,
}: {
	mode: TimelineMode;
	onModeChange: (mode: TimelineMode) => void;
}) {
	return (
		<div className="flex rounded-sm border border-cyan-300/10 bg-muted/60 p-0.5">
			{(["simple", "pro"] as const).map((value) => (
				<button
					key={value}
					type="button"
					onClick={() => onModeChange(value)}
					className={cn(
						"rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
						mode === value &&
							"bg-background text-cyan-100 shadow-sm shadow-cyan-950/30",
					)}
					aria-pressed={mode === value}
				>
					{value === "simple" ? "Simple" : "Pro"}
				</button>
			))}
		</div>
	);
}

function SceneSelector() {
	const editor = useEditor();
	const currentScene = editor.scenes.getActiveScene();

	return (
		<div>
			<SplitButton className="border-foreground/10 border">
				<SplitButtonLeft>{currentScene?.name || "No Scene"}</SplitButtonLeft>
				<SplitButtonSeparator />
				<ScenesView>
					<SplitButtonRight onClick={() => {}}>
						<HugeiconsIcon icon={Layers01Icon} className="size-4" />
					</SplitButtonRight>
				</ScenesView>
			</SplitButton>
		</div>
	);
}

function ToolbarRightSection({
	zoomLevel,
	minZoom,
	onZoomChange,
	onZoom,
}: {
	zoomLevel: number;
	minZoom: number;
	onZoomChange: (zoom: number) => void;
	onZoom: (options: { direction: "in" | "out" }) => void;
}) {
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
	const toggleRippleEditing = useTimelineStore((s) => s.toggleRippleEditing);

	return (
		<div className="flex items-center gap-1">
			<TooltipProvider delayDuration={500}>
				<ToolbarButton
					icon={<HugeiconsIcon icon={MagnetIcon} />}
					isActive={snappingEnabled}
					tooltip="Auto snapping"
					onClick={() => toggleSnapping()}
				/>

				<ToolbarButton
					icon={<OcRippleIcon size={24} className="scale-110" />}
					isActive={rippleEditingEnabled}
					tooltip="Ripple move main timeline"
					onClick={() => toggleRippleEditing()}
				/>
			</TooltipProvider>

			<div className="bg-border mx-1 h-6 w-px" />

			<div className="flex items-center gap-1">
				<Button
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "out" })}
				>
					<HugeiconsIcon icon={SearchMinusIcon} />
				</Button>
				<Slider
					className="w-28"
					value={[zoomToSlider({ zoomLevel, minZoom })]}
					onValueChange={(values) =>
						onZoomChange(sliderToZoom({ sliderPosition: values[0], minZoom }))
					}
					min={0}
					max={1}
					step={0.005}
				/>
				<Button
					variant="text"
					size="icon"
					onClick={() => onZoom({ direction: "in" })}
				>
					<HugeiconsIcon icon={SearchAddIcon} />
				</Button>
			</div>
		</div>
	);
}

function ToolbarButton({
	icon,
	tooltip,
	onClick,
	disabled,
	isActive,
	buttonWrapper,
	hidden,
}: {
	icon: React.ReactNode;
	tooltip: string;
	onClick?: ({ event }: { event: React.MouseEvent }) => void;
	disabled?: boolean;
	isActive?: boolean;
	buttonWrapper?: (button: React.ReactElement) => React.ReactElement;
	hidden?: boolean;
}) {
	if (hidden) return null;

	const button = (
		<Button
			variant={isActive ? "secondary" : "text"}
			size="icon"
			aria-label={tooltip}
			disabled={disabled}
			onClick={onClick ? (event) => onClick({ event }) : undefined}
			className={cn(
				"rounded-sm",
				disabled ? "cursor-not-allowed opacity-50" : "",
			)}
		>
			{icon}
		</Button>
	);
	const trigger = disabled ? (
		<span className="inline-flex">{button}</span>
	) : buttonWrapper ? (
		buttonWrapper(button)
	) : (
		button
	);

	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}
