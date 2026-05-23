import type { ShotlyxMGAsset } from "./types";

const previewUrlCache = new Map<string, string>();

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

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

	const label = escapeXml(asset.name || "Shotlyx MG");
	const runtime = escapeXml(asset.runtime);
	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
			<rect width="${size}" height="${size}" rx="${size * 0.08}" fill="#0d1117"/>
			<rect x="${size * 0.08}" y="${size * 0.18}" width="${size * 0.84}" height="${size * 0.58}" rx="${size * 0.05}" fill="#161b22" stroke="#38bdf8" stroke-opacity="0.55" stroke-width="${Math.max(2, size * 0.008)}"/>
			<text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#f8fafc" font-size="${Math.max(16, size * 0.055)}" font-family="Inter, Arial, sans-serif" font-weight="700">${label}</text>
			<text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" fill="#7dd3fc" font-size="${Math.max(10, size * 0.028)}" font-family="monospace">${runtime}</text>
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
