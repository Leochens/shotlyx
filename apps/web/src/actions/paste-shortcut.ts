import type { ShortcutKey } from "@/actions/keybinding";
import type { TActionWithOptionalArgs } from "@/actions/types";

const NATIVE_PASTE_SHORTCUT: ShortcutKey = "ctrl+v";

export function shouldDeferToNativePasteEvent({
	binding,
	boundAction,
	shouldPreferInternalClipboard,
}: {
	binding: ShortcutKey | null;
	boundAction: TActionWithOptionalArgs | undefined;
	shouldPreferInternalClipboard?: boolean;
}): boolean {
	return (
		binding === NATIVE_PASTE_SHORTCUT &&
		boundAction === "paste-copied" &&
		!shouldPreferInternalClipboard
	);
}
