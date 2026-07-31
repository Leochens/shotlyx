import { describe, expect, test } from "bun:test";
import {
	extractMediaFilesFromClipboard,
	shouldPasteInternalClipboardFromPasteEvent,
} from "../clipboard-media";

function clipboardItem({
	file,
	kind = "file",
	type = file.type,
}: {
	file: File;
	kind?: string;
	type?: string;
}) {
	return {
		kind,
		type,
		getAsFile: () => file,
	};
}

describe("extractMediaFilesFromClipboard", () => {
	test("extracts image, video, and audio files from clipboard items", () => {
		const image = new File(["image"], "frame.png", { type: "image/png" });
		const video = new File(["video"], "clip.mp4", { type: "video/mp4" });
		const audio = new File(["audio"], "voice.wav", { type: "audio/wav" });
		const text = new File(["text"], "note.txt", { type: "text/plain" });

		const files = extractMediaFilesFromClipboard({
			clipboardData: {
				items: [
					clipboardItem({ file: image }),
					clipboardItem({ file: video }),
					clipboardItem({ file: audio }),
					clipboardItem({ file: text }),
					clipboardItem({ file: image, kind: "string" }),
				],
			},
		});

		expect(files).toEqual([image, video, audio]);
	});
});

describe("shouldPasteInternalClipboardFromPasteEvent", () => {
	test("uses media files after the external clipboard may have changed", () => {
		expect(
			shouldPasteInternalClipboardFromPasteEvent({
				mediaFilesCount: 1,
				hasInternalClipboardEntry: true,
				shouldPreferInternalClipboard: false,
			}),
		).toBe(false);
	});

	test("keeps uninterrupted internal copies ahead of stale media files", () => {
		expect(
			shouldPasteInternalClipboardFromPasteEvent({
				mediaFilesCount: 1,
				hasInternalClipboardEntry: true,
				shouldPreferInternalClipboard: true,
			}),
		).toBe(true);
	});

	test("uses the internal clipboard only when no media files are present", () => {
		expect(
			shouldPasteInternalClipboardFromPasteEvent({
				mediaFilesCount: 0,
				hasInternalClipboardEntry: true,
			}),
		).toBe(true);
		expect(
			shouldPasteInternalClipboardFromPasteEvent({
				mediaFilesCount: 0,
				hasInternalClipboardEntry: false,
			}),
		).toBe(false);
	});
});
