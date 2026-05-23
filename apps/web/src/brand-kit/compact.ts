import type { CompactBrandKit, ProjectBrandKit } from "./types";

const MAX_STYLE_GUIDE_LENGTH = 500;

function compactStyleGuide(styleGuide: string): string | undefined {
	const trimmed = styleGuide.trim();
	if (!trimmed) return undefined;
	if (trimmed.length <= MAX_STYLE_GUIDE_LENGTH) return trimmed;
	return `${trimmed.slice(0, MAX_STYLE_GUIDE_LENGTH)}...`;
}

export function compactBrandKit({
	kit,
}: {
	kit: ProjectBrandKit;
}): CompactBrandKit {
	return {
		id: kit.id,
		name: kit.name,
		colors: kit.colors.map((color) => color.value),
		fonts: kit.fonts.map((font) => font.family),
		logoMediaAssetIds: kit.logos.map((logo) => logo.mediaAssetId),
		imageMediaAssetIds: kit.images.map((image) => image.mediaAssetId),
		styleGuide: compactStyleGuide(kit.styleGuide),
	};
}
