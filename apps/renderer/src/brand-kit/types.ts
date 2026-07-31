export interface BrandKitColor {
	id: string;
	value: string;
	name?: string;
}

export type BrandKitFontRole = "heading" | "body" | "accent";

export interface BrandKitFont {
	id: string;
	family: string;
	role?: BrandKitFontRole;
}

export interface BrandKitMediaAsset {
	id: string;
	mediaAssetId: string;
	name: string;
	width?: number;
	height?: number;
}

export interface ProjectBrandKit {
	id: string;
	name: string;
	colors: BrandKitColor[];
	fonts: BrandKitFont[];
	logos: BrandKitMediaAsset[];
	images: BrandKitMediaAsset[];
	styleGuide: string;
	createdAt: string;
	updatedAt: string;
}

export interface CompactBrandKit {
	id: string;
	name: string;
	colors: string[];
	fonts: string[];
	logoMediaAssetIds: string[];
	imageMediaAssetIds: string[];
	styleGuide?: string;
}
