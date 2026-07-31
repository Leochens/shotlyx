export const AUDIO_RECORDING_COUNTDOWN_OPTIONS = [0, 3, 5] as const;

export type AudioRecordingCountdownSeconds =
	(typeof AUDIO_RECORDING_COUNTDOWN_OPTIONS)[number];

const AUDIO_RECORDING_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
	"audio/ogg;codecs=opus",
] as const;

export function buildAudioRecordingConstraints({
	deviceId,
}: {
	deviceId?: string;
}): MediaStreamConstraints {
	return {
		audio: {
			...(deviceId ? { deviceId: { exact: deviceId } } : {}),
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
		},
	};
}

export function parseAudioRecordingCountdownSeconds(
	value: string,
): AudioRecordingCountdownSeconds {
	switch (value) {
		case "3":
			return 3;
		case "5":
			return 5;
		default:
			return 0;
	}
}

export function getSupportedAudioRecordingMimeType({
	isTypeSupported = (value) =>
		typeof MediaRecorder !== "undefined" &&
		MediaRecorder.isTypeSupported(value),
}: {
	isTypeSupported?: (mimeType: string) => boolean;
} = {}): string {
	return (
		AUDIO_RECORDING_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ??
		""
	);
}

export function getAudioRecordingExtension(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("mp4") || normalized.includes("aac")) return "m4a";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("wav")) return "wav";
	return "webm";
}

function padDatePart(value: number): string {
	return String(value).padStart(2, "0");
}

export function createAudioRecordingFile({
	blob,
	now = new Date(),
}: {
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
	const extension = getAudioRecordingExtension(blob.type);
	return new File(
		[blob],
		`shotlyx-recording-${timestamp}-${time}.${extension}`,
		{
			type: blob.type || "audio/webm",
		},
	);
}

export function formatRecordingDuration(seconds: number): string {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(safeSeconds / 60);
	const remainingSeconds = safeSeconds % 60;
	return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}
