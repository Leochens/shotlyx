import { describe, expect, test } from "bun:test";
import {
	AUDIO_RECORDING_COUNTDOWN_OPTIONS,
	buildAudioRecordingConstraints,
	createAudioRecordingFile,
	formatRecordingDuration,
	getAudioRecordingExtension,
	getSupportedAudioRecordingMimeType,
	parseAudioRecordingCountdownSeconds,
} from "@/media/audio-recording";

describe("audio recording helpers", () => {
	test("keeps the supported countdown options narrow and explicit", () => {
		expect(AUDIO_RECORDING_COUNTDOWN_OPTIONS).toEqual([0, 3, 5]);
	});

	test("parses countdown select values without widening the option set", () => {
		expect(parseAudioRecordingCountdownSeconds("0")).toBe(0);
		expect(parseAudioRecordingCountdownSeconds("3")).toBe(3);
		expect(parseAudioRecordingCountdownSeconds("5")).toBe(5);
		expect(parseAudioRecordingCountdownSeconds("9")).toBe(0);
	});

	test("builds microphone constraints with the selected input device", () => {
		expect(buildAudioRecordingConstraints({ deviceId: "mic-1" })).toMatchObject(
			{
				audio: {
					deviceId: { exact: "mic-1" },
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			},
		);
	});

	test("omits device constraints for the system default microphone", () => {
		expect(buildAudioRecordingConstraints({ deviceId: "" })).toEqual({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});
	});

	test("selects the first supported browser recording mime type", () => {
		const mimeType = getSupportedAudioRecordingMimeType({
			isTypeSupported: (value) => value === "audio/webm;codecs=opus",
		});

		expect(mimeType).toBe("audio/webm;codecs=opus");
	});

	test("creates a stable audio file name from the recording time", () => {
		const file = createAudioRecordingFile({
			blob: new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
			now: new Date("2026-06-04T08:09:10Z"),
		});

		expect(file.name).toBe("shotlyx-recording-20260604-080910.webm");
		expect(file.type).toBe("audio/webm;codecs=opus");
	});

	test("maps common audio recording mime types to importable extensions", () => {
		expect(getAudioRecordingExtension("audio/webm;codecs=opus")).toBe("webm");
		expect(getAudioRecordingExtension("audio/mp4")).toBe("m4a");
		expect(getAudioRecordingExtension("audio/ogg;codecs=opus")).toBe("ogg");
		expect(getAudioRecordingExtension("audio/wav")).toBe("wav");
	});

	test("formats recording duration for compact toolbar status", () => {
		expect(formatRecordingDuration(4.2)).toBe("0:04");
		expect(formatRecordingDuration(65)).toBe("1:05");
	});
});
