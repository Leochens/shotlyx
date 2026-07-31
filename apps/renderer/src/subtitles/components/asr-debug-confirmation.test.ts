import { describe, expect, test } from "bun:test";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

import {
	buildAsrDebugConfirmation,
	formatAudioDurationSeconds,
} from "./asr-debug-confirmation";

describe("formatAudioDurationSeconds", () => {
	test("formats short ASR ranges for the confirmation gate", () => {
		expect(formatAudioDurationSeconds({ seconds: 62.345 })).toBe("01:02.3");
	});
});

describe("buildAsrDebugConfirmation", () => {
	test("keeps the selected audio source identity in the confirmation params", () => {
		const confirmation = buildAsrDebugConfirmation({
			mode: "transcript",
			range: {
				kind: "element",
				label: "Voiceover",
				startTime: 5 * MEDIA_TIME_TICKS_PER_SECOND,
				duration: 2.5 * MEDIA_TIME_TICKS_PER_SECOND,
				elementRef: {
					trackId: "voice-track",
					elementId: "voice-clip",
				},
			},
		});

		expect(confirmation).toMatchObject({
			mode: "transcript",
			label: "Voiceover",
			durationLabel: "00:02.5",
			params: {
				audioRangeStartSeconds: 5,
				audioRangeDurationSeconds: 2.5,
				audioRangeTrackId: "voice-track",
				audioRangeElementId: "voice-clip",
			},
		});
	});
});
