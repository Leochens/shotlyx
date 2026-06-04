import {
	buildAudioRecordingConstraints,
	getAudioRecordingExtension,
} from "@/media/audio-recording";

export type RecordingMode = "audio" | "screen" | "camera";
export type ScreenRecordingArea = "full" | "region";

export type RecordingPermissionState = PermissionState | "unknown";

export type ScreenRecordingRegion = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export const DEFAULT_SCREEN_RECORDING_REGION: ScreenRecordingRegion = {
	x: 0.12,
	y: 0.12,
	width: 0.76,
	height: 0.76,
};

const VIDEO_RECORDING_MIME_TYPES = [
	"video/webm;codecs=vp9,opus",
	"video/webm;codecs=vp8,opus",
	"video/webm",
	"video/mp4",
] as const;

const MIN_REGION_SIZE = 0.06;

function padDatePart(value: number): string {
	return String(value).padStart(2, "0");
}

export function getSupportedVideoRecordingMimeType({
	isTypeSupported = (value) =>
		typeof MediaRecorder !== "undefined" &&
		MediaRecorder.isTypeSupported(value),
}: {
	isTypeSupported?: (mimeType: string) => boolean;
} = {}): string {
	return (
		VIDEO_RECORDING_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ??
		""
	);
}

export function getVideoRecordingExtension(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mp4")) return "mp4";
	if (normalized.includes("matroska") || normalized.includes("x-matroska")) {
		return "mkv";
	}
	return "webm";
}

export function createRecordingFile({
	mode,
	blob,
	now = new Date(),
}: {
	mode: RecordingMode;
	blob: Blob;
	now?: Date;
}): File {
	const timestamp = [
		now.getUTCFullYear(),
		padDatePart(now.getUTCMonth() + 1),
		padDatePart(now.getUTCDate()),
	].join("");
	const time = [
		padDatePart(now.getUTCHours()),
		padDatePart(now.getUTCMinutes()),
		padDatePart(now.getUTCSeconds()),
	].join("");
	const extension =
		mode === "audio"
			? getAudioRecordingExtension(blob.type)
			: getVideoRecordingExtension(blob.type);
	const prefix =
		mode === "audio"
			? "shotlyx-audio"
			: mode === "screen"
				? "shotlyx-screen"
				: "shotlyx-camera";

	return new File([blob], `${prefix}-${timestamp}-${time}.${extension}`, {
		type: blob.type || (mode === "audio" ? "audio/webm" : "video/webm"),
	});
}

export function buildCameraRecordingConstraints({
	videoDeviceId,
	audioDeviceId,
	includeMicrophone,
}: {
	videoDeviceId?: string;
	audioDeviceId?: string;
	includeMicrophone: boolean;
}): MediaStreamConstraints {
	return {
		video: {
			...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
			width: { ideal: 1920 },
			height: { ideal: 1080 },
			frameRate: { ideal: 30, max: 60 },
		},
		audio: includeMicrophone
			? buildAudioRecordingConstraints({ deviceId: audioDeviceId }).audio
			: false,
	};
}

export function buildDisplayMediaOptions(): DisplayMediaStreamOptions {
	return {
		video: {
			cursor: "always",
			frameRate: { ideal: 30, max: 60 },
		} as MediaTrackConstraints & { cursor: string },
		audio: true,
	};
}

export async function readRecordingPermissionState({
	name,
}: {
	name: "microphone" | "camera" | "display-capture";
}): Promise<RecordingPermissionState> {
	if (!navigator.permissions?.query) return "unknown";
	if (name === "display-capture") return "unknown";
	try {
		const status = await navigator.permissions.query({
			name,
		});
		return status.state;
	} catch {
		return "unknown";
	}
}

export function combineMediaStreams({
	streams,
}: {
	streams: Array<MediaStream | null | undefined>;
}): MediaStream {
	const tracks = streams.flatMap((stream) => stream?.getTracks() ?? []);
	return new MediaStream(tracks);
}

export function normalizeScreenRecordingRegion({
	startX,
	startY,
	currentX,
	currentY,
}: {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
}): ScreenRecordingRegion {
	const left = Math.max(0, Math.min(1, Math.min(startX, currentX)));
	const top = Math.max(0, Math.min(1, Math.min(startY, currentY)));
	const right = Math.max(0, Math.min(1, Math.max(startX, currentX)));
	const bottom = Math.max(0, Math.min(1, Math.max(startY, currentY)));
	const width = Math.max(MIN_REGION_SIZE, right - left);
	const height = Math.max(MIN_REGION_SIZE, bottom - top);

	return {
		x: Math.min(left, 1 - width),
		y: Math.min(top, 1 - height),
		width,
		height,
	};
}

export function formatPermissionState({
	state,
	unknownLabel = "Prompt required",
}: {
	state: RecordingPermissionState;
	unknownLabel?: string;
}): string {
	switch (state) {
		case "granted":
			return "Allowed";
		case "denied":
			return "Blocked";
		case "prompt":
			return "Ask on start";
		default:
			return unknownLabel;
	}
}
