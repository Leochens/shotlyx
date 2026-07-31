import type { TimelineMediaType } from "@/media/types";

const MEDIA_MIME_PREFIXES: TimelineMediaType[] = ["image", "video", "audio"];

interface ClipboardItemLike {
	kind: string;
	type: string;
	getAsFile: () => File | null;
}

interface ClipboardDataLike {
	items?: ArrayLike<ClipboardItemLike> | Iterable<ClipboardItemLike>;
}

export function isMediaMimeType({ type }: { type: string }): boolean {
	return MEDIA_MIME_PREFIXES.some((prefix) => type.startsWith(`${prefix}/`));
}

export function extractMediaFilesFromClipboard({
	clipboardData,
}: {
	clipboardData: ClipboardDataLike | null;
}): File[] {
	if (!clipboardData?.items) return [];

	const files: File[] = [];
	for (const item of Array.from(clipboardData.items)) {
		if (item.kind !== "file") continue;
		if (!isMediaMimeType({ type: item.type })) continue;

		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return files;
}

export function shouldPasteInternalClipboardFromPasteEvent({
	mediaFilesCount,
	hasInternalClipboardEntry,
	shouldPreferInternalClipboard,
}: {
	mediaFilesCount: number;
	hasInternalClipboardEntry: boolean;
	shouldPreferInternalClipboard?: boolean;
}): boolean {
	return (
		hasInternalClipboardEntry &&
		(shouldPreferInternalClipboard === true || mediaFilesCount === 0)
	);
}
