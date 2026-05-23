import { buildGraphicPreviewUrl } from "@/graphics";
import type { ProjectMotionGraphicAsset } from "./types";

export function buildProjectMotionGraphicPreviewUrl({
	asset,
	size,
}: {
	asset: Pick<ProjectMotionGraphicAsset, "definitionId" | "params">;
	size?: number;
}): string {
	return buildGraphicPreviewUrl({
		definitionId: asset.definitionId,
		params: asset.params,
		size,
	});
}
