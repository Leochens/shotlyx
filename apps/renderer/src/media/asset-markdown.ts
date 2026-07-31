export const MARKDOWN_ASSET_URL_PREFIX = "shotlyx-asset:";

export function isMarkdownAssetUrl(url: string | null | undefined): boolean {
	return Boolean(url?.startsWith(MARKDOWN_ASSET_URL_PREFIX));
}

export function getAssetIdFromMarkdownUrl(
	url: string | null | undefined,
): string | null {
	if (!isMarkdownAssetUrl(url)) return null;
	const assetId = url?.slice(MARKDOWN_ASSET_URL_PREFIX.length).trim();
	return assetId || null;
}
