import { describe, expect, test } from "bun:test";
import { getVoiceCloneUploadFormat } from "../voice-clone-upload";

describe("voice clone upload helpers", () => {
	test("keeps supported uploaded audio formats for Volcengine clone", () => {
		expect(
			getVoiceCloneUploadFormat({
				fileName: "sample.mp3",
				mimeType: "audio/mpeg",
			}),
		).toBe("mp3");
		expect(
			getVoiceCloneUploadFormat({
				fileName: "sample.m4a",
				mimeType: "audio/mp4",
			}),
		).toBe("m4a");
		expect(
			getVoiceCloneUploadFormat({
				fileName: "sample",
				mimeType: "audio/wav",
			}),
		).toBe("wav");
	});
});
