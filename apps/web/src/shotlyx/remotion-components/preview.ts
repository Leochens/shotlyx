import type { ShotlyxMGAsset } from "./types";

const previewUrlCache = new Map<string, string>();

export function buildShotlyxMGPreviewUrl({
	asset,
	size = 512,
}: {
	asset: ShotlyxMGAsset;
	size?: number;
}): string {
	const cacheKey = JSON.stringify({
		id: asset.id,
		updatedAt: asset.updatedAt,
		size,
	});
	const cached = previewUrlCache.get(cacheKey);
	if (cached) return cached;

	if (asset.document.thumbnailUrl) {
		previewUrlCache.set(cacheKey, asset.document.thumbnailUrl);
		return asset.document.thumbnailUrl;
	}

	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
			<rect width="${size}" height="${size}" rx="${size * 0.04}" fill="#050505"/>
			<circle cx="${size * 0.42}" cy="${size * 0.48}" r="${size * 0.035}" fill="#52525b" opacity="0.4"/>
			<circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.02}" fill="#71717a" opacity="0.45"/>
			<circle cx="${size * 0.58}" cy="${size * 0.47}" r="${size * 0.026}" fill="#3f3f46" opacity="0.35"/>
		</svg>
	`;
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	previewUrlCache.set(cacheKey, url);
	return url;
}

export function getShotlyxMGThumbnailFrame({
	asset,
}: {
	asset: ShotlyxMGAsset;
}): number {
	const durationInFrames = Math.max(
		1,
		Math.round(asset.document.durationSeconds * asset.document.fps),
	);
	const requestedFrame =
		typeof asset.document.thumbnailFrame === "number"
			? asset.document.thumbnailFrame
			: Math.floor(durationInFrames * 0.45);
	return Math.max(0, Math.min(durationInFrames - 1, requestedFrame));
}
