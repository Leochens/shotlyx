import { describe, expect, test } from "bun:test";
import {
	buildCameraRecordingConstraints,
	createRecordingFile,
	formatPermissionState,
	getSupportedVideoRecordingMimeType,
	getVideoRecordingExtension,
	normalizeScreenRecordingRegion,
} from "@/media/recording";

describe("recording helpers", () => {
	test("selects the first supported browser video recording mime type", () => {
		const mimeType = getSupportedVideoRecordingMimeType({
			isTypeSupported: (value) => value === "video/webm;codecs=vp8,opus",
		});

		expect(mimeType).toBe("video/webm;codecs=vp8,opus");
	});

	test("maps video recording mime types to importable extensions", () => {
		expect(getVideoRecordingExtension("video/webm;codecs=vp9,opus")).toBe(
			"webm",
		);
		expect(getVideoRecordingExtension("video/mp4")).toBe("mp4");
		expect(getVideoRecordingExtension("video/x-matroska;codecs=av1,opus")).toBe(
			"mkv",
		);
	});

	test("creates stable recording file names per mode", () => {
		const now = new Date("2026-06-04T08:09:10Z");

		expect(
			createRecordingFile({
				mode: "screen",
				blob: new Blob(["video"], { type: "video/webm" }),
				now,
			}).name,
		).toBe("shotlyx-screen-20260604-080910.webm");
		expect(
			createRecordingFile({
				mode: "camera",
				blob: new Blob(["video"], { type: "video/mp4" }),
				now,
			}).name,
		).toBe("shotlyx-camera-20260604-080910.mp4");
		expect(
			createRecordingFile({
				mode: "audio",
				blob: new Blob(["audio"], { type: "audio/webm;codecs=opus" }),
				now,
			}).name,
		).toBe("shotlyx-audio-20260604-080910.webm");
	});

	test("builds camera constraints with optional microphone capture", () => {
		expect(
			buildCameraRecordingConstraints({
				videoDeviceId: "cam-1",
				audioDeviceId: "mic-1",
				includeMicrophone: true,
			}),
		).toMatchObject({
			video: {
				deviceId: { exact: "cam-1" },
				width: { ideal: 1920 },
				height: { ideal: 1080 },
				frameRate: { ideal: 30, max: 60 },
			},
			audio: {
				deviceId: { exact: "mic-1" },
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});

		expect(
			buildCameraRecordingConstraints({
				includeMicrophone: false,
			}).audio,
		).toBe(false);
	});

	test("normalizes screen regions from drag coordinates", () => {
		const reversedRegion = normalizeScreenRecordingRegion({
			startX: 0.8,
			startY: 0.7,
			currentX: 0.2,
			currentY: 0.3,
		});
		expect(reversedRegion.x).toBe(0.2);
		expect(reversedRegion.y).toBe(0.3);
		expect(reversedRegion.width).toBeCloseTo(0.6);
		expect(reversedRegion.height).toBeCloseTo(0.4);

		expect(
			normalizeScreenRecordingRegion({
				startX: 0.98,
				startY: -0.2,
				currentX: 1.5,
				currentY: 0.01,
			}),
		).toEqual({
			x: 0.94,
			y: 0,
			width: 0.06,
			height: 0.06,
		});
	});

	test("formats permission states for compact UI labels", () => {
		expect(formatPermissionState({ state: "granted" })).toBe("Allowed");
		expect(formatPermissionState({ state: "denied" })).toBe("Blocked");
		expect(formatPermissionState({ state: "prompt" })).toBe("Ask on start");
		expect(formatPermissionState({ state: "unknown" })).toBe("Prompt required");
	});
});
