import {
	ANIMATED_STICKER_PRESETS,
	DEFAULT_ANIMATED_STICKER_DURATION,
	buildAnimatedStickerProgressAnimation,
	getAnimatedStickerParams,
	getAnimatedStickerPreset,
	type AnimatedStickerPreset,
} from "@/graphics/definitions/animated-stickers";
import type { ParamValues } from "@/params";
import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

export const ANIMATED_STICKERS_PROVIDER_ID = "animated-stickers";

function escapeSvgText({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function getPresetParams({
	preset,
}: {
	preset: AnimatedStickerPreset;
}): ParamValues {
	return getAnimatedStickerParams({ preset });
}

export function parseAnimatedStickerId({
	stickerId,
}: {
	stickerId: string;
}): AnimatedStickerPreset | null {
	try {
		const { providerId, providerValue } = parseStickerId({ stickerId });
		if (providerId !== ANIMATED_STICKERS_PROVIDER_ID) {
			return null;
		}
		return getAnimatedStickerPreset({ presetId: providerValue });
	} catch {
		return null;
	}
}

function toStickerItem({
	preset,
}: {
	preset: AnimatedStickerPreset;
}): StickerItem {
	const params = getPresetParams({ preset });
	return {
		id: buildStickerId({
			providerId: ANIMATED_STICKERS_PROVIDER_ID,
			providerValue: preset.id,
		}),
		provider: ANIMATED_STICKERS_PROVIDER_ID,
		name: preset.name,
		previewUrl: buildAnimatedStickerPreviewUrl({ preset, params }),
		metadata: {
			definitionId: preset.definitionId,
			params,
			animations: buildAnimatedStickerProgressAnimation({
				duration: DEFAULT_ANIMATED_STICKER_DURATION,
			}),
			duration: DEFAULT_ANIMATED_STICKER_DURATION,
			useCases: preset.useCases,
		},
	};
}

function buildAnimatedStickerPreviewUrl({
	preset,
	params,
}: {
	preset: AnimatedStickerPreset;
	params: ParamValues;
}): string {
	const primaryColor = String(params.primaryColor ?? "#ffffff");
	const accentColor = String(params.accentColor ?? "#facc15");
	const secondaryColor = String(params.secondaryColor ?? "#38bdf8");
	const label = escapeSvgText({ value: preset.name.slice(0, 2) });
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
		<rect width="256" height="256" fill="transparent"/>
		<circle cx="128" cy="128" r="72" fill="${accentColor}" fill-opacity="0.22"/>
		<circle cx="128" cy="128" r="52" fill="${primaryColor}" fill-opacity="0.94"/>
		<path d="M61 76l15 31 34 5-25 24 6 34-30-16-30 16 6-34-25-24 34-5z" fill="${secondaryColor}" fill-opacity="0.92"/>
		<path d="M196 67l8 18 19 3-14 13 4 19-17-9-17 9 4-19-14-13 19-3z" fill="${secondaryColor}" fill-opacity="0.86"/>
		<text x="128" y="143" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="900" fill="#111827">${label}</text>
	</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function filterPresetsByQuery({
	query,
}: {
	query: string;
}): AnimatedStickerPreset[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return ANIMATED_STICKER_PRESETS;
	}

	return ANIMATED_STICKER_PRESETS.filter((preset) => {
		const searchable = [
			preset.id,
			preset.name,
			...preset.keywords,
			...preset.aliases,
			...preset.useCases,
		]
			.join(" ")
			.toLowerCase();
		return searchable.includes(normalizedQuery);
	});
}

function paginatePresets({
	presets,
	options,
}: {
	presets: AnimatedStickerPreset[];
	options?: { page?: number; limit?: number };
}): { items: AnimatedStickerPreset[]; hasMore: boolean; total: number } {
	const page = Math.max(1, options?.page ?? 1);
	const limit = Math.max(1, options?.limit ?? ANIMATED_STICKER_PRESETS.length);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	return {
		items: presets.slice(startIndex, endIndex),
		hasMore: endIndex < presets.length,
		total: presets.length,
	};
}

export const animatedStickersProvider: StickerProvider = {
	id: ANIMATED_STICKERS_PROVIDER_ID,
	async search({
		query,
		options,
	}: {
		query: string;
		options?: { limit?: number };
	}): Promise<StickerSearchResult> {
		const paged = paginatePresets({
			presets: filterPresetsByQuery({ query }),
			options: {
				page: 1,
				limit: options?.limit ?? ANIMATED_STICKER_PRESETS.length,
			},
		});
		return {
			items: paged.items.map((preset) => toStickerItem({ preset })),
			total: paged.total,
			hasMore: paged.hasMore,
		};
	},
	async browse({
		options,
	}: {
		options?: { page?: number; limit?: number };
	}): Promise<StickerBrowseResult> {
		const paged = paginatePresets({
			presets: ANIMATED_STICKER_PRESETS,
			options,
		});
		return {
			sections: [
				{
					id: "built-in",
					title: "Built-in motion",
					items: paged.items.map((preset) => toStickerItem({ preset })),
					hasMore: paged.hasMore,
					layout: "grid",
				},
			],
		};
	},
	resolveUrl({ stickerId }: { stickerId: string }): string {
		const preset =
			parseAnimatedStickerId({ stickerId }) ?? ANIMATED_STICKER_PRESETS[0];
		return buildAnimatedStickerPreviewUrl({
			preset,
			params: getPresetParams({ preset }),
		});
	},
};
