import type { MediaAsset } from "@/media/types";
import { formatLinearRgba, parseColorToLinearRgba } from "@/params";
import {
	SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
} from "./project-assets";
import type { ShotlyxMGAsset, ShotlyxMGPropValue } from "./types";

const MEDIA_ASSET_REF_PREFIX = "media:";

const MISSING_IMAGE_DATA_URL =
	"data:image/svg+xml;charset=utf-8," +
	encodeURIComponent(
		[
			'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">',
			'<rect width="1280" height="720" fill="#111827"/>',
			'<rect x="320" y="210" width="640" height="300" rx="28" fill="none" stroke="#334155" stroke-width="8"/>',
			'<text x="640" y="370" fill="#94a3b8" font-family="Arial, sans-serif" font-size="42" font-weight="700" text-anchor="middle">Missing media</text>',
			'<text x="640" y="430" fill="#64748b" font-family="Arial, sans-serif" font-size="24" text-anchor="middle">Replace this asset from the media library</text>',
			"</svg>",
		].join(""),
	);

function isShotlyxMGPropValue(value: unknown): value is ShotlyxMGPropValue {
	return (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		Array.isArray(value)
	);
}

function clampOpacity(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function getNumberParam({
	params,
	key,
	fallback,
}: {
	params?: Record<string, unknown>;
	key: string;
	fallback: number;
}): number {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: fallback;
}

function getStringParam({
	params,
	key,
	fallback,
}: {
	params?: Record<string, unknown>;
	key: string;
	fallback: string;
}): string {
	const value = params?.[key];
	return typeof value === "string" && value.trim().length > 0
		? value
		: fallback;
}

function resolveShotlyxMGBackgroundOpacity({
	asset,
	params,
}: {
	asset: ShotlyxMGAsset;
	params?: Record<string, unknown>;
}): number {
	return clampOpacity(
		getNumberParam({
			params,
			key: SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
			fallback: asset.document.transparentBackground === false ? 1 : 0,
		}),
	);
}

function hasStringParam({
	params,
	key,
}: {
	params?: Record<string, unknown>;
	key: string;
}): boolean {
	const value = params?.[key];
	return typeof value === "string" && value.trim().length > 0;
}

function withOpacity({
	color,
	opacity,
}: {
	color: string;
	opacity: number;
}): string {
	const normalizedOpacity = clampOpacity(opacity);
	if (normalizedOpacity <= 0) {
		return "transparent";
	}
	const parsed = parseColorToLinearRgba({ color });
	if (!parsed) {
		return color;
	}
	return formatLinearRgba({
		color: {
			...parsed,
			a: normalizedOpacity,
		},
	});
}

function isShotlyxMGBackgroundProp({
	key,
	label,
}: {
	key: string;
	label: string;
}): boolean {
	const text = `${key} ${label}`.toLowerCase();
	return (
		text.includes("background") ||
		text.includes("backdrop") ||
		text.includes("canvas") ||
		/\bbg\b/.test(text)
	);
}

function isEmbeddedImageSource(value: string): boolean {
	return value.startsWith("data:") || value.startsWith("blob:");
}

function getMediaAssetUrl(asset: MediaAsset): string | null {
	return asset.url ?? asset.thumbnailUrl ?? null;
}

export function buildShotlyxMediaAssetRef({
	mediaAssetId,
}: {
	mediaAssetId: string;
}): string {
	return `${MEDIA_ASSET_REF_PREFIX}${mediaAssetId}`;
}

export function parseShotlyxMediaAssetRef({
	value,
}: {
	value: string;
}): string | null {
	return value.startsWith(MEDIA_ASSET_REF_PREFIX)
		? value.slice(MEDIA_ASSET_REF_PREFIX.length)
		: null;
}

export function resolveShotlyxImagePropValue({
	value,
	mediaAssets,
}: {
	value: ShotlyxMGPropValue | undefined;
	mediaAssets: MediaAsset[];
}): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		return MISSING_IMAGE_DATA_URL;
	}

	const normalizedValue = value.trim();
	const referencedMediaId =
		parseShotlyxMediaAssetRef({ value: normalizedValue }) ?? normalizedValue;
	const mediaAsset = mediaAssets.find(
		(asset) => asset.type === "image" && asset.id === referencedMediaId,
	);
	const mediaUrl = mediaAsset ? getMediaAssetUrl(mediaAsset) : null;
	if (mediaUrl) return mediaUrl;

	if (isEmbeddedImageSource(normalizedValue)) {
		return normalizedValue;
	}

	return MISSING_IMAGE_DATA_URL;
}

export function resolveShotlyxMGInputProps({
	asset,
	params,
	mediaAssets,
}: {
	asset: ShotlyxMGAsset;
	params?: Record<string, unknown>;
	mediaAssets: MediaAsset[];
}): Record<string, unknown> {
	const props: Record<string, unknown> = {
		...asset.document.defaultProps,
	};
	const backgroundOpacity = resolveShotlyxMGBackgroundOpacity({
		asset,
		params,
	});
	const backgroundColor = getStringParam({
		params,
		key: SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
		fallback: "#050505",
	});
	const hasBackgroundColorOverride = hasStringParam({
		params,
		key: SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	});

	for (const prop of asset.document.propsSchema) {
		const value = params?.[prop.key];
		if (isShotlyxMGPropValue(value)) {
			props[prop.key] = value;
		}
		if (prop.type === "color" && isShotlyxMGBackgroundProp(prop)) {
			const propValue = props[prop.key];
			const propBackgroundColor =
				typeof propValue === "string" && propValue !== "transparent"
					? propValue
					: backgroundColor;
			const sourceColor = hasBackgroundColorOverride
				? backgroundColor
				: propBackgroundColor;
			props[prop.key] = withOpacity({
				color: sourceColor,
				opacity: backgroundOpacity,
			});
		}
		if (prop.type === "image") {
			const propValue = props[prop.key];
			const imageValue = isShotlyxMGPropValue(propValue)
				? propValue
				: undefined;
			props[prop.key] = resolveShotlyxImagePropValue({
				value: imageValue,
				mediaAssets,
			});
		}
	}

	return props;
}

export function resolveShotlyxMGPlayerBackground({
	asset,
	params,
}: {
	asset: ShotlyxMGAsset;
	params?: Record<string, unknown>;
}): string {
	return withOpacity({
		color: getStringParam({
			params,
			key: SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
			fallback: "#050505",
		}),
		opacity: resolveShotlyxMGBackgroundOpacity({ asset, params }),
	});
}
