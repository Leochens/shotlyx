import {
	FLOWER_TEXT_PRESETS,
	DEFAULT_FLOWER_TEXT_DURATION,
	buildFlowerTextProgressAnimation,
	getFlowerTextParams,
	getFlowerTextPreset,
	type FlowerTextPreset,
} from "@/graphics/definitions/flower-text";
import type { ParamValues } from "@/params";
import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

export const FLOWER_TEXT_PROVIDER_ID = "flower-text";

function getPresetParams({
	preset,
}: {
	preset: FlowerTextPreset;
}): ParamValues {
	return getFlowerTextParams({ preset });
}

function escapeSvgText({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function parseFlowerTextStickerId({
	stickerId,
}: {
	stickerId: string;
}): FlowerTextPreset | null {
	try {
		const { providerId, providerValue } = parseStickerId({ stickerId });
		if (providerId !== FLOWER_TEXT_PROVIDER_ID) {
			return null;
		}
		return getFlowerTextPreset({ presetId: providerValue });
	} catch {
		return null;
	}
}

function buildFlowerTextUrl({ preset }: { preset: FlowerTextPreset }): string {
	const params = getPresetParams({ preset });
	const text = escapeSvgText({
		value: String(params.content ?? preset.defaultText),
	});
	const backgroundColor = String(params.backgroundColor ?? "#111827");
	const textColor = String(params.textColor ?? "#ffffff");
	const strokeColor = String(params.strokeColor ?? "#111827");
	const accentColor = String(params.accentColor ?? "#ffcf33");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
		<rect x="12" y="12" width="232" height="232" rx="26" fill="${backgroundColor}" fill-opacity="0.96"/>
		<circle cx="57" cy="58" r="19" fill="${accentColor}" fill-opacity="0.95"/>
		<circle cx="205" cy="195" r="15" fill="${accentColor}" fill-opacity="0.75"/>
		<text x="128" y="134" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="40" font-weight="900" paint-order="stroke" stroke="${strokeColor}" stroke-width="8" stroke-linejoin="round" fill="${textColor}">${text}</text>
	</svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toStickerItem({ preset }: { preset: FlowerTextPreset }): StickerItem {
	const params = getPresetParams({ preset });
	return {
		id: buildStickerId({
			providerId: FLOWER_TEXT_PROVIDER_ID,
			providerValue: preset.id,
		}),
		provider: FLOWER_TEXT_PROVIDER_ID,
		name: preset.name,
		previewUrl: buildFlowerTextUrl({ preset }),
		metadata: {
			definitionId: preset.definitionId,
			params,
			animations: buildFlowerTextProgressAnimation({
				duration: DEFAULT_FLOWER_TEXT_DURATION,
			}),
			useCases: preset.useCases,
		},
	};
}

function filterPresetsByQuery({
	query,
}: {
	query: string;
}): FlowerTextPreset[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return FLOWER_TEXT_PRESETS;
	}

	return FLOWER_TEXT_PRESETS.filter((preset) => {
		const searchable = [
			preset.id,
			preset.name,
			preset.defaultText,
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
	presets: FlowerTextPreset[];
	options?: { page?: number; limit?: number };
}): { items: FlowerTextPreset[]; hasMore: boolean; total: number } {
	const page = Math.max(1, options?.page ?? 1);
	const limit = Math.max(1, options?.limit ?? FLOWER_TEXT_PRESETS.length);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	return {
		items: presets.slice(startIndex, endIndex),
		hasMore: endIndex < presets.length,
		total: presets.length,
	};
}

export const flowerTextProvider: StickerProvider = {
	id: FLOWER_TEXT_PROVIDER_ID,
	async search({
		query,
		options,
	}: {
		query: string;
		options?: { limit?: number };
	}): Promise<StickerSearchResult> {
		const paged = paginatePresets({
			presets: filterPresetsByQuery({ query }),
			options: { page: 1, limit: options?.limit ?? FLOWER_TEXT_PRESETS.length },
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
			presets: FLOWER_TEXT_PRESETS,
			options,
		});
		return {
			sections: [
				{
					id: "all",
					items: paged.items.map((preset) => toStickerItem({ preset })),
					hasMore: paged.hasMore,
					layout: "grid",
				},
			],
		};
	},
	resolveUrl({ stickerId }: { stickerId: string }): string {
		const preset =
			parseFlowerTextStickerId({ stickerId }) ?? FLOWER_TEXT_PRESETS[0];
		return buildFlowerTextUrl({ preset });
	},
};
