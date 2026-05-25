export type CreativeAssetType = "video" | "image";

export type CreativeAssetProvider =
	| "mock"
	| "openai-compatible"
	| "volcengine-seedance";

export interface CreativeAssetLicense {
	label: string;
	commercialUse: boolean;
	attributionRequired: boolean;
}

export interface CreativeAsset {
	id: string;
	type: CreativeAssetType;
	provider: CreativeAssetProvider;
	title: string;
	name?: string;
	url: string;
	previewUrl: string;
	downloadUrl?: string;
	thumbnailUrl?: string;
	sizeBytes?: number;
	duration?: number;
	width?: number;
	height?: number;
	mediaAssetId?: string;
	prompt?: string;
	model?: string;
	license?: CreativeAssetLicense;
}

export type RegisterCreativeAssetInput = Omit<CreativeAsset, "id">;
