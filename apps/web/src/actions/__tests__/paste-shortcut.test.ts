import { describe, expect, test } from "bun:test";
import { shouldDeferToNativePasteEvent } from "../paste-shortcut";

describe("shouldDeferToNativePasteEvent", () => {
	test("lets the native paste event handle the platform paste shortcut", () => {
		expect(
			shouldDeferToNativePasteEvent({
				binding: "ctrl+v",
				boundAction: "paste-copied",
			}),
		).toBe(true);
	});

	test("keeps custom paste bindings handled by the editor keybinding path", () => {
		expect(
			shouldDeferToNativePasteEvent({
				binding: "v",
				boundAction: "paste-copied",
			}),
		).toBe(false);
	});

	test("keeps uninterrupted internal copies on the editor keybinding path", () => {
		expect(
			shouldDeferToNativePasteEvent({
				binding: "ctrl+v",
				boundAction: "paste-copied",
				shouldPreferInternalClipboard: true,
			}),
		).toBe(false);
	});

	test("does not defer other actions on the native paste shortcut", () => {
		expect(
			shouldDeferToNativePasteEvent({
				binding: "ctrl+v",
				boundAction: "split",
			}),
		).toBe(false);
	});
});
