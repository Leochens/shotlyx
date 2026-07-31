import type { MediaAsset } from "@/media/types";
import type { BrandKitMediaAsset } from "./types";

export function resolveBrandKitMediaPreviewUrl({
	item,
	mediaAssets,
}: {
	item: BrandKitMediaAsset;
	mediaAssets: Array<Pick<MediaAsset, "id" | "thumbnailUrl" | "url">>;
}): string | null {
	const mediaAsset = mediaAssets.find(
		(asset) => asset.id === item.mediaAssetId,
	);
	return mediaAsset?.thumbnailUrl ?? mediaAsset?.url ?? null;
}
