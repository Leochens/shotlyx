import { describe, expect, test } from "bun:test";
import {
	CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS,
	DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER,
	getCaptionProviderStartStep,
	isCaptionTranscriptionProvider,
} from "@/subtitles/caption-provider";

describe("caption transcription provider options", () => {
	test("keeps Volcengine as the default without bundled local models", () => {
		expect(DEFAULT_CAPTION_TRANSCRIPTION_PROVIDER).toBe("volcengine");
		expect(
			CAPTION_TRANSCRIPTION_PROVIDER_OPTIONS.map((option) => option.id),
		).toEqual(["volcengine"]);
	});

	test("guards provider values from select input", () => {
		expect(isCaptionTranscriptionProvider("volcengine")).toBe(true);
		expect(isCaptionTranscriptionProvider("local")).toBe(false);
		expect(isCaptionTranscriptionProvider("tencent")).toBe(false);
	});

	test("shows provider-specific generation progress copy", () => {
		expect(getCaptionProviderStartStep({ provider: "volcengine" })).toContain(
			"Volcengine",
		);
	});
});
