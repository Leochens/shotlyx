import {
	getAssetIdFromMarkdownUrl,
	isMarkdownAssetUrl,
	MARKDOWN_ASSET_URL_PREFIX,
} from "@/media/asset-markdown";
import type { MediaAsset } from "@/media/types";

export const DRAFT_ASSET_URL_PREFIX = MARKDOWN_ASSET_URL_PREFIX;

const DRAFT_UPLOAD_MIME_PREFIXES = ["image/", "video/"] as const;

export function isDraftAssetUrl(url: string | null | undefined): boolean {
	return isMarkdownAssetUrl(url);
}

export function getDraftAssetIdFromUrl(
	url: string | null | undefined,
): string | null {
	return getAssetIdFromMarkdownUrl(url);
}

function escapeMarkdownLabel(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

export function createDraftMarkdownAssetReference({
	asset,
}: {
	asset: MediaAsset;
}): string {
	const label = escapeMarkdownLabel(asset.name || asset.id);
	const url = `${DRAFT_ASSET_URL_PREFIX}${asset.id}`;
	if (asset.type === "image") {
		return `![${label}](${url})`;
	}
	if (asset.type === "video") {
		return `[视频：${label}](${url})`;
	}
	return `[素材：${label}](${url})`;
}

export function buildDraftMarkdownAssetBlock({
	assets,
}: {
	assets: MediaAsset[];
}): string {
	return assets
		.map((asset) => createDraftMarkdownAssetReference({ asset }))
		.join("\n\n");
}

export function insertMarkdownAtRange({
	value,
	insertText,
	selectionStart,
	selectionEnd,
}: {
	value: string;
	insertText: string;
	selectionStart: number;
	selectionEnd: number;
}): string {
	const start = Math.max(0, Math.min(selectionStart, value.length));
	const end = Math.max(start, Math.min(selectionEnd, value.length));
	const before = value.slice(0, start).trimEnd();
	const after = value.slice(end).trimStart();
	const middle = insertText.trim();

	if (!middle) return value;
	if (!before && !after) return middle;
	if (!before) return `${middle}\n\n${after}`;
	if (!after) return `${before}\n\n${middle}`;
	return `${before}\n\n${middle}\n\n${after}`;
}

export function isDraftUploadMediaFile(file: File): boolean {
	return DRAFT_UPLOAD_MIME_PREFIXES.some((prefix) =>
		file.type.startsWith(prefix),
	);
}

export function extractDraftUploadFiles({
	dataTransfer,
}: {
	dataTransfer: DataTransfer | null;
}): File[] {
	if (!dataTransfer) return [];

	const filesFromItems: File[] = [];
	if (dataTransfer.items) {
		for (const item of Array.from(dataTransfer.items)) {
			if (item.kind !== "file") continue;
			const file = item.getAsFile();
			if (file && isDraftUploadMediaFile(file)) {
				filesFromItems.push(file);
			}
		}
	}
	if (filesFromItems.length > 0) return filesFromItems;

	return Array.from(dataTransfer.files ?? []).filter(isDraftUploadMediaFile);
}
