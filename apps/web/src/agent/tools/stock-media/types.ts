import type { ExternalMediaSource } from "@/services/storage/types";

export const STOCK_MEDIA_TYPES = ["video", "image", "audio"] as const;
export type StockMediaType = (typeof STOCK_MEDIA_TYPES)[number];

export const STOCK_MEDIA_PROVIDERS = ["pexels", "pixabay", "freesound"] as const;
export type StockMediaProviderId = (typeof STOCK_MEDIA_PROVIDERS)[number];

export const STOCK_ORIENTATIONS = ["landscape", "portrait", "square"] as const;
export type StockOrientation = (typeof STOCK_ORIENTATIONS)[number];

export const STOCK_RESOLUTIONS = ["hd", "fullhd", "4k"] as const;
export type StockResolution = (typeof STOCK_RESOLUTIONS)[number];

export const LICENSE_POLICIES = [
	"safe-commercial",
	"allow-attribution",
	"public-domain-only",
] as const;
export type LicensePolicy = (typeof LICENSE_POLICIES)[number];

export interface StockSearchInput {
	query: string;
	type: StockMediaType;
	orientation?: StockOrientation;
	durationSeconds?: {
		min?: number;
		max?: number;
	};
	resolution?: StockResolution;
	locale?: string;
	count?: number;
	page?: number;
	licensePolicy?: LicensePolicy;
	providers?: StockMediaProviderId[];
}

export type StockAssetLicense = ExternalMediaSource["license"];

export interface StockAssetScore {
	total: number;
	semantic: number;
	orientation: number;
	duration: number;
	resolution: number;
	licenseSafety: number;
	freshness?: number;
	providerReliability: number;
}

export interface StockAssetInput {
	provider: StockMediaProviderId;
	providerAssetId: string;
	type: StockMediaType;
	title: string;
	previewUrl: string;
	thumbnailUrl?: string;
	downloadUrl?: string;
	sourceUrl: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
	durationSeconds?: number;
	author?: {
		name?: string;
		url?: string;
	};
	license: StockAssetLicense;
	score?: StockAssetScore;
}

export interface StockAsset extends StockAssetInput {
	id: string;
	mediaAssetId?: string;
	name?: string;
	sizeBytes?: number;
}

export interface StockMediaProvider {
	id: StockMediaProviderId;
	search(input: StockSearchInput): Promise<StockAssetInput[]>;
}
