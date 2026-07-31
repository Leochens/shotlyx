import * as React from "react";
import { BatchCommand } from "@/commands";
import { AddMediaAssetCommand } from "@/commands/media";
import { InsertElementCommand } from "@/commands/timeline";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";
import {
	AUDIO_RECORDING_COUNTDOWN_OPTIONS,
	buildAudioRecordingConstraints,
	formatRecordingDuration,
	getSupportedAudioRecordingMimeType,
	parseAudioRecordingCountdownSeconds,
	type AudioRecordingCountdownSeconds,
} from "@/media/audio-recording";
import { processMediaAssets } from "@/media/processing";
import {
	DEFAULT_SCREEN_RECORDING_REGION,
	buildCameraRecordingConstraints,
	buildDisplayMediaOptions,
	combineMediaStreams,
	createRecordingFile,
	formatPermissionState,
	getSupportedVideoRecordingMimeType,
	normalizeScreenRecordingRegion,
	readRecordingPermissionState,
	type RecordingMode,
	type RecordingPermissionState,
	type ScreenRecordingArea,
	type ScreenRecordingRegion,
} from "@/media/recording";
import type { TimelineMediaType } from "@/media/types";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	CameraVideoIcon,
	ComputerScreenShareIcon,
	CropIcon,
	CursorRectangleSelection01Icon,
	FullScreenIcon,
	Mic02Icon,
	RecordIcon,
	RefreshIcon,
	StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";

type RecordingStatus =
	| "idle"
	| "requesting"
	| "selecting-region"
	| "countdown"
	| "recording"
	| "saving";

type DeviceKind = "audioinput" | "videoinput";

type RecordingModeConfig = {
	mode: RecordingMode;
	title: string;
	menuTitle: string;
	description: string;
	previewTitle: string;
	icon: React.ReactNode;
};

const DEFAULT_AUDIO_INPUT_DEVICE_ID = "__default_microphone__";
const DEFAULT_VIDEO_INPUT_DEVICE_ID = "__default_camera__";
const REGION_FRAME_RATE = 30;

const RECORDING_MODES: RecordingModeConfig[] = [
	{
		mode: "audio",
		title: "Record audio",
		menuTitle: "Audio",
		description: "Microphone clip",
		previewTitle: "Input level",
		icon: <HugeiconsIcon icon={Mic02Icon} />,
	},
	{
		mode: "screen",
		title: "Record screen",
		menuTitle: "Screen",
		description: "Full screen or selected region",
		previewTitle: "Screen preview",
		icon: <HugeiconsIcon icon={ComputerScreenShareIcon} />,
	},
	{
		mode: "camera",
		title: "Record camera",
		menuTitle: "Camera",
		description: "Talking-head video",
		previewTitle: "Camera preview",
		icon: <HugeiconsIcon icon={CameraVideoIcon} />,
	},
];

function getModeConfig(mode: RecordingMode): RecordingModeConfig {
	return (
		RECORDING_MODES.find((item) => item.mode === mode) ?? RECORDING_MODES[0]
	);
}

function isBusy(status: RecordingStatus): boolean {
	return (
		status === "requesting" ||
		status === "selecting-region" ||
		status === "countdown" ||
		status === "recording" ||
		status === "saving"
	);
}

function getDeviceLabel({
	device,
	index,
	fallback,
}: {
	device: MediaDeviceInfo;
	index: number;
	fallback: string;
}): string {
	return device.label || `${fallback} ${index + 1}`;
}

function getPointInRegion({
	event,
	bounds,
}: {
	event: React.PointerEvent<HTMLElement>;
	bounds: DOMRect;
}) {
	return {
		x: (event.clientX - bounds.left) / bounds.width,
		y: (event.clientY - bounds.top) / bounds.height,
	};
}

function getVideoTrackSize({
	video,
	stream,
	region,
}: {
	video: HTMLVideoElement;
	stream: MediaStream;
	region: ScreenRecordingRegion;
}) {
	const settings = stream.getVideoTracks()[0]?.getSettings();
	const sourceWidth = video.videoWidth || settings?.width || 1920;
	const sourceHeight = video.videoHeight || settings?.height || 1080;
	const width = Math.max(2, Math.round(sourceWidth * region.width));
	const height = Math.max(2, Math.round(sourceHeight * region.height));

	return {
		sourceWidth,
		sourceHeight,
		width,
		height,
	};
}

function createRegionRecordingStream({
	sourceStream,
	video,
	region,
	audioStreams,
}: {
	sourceStream: MediaStream;
	video: HTMLVideoElement;
	region: ScreenRecordingRegion;
	audioStreams: MediaStream[];
}) {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Could not prepare screen region recording");
	}

	const { sourceWidth, sourceHeight, width, height } = getVideoTrackSize({
		video,
		stream: sourceStream,
		region,
	});
	canvas.width = width;
	canvas.height = height;

	let frameId: number | null = null;
	let stopped = false;

	const drawFrame = () => {
		if (stopped) return;
		context.drawImage(
			video,
			Math.round(region.x * sourceWidth),
			Math.round(region.y * sourceHeight),
			width,
			height,
			0,
			0,
			width,
			height,
		);
		frameId = window.requestAnimationFrame(drawFrame);
	};
	drawFrame();

	const canvasStream = canvas.captureStream(REGION_FRAME_RATE);
	for (const audioStream of audioStreams) {
		for (const track of audioStream.getAudioTracks()) {
			canvasStream.addTrack(track);
		}
	}

	return {
		stream: canvasStream,
		cleanup: () => {
			stopped = true;
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
			}
		},
	};
}

export function RecordingToolbarButton({ hidden }: { hidden?: boolean }) {
	const editor = useEditor();
	const [open, setOpen] = React.useState(false);
	const [mode, setMode] = React.useState<RecordingMode>("audio");
	const [status, setStatus] = React.useState<RecordingStatus>("idle");
	const [audioDevices, setAudioDevices] = React.useState<MediaDeviceInfo[]>([]);
	const [videoDevices, setVideoDevices] = React.useState<MediaDeviceInfo[]>([]);
	const [selectedAudioDeviceId, setSelectedAudioDeviceId] = React.useState(
		DEFAULT_AUDIO_INPUT_DEVICE_ID,
	);
	const [selectedVideoDeviceId, setSelectedVideoDeviceId] = React.useState(
		DEFAULT_VIDEO_INPUT_DEVICE_ID,
	);
	const [countdownSeconds, setCountdownSeconds] =
		React.useState<AudioRecordingCountdownSeconds>(3);
	const [countdownRemaining, setCountdownRemaining] = React.useState(0);
	const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
	const [permissionStates, setPermissionStates] = React.useState<{
		microphone: RecordingPermissionState;
		camera: RecordingPermissionState;
		screen: RecordingPermissionState;
	}>({
		microphone: "unknown",
		camera: "unknown",
		screen: "unknown",
	});
	const [screenArea, setScreenArea] =
		React.useState<ScreenRecordingArea>("full");
	const [includeMicrophone, setIncludeMicrophone] = React.useState(true);
	const [previewStream, setPreviewStream] = React.useState<MediaStream | null>(
		null,
	);
	const [audioPreviewStream, setAudioPreviewStream] =
		React.useState<MediaStream | null>(null);
	const [screenRegion, setScreenRegion] = React.useState<ScreenRecordingRegion>(
		DEFAULT_SCREEN_RECORDING_REGION,
	);

	const recorderRef = React.useRef<MediaRecorder | null>(null);
	const sourceStreamsRef = React.useRef<MediaStream[]>([]);
	const recordingStreamRef = React.useRef<MediaStream | null>(null);
	const chunksRef = React.useRef<Blob[]>([]);
	const shouldSaveRef = React.useRef(false);
	const elapsedTimerRef = React.useRef<number | null>(null);
	const countdownTimerRef = React.useRef<number | null>(null);
	const countdownResolveRef = React.useRef<
		((completed: boolean) => void) | null
	>(null);
	const requestIdRef = React.useRef(0);
	const openRef = React.useRef(open);
	const modeRef = React.useRef(mode);
	const startedAtRef = React.useRef(0);
	const regionCleanupRef = React.useRef<(() => void) | null>(null);
	const screenVideoRef = React.useRef<HTMLVideoElement | null>(null);

	React.useEffect(() => {
		openRef.current = open;
	}, [open]);

	React.useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	const selectedMode = getModeConfig(mode);
	const isRecording = status === "recording";
	const busy = isBusy(status);

	const clearElapsedTimer = React.useCallback(() => {
		if (elapsedTimerRef.current === null) return;
		window.clearInterval(elapsedTimerRef.current);
		elapsedTimerRef.current = null;
	}, []);

	const stopStreams = React.useCallback(() => {
		regionCleanupRef.current?.();
		regionCleanupRef.current = null;

		for (const stream of sourceStreamsRef.current) {
			stream.getTracks().forEach((track) => track.stop());
		}
		sourceStreamsRef.current = [];

		recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
		recordingStreamRef.current = null;

		setPreviewStream(null);
		setAudioPreviewStream(null);
	}, []);

	const clearRecordingSession = React.useCallback(() => {
		clearElapsedTimer();
		stopStreams();
		recorderRef.current = null;
		chunksRef.current = [];
		shouldSaveRef.current = false;
	}, [clearElapsedTimer, stopStreams]);

	const refreshDevices = React.useCallback(async () => {
		if (!navigator.mediaDevices?.enumerateDevices) {
			setAudioDevices([]);
			setVideoDevices([]);
			return;
		}
		const mediaDevices = await navigator.mediaDevices.enumerateDevices();
		const nextAudioDevices = mediaDevices.filter(
			(device) => device.kind === "audioinput",
		);
		const nextVideoDevices = mediaDevices.filter(
			(device) => device.kind === "videoinput",
		);
		setAudioDevices(nextAudioDevices);
		setVideoDevices(nextVideoDevices);
		setSelectedAudioDeviceId((current) =>
			current === DEFAULT_AUDIO_INPUT_DEVICE_ID ||
			nextAudioDevices.some((device) => device.deviceId === current)
				? current
				: DEFAULT_AUDIO_INPUT_DEVICE_ID,
		);
		setSelectedVideoDeviceId((current) =>
			current === DEFAULT_VIDEO_INPUT_DEVICE_ID ||
			nextVideoDevices.some((device) => device.deviceId === current)
				? current
				: DEFAULT_VIDEO_INPUT_DEVICE_ID,
		);
	}, []);

	const refreshPermissionStates = React.useCallback(async () => {
		const [microphone, camera, screen] = await Promise.all([
			readRecordingPermissionState({ name: "microphone" }),
			readRecordingPermissionState({ name: "camera" }),
			readRecordingPermissionState({ name: "display-capture" }),
		]);
		setPermissionStates({ microphone, camera, screen });
	}, []);

	const cancelCountdown = React.useCallback(() => {
		if (countdownTimerRef.current !== null) {
			window.clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
		countdownResolveRef.current?.(false);
		countdownResolveRef.current = null;
		setCountdownRemaining(0);
	}, []);

	const runCountdown = React.useCallback((seconds: number) => {
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

	const importRecording = React.useCallback(
		async ({
			blob,
			fallbackSeconds,
			recordingMode,
		}: {
			blob: Blob;
			fallbackSeconds: number;
			recordingMode: RecordingMode;
		}) => {
			const activeProject = editor.project.getActiveOrNull();
			if (!activeProject) {
				throw new Error("No active project");
			}

			const file = createRecordingFile({ mode: recordingMode, blob });
			const processedAssets = await processMediaAssets({ files: [file] });
			const asset = processedAssets[0];
			if (!asset) {
				throw new Error("Could not process recording");
			}
			if (asset.type !== "audio" && asset.type !== "video") {
				throw new Error("Recording is not a timeline media asset");
			}

			const mediaType: TimelineMediaType = asset.type;
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
				mediaType,
				name: asset.name,
				duration,
				startTime: editor.playback.getCurrentTime(),
			});
			const insertCommand = new InsertElementCommand({
				element,
				placement: {
					mode: "auto",
					trackType: mediaType === "audio" ? "audio" : "video",
				},
			});
			editor.command.execute({
				command: new BatchCommand([addMediaCommand, insertCommand]),
			});
		},
		[editor],
	);

	const handleRecorderStop = React.useCallback(
		async ({
			mimeType,
			elapsed,
			recordingMode,
		}: {
			mimeType: string;
			elapsed: number;
			recordingMode: RecordingMode;
		}) => {
			const chunks = chunksRef.current;
			const shouldSave = shouldSaveRef.current;
			clearRecordingSession();
			if (!shouldSave) {
				setStatus("idle");
				return;
			}
			if (chunks.length === 0) {
				setStatus("idle");
				toast.error("No media was captured");
				return;
			}

			setStatus("saving");
			try {
				const blob = new Blob(chunks, {
					type:
						mimeType ||
						chunks[0]?.type ||
						(recordingMode === "audio" ? "audio/webm" : "video/webm"),
				});
				await importRecording({
					blob,
					fallbackSeconds: elapsed,
					recordingMode,
				});
				toast.success(
					recordingMode === "audio"
						? "Audio recording added to timeline"
						: "Video recording added to timeline",
				);
				setOpen(false);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Could not save recording",
				);
			} finally {
				setStatus("idle");
			}
		},
		[clearRecordingSession, importRecording],
	);

	const startRecorder = React.useCallback(
		async ({
			stream,
			recordingMode,
			mimeType,
		}: {
			stream: MediaStream;
			recordingMode: RecordingMode;
			mimeType: string;
		}) => {
			const recorder = new MediaRecorder(
				stream,
				mimeType ? { mimeType } : undefined,
			);
			startedAtRef.current = performance.now();
			recordingStreamRef.current = stream;
			recorderRef.current = recorder;
			chunksRef.current = [];
			shouldSaveRef.current = true;
			recorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					chunksRef.current.push(event.data);
				}
			};
			recorder.onerror = () => {
				toast.error("Recording stopped unexpectedly");
			};
			recorder.onstop = () => {
				const elapsed = Math.max(
					0,
					(performance.now() - startedAtRef.current) / 1000,
				);
				void handleRecorderStop({
					mimeType: recorder.mimeType || mimeType,
					elapsed,
					recordingMode,
				});
			};
			recorder.start(1_000);
			setStatus("recording");
			elapsedTimerRef.current = window.setInterval(() => {
				setElapsedSeconds(
					Math.max(0, (performance.now() - startedAtRef.current) / 1000),
				);
			}, 250);
		},
		[handleRecorderStop],
	);

	const cancelRecording = React.useCallback(() => {
		requestIdRef.current += 1;
		cancelCountdown();
		const recorder = recorderRef.current;
		shouldSaveRef.current = false;
		if (recorder && recorder.state !== "inactive") {
			recorder.stop();
		} else {
			clearRecordingSession();
			setStatus("idle");
		}
	}, [cancelCountdown, clearRecordingSession]);

	React.useEffect(() => {
		return () => {
			cancelRecording();
		};
	}, [cancelRecording]);

	const startPreparedRecording = React.useCallback(
		async ({
			stream,
			recordingMode,
			requestId,
			preview,
		}: {
			stream: MediaStream;
			recordingMode: RecordingMode;
			requestId: number;
			preview?: MediaStream;
		}) => {
			const didFinishCountdown = await runCountdown(countdownSeconds);
			if (
				!didFinishCountdown ||
				requestIdRef.current !== requestId ||
				!openRef.current
			) {
				stream.getTracks().forEach((track) => track.stop());
				if (preview && preview !== stream) {
					preview.getTracks().forEach((track) => track.stop());
				}
				setStatus("idle");
				return;
			}

			const mimeType =
				recordingMode === "audio"
					? getSupportedAudioRecordingMimeType()
					: getSupportedVideoRecordingMimeType();
			await startRecorder({ stream, recordingMode, mimeType });
		},
		[countdownSeconds, runCountdown, startRecorder],
	);

	const requestMicrophoneStream = React.useCallback(async () => {
		const deviceId =
			selectedAudioDeviceId === DEFAULT_AUDIO_INPUT_DEVICE_ID
				? undefined
				: selectedAudioDeviceId;
		return navigator.mediaDevices.getUserMedia(
			buildAudioRecordingConstraints({ deviceId }),
		);
	}, [selectedAudioDeviceId]);

	const startAudioRecording = React.useCallback(
		async (requestId: number) => {
			const stream = await requestMicrophoneStream();
			if (requestIdRef.current !== requestId || !openRef.current) {
				stream.getTracks().forEach((track) => track.stop());
				setStatus("idle");
				return;
			}
			sourceStreamsRef.current = [stream];
			setAudioPreviewStream(stream);
			setPermissionStates((current) => ({ ...current, microphone: "granted" }));
			void refreshDevices().catch(() => undefined);
			await startPreparedRecording({
				stream,
				recordingMode: "audio",
				requestId,
			});
		},
		[refreshDevices, requestMicrophoneStream, startPreparedRecording],
	);

	const startCameraRecording = React.useCallback(
		async (requestId: number) => {
			const videoDeviceId =
				selectedVideoDeviceId === DEFAULT_VIDEO_INPUT_DEVICE_ID
					? undefined
					: selectedVideoDeviceId;
			const audioDeviceId =
				selectedAudioDeviceId === DEFAULT_AUDIO_INPUT_DEVICE_ID
					? undefined
					: selectedAudioDeviceId;
			const stream = await navigator.mediaDevices.getUserMedia(
				buildCameraRecordingConstraints({
					videoDeviceId,
					audioDeviceId,
					includeMicrophone,
				}),
			);
			if (requestIdRef.current !== requestId || !openRef.current) {
				stream.getTracks().forEach((track) => track.stop());
				setStatus("idle");
				return;
			}
			sourceStreamsRef.current = [stream];
			setPreviewStream(stream);
			setPermissionStates((current) => ({
				...current,
				camera: "granted",
				...(includeMicrophone ? { microphone: "granted" } : {}),
			}));
			void refreshDevices().catch(() => undefined);
			await startPreparedRecording({
				stream,
				recordingMode: "camera",
				requestId,
			});
		},
		[
			includeMicrophone,
			refreshDevices,
			selectedAudioDeviceId,
			selectedVideoDeviceId,
			startPreparedRecording,
		],
	);

	const startScreenRecording = React.useCallback(
		async (requestId: number) => {
			if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
				throw new Error("Screen recording is not available in this browser");
			}

			const screenStream = await navigator.mediaDevices.getDisplayMedia(
				buildDisplayMediaOptions(),
			);
			let microphoneStream: MediaStream | null = null;
			if (includeMicrophone) {
				try {
					microphoneStream = await requestMicrophoneStream();
				} catch {
					microphoneStream = null;
					toast.error("Microphone could not be added to this screen recording");
				}
			}

			if (requestIdRef.current !== requestId || !openRef.current) {
				screenStream.getTracks().forEach((track) => track.stop());
				microphoneStream?.getTracks().forEach((track) => track.stop());
				setStatus("idle");
				return;
			}

			sourceStreamsRef.current = microphoneStream
				? [screenStream, microphoneStream]
				: [screenStream];
			setPreviewStream(screenStream);
			setPermissionStates((current) => ({
				...current,
				screen: "granted",
				...(microphoneStream ? { microphone: "granted" } : {}),
			}));
			void refreshDevices().catch(() => undefined);

			if (screenArea === "region") {
				setStatus("selecting-region");
				return;
			}

			await startPreparedRecording({
				stream: combineMediaStreams({
					streams: [screenStream, microphoneStream],
				}),
				recordingMode: "screen",
				requestId,
			});
		},
		[
			includeMicrophone,
			refreshDevices,
			requestMicrophoneStream,
			screenArea,
			startPreparedRecording,
		],
	);

	const startRecording = React.useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			toast.error("Recording is not available in this browser");
			return;
		}
		if (typeof MediaRecorder === "undefined") {
			toast.error("Recording is not available in this browser");
			return;
		}

		requestIdRef.current += 1;
		const requestId = requestIdRef.current;
		setStatus("requesting");
		setElapsedSeconds(0);
		setCountdownRemaining(0);
		stopStreams();

		try {
			if (mode === "audio") {
				await startAudioRecording(requestId);
			} else if (mode === "camera") {
				await startCameraRecording(requestId);
			} else {
				await startScreenRecording(requestId);
			}
		} catch (error) {
			clearRecordingSession();
			setStatus("idle");
			void refreshPermissionStates();
			toast.error(
				error instanceof Error ? error.message : "Recording permission denied",
			);
		}
	}, [
		clearRecordingSession,
		mode,
		refreshPermissionStates,
		startAudioRecording,
		startCameraRecording,
		startScreenRecording,
		stopStreams,
	]);

	const startRegionRecording = React.useCallback(async () => {
		const sourceStream = sourceStreamsRef.current.find(
			(stream) => stream.getVideoTracks().length > 0,
		);
		const video = screenVideoRef.current;
		if (!sourceStream || !video) {
			toast.error("Screen preview is not ready");
			return;
		}

		const requestId = requestIdRef.current;
		try {
			const { stream, cleanup } = createRegionRecordingStream({
				sourceStream,
				video,
				region: screenRegion,
				audioStreams: sourceStreamsRef.current,
			});
			regionCleanupRef.current = cleanup;
			setPreviewStream(stream);
			await startPreparedRecording({
				stream,
				recordingMode: "screen",
				requestId,
				preview: sourceStream,
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Could not start region recording",
			);
		}
	}, [screenRegion, startPreparedRecording]);

	const stopRecording = React.useCallback(() => {
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
			void refreshPermissionStates();
		}
		if (!nextOpen && busy) {
			cancelRecording();
		}
		setOpen(nextOpen);
	};

	const selectMode = (nextMode: RecordingMode) => {
		if (busy) return;
		setMode(nextMode);
		setOpen(true);
	};

	const statusLabel =
		status === "requesting"
			? "Requesting access"
			: status === "selecting-region"
				? "Select region"
				: status === "countdown"
					? `Starting in ${countdownRemaining}`
					: status === "recording"
						? `Recording ${formatRecordingDuration(elapsedSeconds)}`
						: status === "saving"
							? "Saving to project"
							: "Ready";

	const primaryActionLabel =
		status === "recording"
			? "Stop and add"
			: status === "selecting-region"
				? "Record selection"
				: "Start recording";

	const selectedAudioValue =
		selectedAudioDeviceId || DEFAULT_AUDIO_INPUT_DEVICE_ID;
	const selectedVideoValue =
		selectedVideoDeviceId || DEFAULT_VIDEO_INPUT_DEVICE_ID;
	const canUseScreenCapture =
		typeof navigator !== "undefined" &&
		typeof navigator.mediaDevices?.getDisplayMedia === "function";
	const canRecordSelection =
		status !== "selecting-region" ||
		screenRegion.width > 0.06 ||
		screenRegion.height > 0.06;

	if (hidden) return null;

	return (
		<>
			<DropdownMenu>
				<Tooltip delayDuration={200}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								variant={busy ? "secondary" : "text"}
								size="icon"
								aria-label={isRecording ? "Recording" : "Record"}
								className={cn("rounded-sm", busy && "text-cyan-100")}
							>
								<HugeiconsIcon icon={isRecording ? RecordIcon : Mic02Icon} />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>
						{isRecording ? "Recording" : "Record media"}
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="start" className="w-64">
					{RECORDING_MODES.map((item) => (
						<DropdownMenuItem
							key={item.mode}
							icon={item.icon}
							disabled={busy}
							onClick={() => selectMode(item.mode)}
							className="items-start py-2"
						>
							<div className="grid gap-0.5">
								<span className="text-sm font-medium">{item.menuTitle}</span>
								<span className="text-xs text-muted-foreground">
									{item.description}
								</span>
							</div>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="max-w-4xl overflow-hidden rounded-sm p-0">
					<DialogHeader className="space-y-1">
						<DialogTitle className="flex items-center gap-2">
							<span className="flex size-7 items-center justify-center rounded-sm border bg-muted/40">
								{selectedMode.icon}
							</span>
							{selectedMode.title}
						</DialogTitle>
						<DialogDescription>{selectedMode.description}</DialogDescription>
					</DialogHeader>

					<div className="grid max-h-[70vh] min-h-[420px] grid-cols-[210px_minmax(0,1fr)] overflow-hidden">
						<div className="border-r bg-muted/15 p-4">
							<div className="grid gap-2">
								{RECORDING_MODES.map((item) => (
									<button
										key={item.mode}
										type="button"
										disabled={busy}
										aria-pressed={mode === item.mode}
										onClick={() => setMode(item.mode)}
										className={cn(
											"focus-visible:ring-ring flex items-start gap-3 rounded-sm border px-3 py-2 text-left transition-colors focus:outline-hidden focus-visible:ring-1",
											mode === item.mode
												? "border-cyan-300/30 bg-cyan-300/10 text-foreground"
												: "border-transparent text-muted-foreground hover:border-border hover:bg-muted/30 hover:text-foreground",
											busy && "cursor-not-allowed opacity-70",
										)}
									>
										<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center">
											{item.icon}
										</span>
										<span className="grid gap-0.5">
											<span className="text-sm font-medium">
												{item.menuTitle}
											</span>
											<span className="text-xs leading-snug">
												{item.description}
											</span>
										</span>
									</button>
								))}
							</div>

							<div className="mt-4 rounded-sm border border-border/70 bg-background/50 p-3">
								<div className="text-xs font-medium text-muted-foreground">
									Status
								</div>
								<div className="mt-1 text-sm font-semibold text-foreground">
									{statusLabel}
								</div>
								{status === "recording" ? (
									<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
										<span className="size-2 rounded-full bg-red-500" />
										Live capture
									</div>
								) : null}
							</div>
						</div>

						<div className="flex min-h-0 flex-col">
							<div className="min-h-0 flex-1 overflow-y-auto p-5">
								<div
									className={cn(
										"grid gap-5",
										mode !== "audio" &&
											"lg:grid-cols-[minmax(0,1fr)_270px] lg:items-start",
									)}
								>
									<PreviewPanel
										mode={mode}
										status={status}
										title={selectedMode.previewTitle}
										previewStream={previewStream}
										audioStream={audioPreviewStream}
										screenRegion={screenRegion}
										onScreenRegionChange={setScreenRegion}
										screenVideoRef={screenVideoRef}
									/>

									<div className="grid gap-4">
										{mode !== "screen" ? (
											<DeviceSelect
												label={mode === "audio" ? "Microphone" : "Camera"}
												id={`recording-${mode}-device`}
												value={
													mode === "audio"
														? selectedAudioValue
														: selectedVideoValue
												}
												defaultValue={
													mode === "audio"
														? DEFAULT_AUDIO_INPUT_DEVICE_ID
														: DEFAULT_VIDEO_INPUT_DEVICE_ID
												}
												defaultLabel="System default"
												devices={mode === "audio" ? audioDevices : videoDevices}
												deviceKind={
													mode === "audio" ? "audioinput" : "videoinput"
												}
												fallbackLabel={
													mode === "audio" ? "Microphone" : "Camera"
												}
												disabled={busy}
												onValueChange={
													mode === "audio"
														? setSelectedAudioDeviceId
														: setSelectedVideoDeviceId
												}
												onRefresh={() => void refreshDevices()}
											/>
										) : null}

										{mode === "screen" ? (
											<div className="grid gap-3">
												<div className="grid grid-cols-2 gap-2">
													<ScreenAreaButton
														area="full"
														active={screenArea === "full"}
														disabled={busy}
														icon={<HugeiconsIcon icon={FullScreenIcon} />}
														title="Full frame"
														description="Record the selected source"
														onClick={() => setScreenArea("full")}
													/>
													<ScreenAreaButton
														area="region"
														active={screenArea === "region"}
														disabled={busy}
														icon={<HugeiconsIcon icon={CropIcon} />}
														title="Region"
														description="Draw a crop box first"
														onClick={() => setScreenArea("region")}
													/>
												</div>
												<div className="rounded-sm border border-border/75 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
													Screen access:{" "}
													<span className="font-medium text-foreground">
														{canUseScreenCapture
															? formatPermissionState({
																	state: permissionStates.screen,
																	unknownLabel: "System prompt required",
																})
															: "Unsupported"}
													</span>
												</div>
											</div>
										) : null}

										<div className="grid gap-2">
											<Label htmlFor="timeline-recording-countdown">
												Countdown
											</Label>
											<Select
												value={String(countdownSeconds)}
												onValueChange={(value) =>
													setCountdownSeconds(
														parseAudioRecordingCountdownSeconds(value),
													)
												}
												disabled={busy}
											>
												<SelectTrigger id="timeline-recording-countdown">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{AUDIO_RECORDING_COUNTDOWN_OPTIONS.map((seconds) => (
														<SelectItem key={seconds} value={String(seconds)}>
															{seconds === 0
																? "No countdown"
																: `${seconds} seconds`}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>

										{mode === "camera" || mode === "screen" ? (
											<div className="grid gap-2">
												<Label>Microphone</Label>
												<div className="flex items-center justify-between gap-3 rounded-sm border border-border/75 bg-muted/15 px-3 py-2">
													<div className="grid gap-0.5">
														<div className="text-sm font-medium">
															Record microphone audio
														</div>
														<div className="text-xs text-muted-foreground">
															{formatPermissionState({
																state: permissionStates.microphone,
																unknownLabel: "Ask on start",
															})}
														</div>
													</div>
													<Switch
														checked={includeMicrophone}
														disabled={busy}
														onCheckedChange={setIncludeMicrophone}
													/>
												</div>
												{includeMicrophone ? (
													<DeviceSelect
														label="Microphone source"
														id={`recording-${mode}-microphone`}
														value={selectedAudioValue}
														defaultValue={DEFAULT_AUDIO_INPUT_DEVICE_ID}
														defaultLabel="System default"
														devices={audioDevices}
														deviceKind="audioinput"
														fallbackLabel="Microphone"
														disabled={busy}
														onValueChange={setSelectedAudioDeviceId}
														onRefresh={() => void refreshDevices()}
													/>
												) : null}
											</div>
										) : null}
									</div>
								</div>
							</div>

							<DialogFooter className="items-center justify-between">
								<Button
									variant="outline"
									disabled={status === "saving"}
									onClick={() => {
										if (busy) {
											cancelRecording();
											return;
										}
										setOpen(false);
									}}
								>
									{busy ? "Cancel recording" : "Cancel"}
								</Button>
								<Button
									variant={isRecording ? "destructive" : "default"}
									disabled={
										status === "requesting" ||
										status === "countdown" ||
										status === "saving" ||
										!canRecordSelection
									}
									onClick={() => {
										if (isRecording) {
											stopRecording();
											return;
										}
										if (status === "selecting-region") {
											void startRegionRecording();
											return;
										}
										void startRecording();
									}}
								>
									<HugeiconsIcon icon={isRecording ? StopIcon : RecordIcon} />
									{primaryActionLabel}
								</Button>
							</DialogFooter>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{status === "countdown" ? (
				<div className="fixed inset-0 z-300 flex items-center justify-center bg-background/95 backdrop-blur-md">
					<div className="grid justify-items-center gap-4">
						<div className="text-[96px] leading-none font-semibold text-foreground">
							{countdownRemaining}
						</div>
						<div className="text-sm font-medium text-muted-foreground">
							{mode === "audio"
								? "Audio recording starts now"
								: mode === "screen"
									? "Screen recording starts now"
									: "Camera recording starts now"}
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}

function DeviceSelect({
	label,
	id,
	value,
	defaultValue,
	defaultLabel,
	devices,
	deviceKind,
	fallbackLabel,
	disabled,
	onValueChange,
	onRefresh,
}: {
	label: string;
	id: string;
	value: string;
	defaultValue: string;
	defaultLabel: string;
	devices: MediaDeviceInfo[];
	deviceKind: DeviceKind;
	fallbackLabel: string;
	disabled: boolean;
	onValueChange: (value: string) => void;
	onRefresh: () => void;
}) {
	const filteredDevices = devices.filter(
		(device) => device.kind === deviceKind,
	);

	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
				<Select value={value} onValueChange={onValueChange} disabled={disabled}>
					<SelectTrigger id={id} className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={defaultValue}>{defaultLabel}</SelectItem>
						{filteredDevices.map((device, index) => (
							<SelectItem
								key={device.deviceId || `${deviceKind}-${index}`}
								value={device.deviceId}
							>
								{getDeviceLabel({ device, index, fallback: fallbackLabel })}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="icon"
					disabled={disabled}
					onClick={onRefresh}
					title={`Refresh ${label.toLowerCase()}`}
				>
					<HugeiconsIcon icon={RefreshIcon} />
				</Button>
			</div>
		</div>
	);
}

function PreviewPanel({
	mode,
	status,
	title,
	previewStream,
	audioStream,
	screenRegion,
	onScreenRegionChange,
	screenVideoRef,
}: {
	mode: RecordingMode;
	status: RecordingStatus;
	title: string;
	previewStream: MediaStream | null;
	audioStream: MediaStream | null;
	screenRegion: ScreenRecordingRegion;
	onScreenRegionChange: (region: ScreenRecordingRegion) => void;
	screenVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between">
				<Label>{title}</Label>
				{mode === "screen" && status === "selecting-region" ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							onScreenRegionChange(DEFAULT_SCREEN_RECORDING_REGION)
						}
					>
						<HugeiconsIcon icon={CursorRectangleSelection01Icon} />
						Reset region
					</Button>
				) : null}
			</div>
			{mode === "audio" ? (
				<LiveAudioWaveform
					stream={audioStream}
					active={status === "recording"}
				/>
			) : (
				<LiveVideoPreview
					stream={previewStream}
					mode={mode}
					status={status}
					screenRegion={screenRegion}
					onScreenRegionChange={onScreenRegionChange}
					screenVideoRef={screenVideoRef}
				/>
			)}
		</div>
	);
}

function LiveVideoPreview({
	stream,
	mode,
	status,
	screenRegion,
	onScreenRegionChange,
	screenVideoRef,
}: {
	stream: MediaStream | null;
	mode: RecordingMode;
	status: RecordingStatus;
	screenRegion: ScreenRecordingRegion;
	onScreenRegionChange: (region: ScreenRecordingRegion) => void;
	screenVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
}) {
	const videoRef = React.useRef<HTMLVideoElement | null>(null);
	const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);

	React.useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.srcObject = stream;
		if (stream) {
			void video.play().catch(() => undefined);
		}
		return () => {
			video.srcObject = null;
		};
	}, [stream]);

	React.useEffect(() => {
		if (mode === "screen") {
			const video = videoRef.current;
			screenVideoRef.current = video;
			return () => {
				if (screenVideoRef.current === video) {
					screenVideoRef.current = null;
				}
			};
		}
	}, [mode, screenVideoRef, stream]);

	const canSelectRegion = mode === "screen" && status === "selecting-region";

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!canSelectRegion) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const point = getPointInRegion({ event, bounds });
		dragStartRef.current = point;
		onScreenRegionChange(
			normalizeScreenRecordingRegion({
				startX: point.x,
				startY: point.y,
				currentX: point.x,
				currentY: point.y,
			}),
		);
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!canSelectRegion || !dragStartRef.current) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const point = getPointInRegion({ event, bounds });
		onScreenRegionChange(
			normalizeScreenRecordingRegion({
				startX: dragStartRef.current.x,
				startY: dragStartRef.current.y,
				currentX: point.x,
				currentY: point.y,
			}),
		);
	};

	const clearPointer = () => {
		dragStartRef.current = null;
	};

	return (
		<div
			className={cn(
				"relative aspect-video overflow-hidden rounded-sm border bg-black",
				canSelectRegion && "cursor-crosshair",
			)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={clearPointer}
			onPointerCancel={clearPointer}
		>
			{stream ? (
				<video
					ref={videoRef}
					className="size-full object-contain"
					autoPlay
					muted
					playsInline
				/>
			) : (
				<div className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
					{mode === "screen"
						? "Select a source to preview"
						: "Camera preview appears after access is granted"}
				</div>
			)}
			{canSelectRegion && stream ? (
				<div className="absolute inset-0 bg-black/20">
					<div
						className="absolute rounded-sm border-2 border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
						style={{
							left: `${screenRegion.x * 100}%`,
							top: `${screenRegion.y * 100}%`,
							width: `${screenRegion.width * 100}%`,
							height: `${screenRegion.height * 100}%`,
						}}
					>
						<span className="absolute -top-7 left-0 rounded-sm bg-cyan-300 px-2 py-1 text-xs font-medium text-cyan-950">
							Recorded region
						</span>
					</div>
				</div>
			) : null}
		</div>
	);
}

function LiveAudioWaveform({
	stream,
	active,
}: {
	stream: MediaStream | null;
	active: boolean;
}) {
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

	React.useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const context = canvas.getContext("2d");
		if (!context) return;

		let frameId: number | null = null;
		let audioContext: AudioContext | null = null;
		let source: MediaStreamAudioSourceNode | null = null;
		let analyser: AnalyserNode | null = null;
		let stopped = false;

		const drawIdle = () => {
			const { width, height } = canvas;
			context.clearRect(0, 0, width, height);
			context.fillStyle = "rgba(148, 163, 184, 0.12)";
			for (let index = 0; index < 28; index++) {
				const barWidth = width / 44;
				const x = index * (barWidth + width / 90) + width * 0.08;
				const barHeight = 8 + (index % 5) * 5;
				context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
			}
		};

		const draw = () => {
			if (stopped) return;
			const { width, height } = canvas;
			context.clearRect(0, 0, width, height);

			if (!active || !analyser) {
				drawIdle();
				frameId = window.requestAnimationFrame(draw);
				return;
			}

			const data = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteTimeDomainData(data);
			const bars = 36;
			const barGap = 3;
			const barWidth = Math.max(3, (width - barGap * (bars - 1)) / bars);
			context.fillStyle = "rgb(34, 211, 238)";

			for (let index = 0; index < bars; index++) {
				const start = Math.floor((index / bars) * data.length);
				const end = Math.floor(((index + 1) / bars) * data.length);
				let peak = 0;
				for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
					const sample = Math.abs((data[sampleIndex] ?? 128) - 128) / 128;
					peak = Math.max(peak, sample);
				}
				const barHeight = Math.max(8, peak * height * 0.85);
				const x = index * (barWidth + barGap);
				context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
			}

			frameId = window.requestAnimationFrame(draw);
		};

		if (stream && stream.getAudioTracks().length > 0) {
			const AudioContextConstructor =
				window.AudioContext ||
				(window as typeof window & { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (AudioContextConstructor) {
				audioContext = new AudioContextConstructor();
				source = audioContext.createMediaStreamSource(stream);
				analyser = audioContext.createAnalyser();
				analyser.fftSize = 1024;
				source.connect(analyser);
			}
		}

		draw();

		return () => {
			stopped = true;
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
			}
			source?.disconnect();
			analyser?.disconnect();
			void audioContext?.close().catch(() => undefined);
		};
	}, [active, stream]);

	return (
		<div className="rounded-sm border bg-black/90 p-3">
			<canvas
				ref={canvasRef}
				width={520}
				height={128}
				className="h-28 w-full"
			/>
		</div>
	);
}

function ScreenAreaButton({
	active,
	disabled,
	icon,
	title,
	description,
	onClick,
}: {
	area: ScreenRecordingArea;
	active: boolean;
	disabled: boolean;
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex items-start gap-3 rounded-sm border px-3 py-2 text-left transition-colors",
				active
					? "border-cyan-300/30 bg-cyan-300/10"
					: "border-border/75 bg-muted/15 hover:bg-muted/30",
				disabled && "cursor-not-allowed opacity-70",
			)}
		>
			<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
				{icon}
			</span>
			<span className="grid gap-0.5">
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">{description}</span>
			</span>
		</button>
	);
}
