import {
	buildDefaultGraphicInstance,
	buildGraphicPreviewUrl,
	graphicsRegistry,
	registerDefaultGraphics,
} from "@/graphics";
import type { ParamValues } from "@/params";
import { buildStickerId, parseStickerId } from "../sticker-id";
import type {
	StickerBrowseResult,
	StickerItem,
	StickerProvider,
	StickerSearchResult,
} from "../types";

export const MOTION_GRAPHICS_PROVIDER_ID = "mg";

export type MotionGraphicPreset = {
	key: string;
	name: string;
	definitionId: string;
	params?: ParamValues;
};

function getMotionGraphicPresets(): MotionGraphicPreset[] {
	registerDefaultGraphics();
	return graphicsRegistry
		.getAll()
		.filter((definition) => definition.category === "motion-graphic")
		.map((definition) => ({
			key: definition.id,
			name: definition.name,
			definitionId: definition.id,
		}));
}

function getMotionGraphicPreset({
	key,
}: {
	key: string;
}): MotionGraphicPreset | null {
	return getMotionGraphicPresets().find((preset) => preset.key === key) ?? null;
}

function getMotionGraphicParams({
	preset,
}: {
	preset: MotionGraphicPreset;
}): ParamValues {
	return {
		...buildDefaultGraphicInstance({ definitionId: preset.definitionId })
			.params,
		...(preset.params ?? {}),
	};
}

export function parseMotionGraphicStickerId({
	stickerId,
}: {
	stickerId: string;
}): MotionGraphicPreset | null {
	try {
		const { providerId, providerValue } = parseStickerId({ stickerId });
		if (providerId !== MOTION_GRAPHICS_PROVIDER_ID) {
			return null;
		}
		return getMotionGraphicPreset({ key: providerValue });
	} catch {
		return null;
	}
}

function buildMotionGraphicUrl({ key }: { key: string }): string {
	const preset = getMotionGraphicPreset({ key });
	if (!preset) {
		return buildGraphicPreviewUrl({ definitionId: "mg-title-card" });
	}
	return buildGraphicPreviewUrl({
		definitionId: preset.definitionId,
		params: getMotionGraphicParams({ preset }),
	});
}

function toStickerItem({
	preset,
}: {
	preset: MotionGraphicPreset;
}): StickerItem {
	return {
		id: buildStickerId({
			providerId: MOTION_GRAPHICS_PROVIDER_ID,
			providerValue: preset.key,
		}),
		provider: MOTION_GRAPHICS_PROVIDER_ID,
		name: preset.name,
		previewUrl: buildMotionGraphicUrl({ key: preset.key }),
		metadata: {
			definitionId: preset.definitionId,
			params: preset.params ?? {},
		},
	};
}

function filterMotionGraphicsByQuery({
	query,
}: {
	query: string;
}): MotionGraphicPreset[] {
	const normalizedQuery = query.trim().toLowerCase();
	const presets = getMotionGraphicPresets();
	if (!normalizedQuery) {
		return presets;
	}

	return presets.filter((preset) => {
		const definition = graphicsRegistry.get(preset.definitionId);
		return (
			preset.name.toLowerCase().includes(normalizedQuery) ||
			definition.keywords.some((keyword) =>
				keyword.toLowerCase().includes(normalizedQuery),
			)
		);
	});
}

function paginateMotionGraphics({
	presets,
	options,
}: {
	presets: MotionGraphicPreset[];
	options?: { page?: number; limit?: number };
}): { items: MotionGraphicPreset[]; hasMore: boolean; total: number } {
	const page = Math.max(1, options?.page ?? 1);
	const limit = Math.max(1, options?.limit ?? getMotionGraphicPresets().length);
	const startIndex = (page - 1) * limit;
	const endIndex = startIndex + limit;
	const pagedItems = presets.slice(startIndex, endIndex);
	return {
		items: pagedItems,
		hasMore: endIndex < presets.length,
		total: presets.length,
	};
}

export const motionGraphicsProvider: StickerProvider = {
	id: MOTION_GRAPHICS_PROVIDER_ID,
	async search({
		query,
		options,
	}: {
		query: string;
		options?: { limit?: number };
	}): Promise<StickerSearchResult> {
		const filtered = filterMotionGraphicsByQuery({ query });
		const paged = paginateMotionGraphics({
			presets: filtered,
			options: {
				page: 1,
				limit: options?.limit ?? getMotionGraphicPresets().length,
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
		const paged = paginateMotionGraphics({
			presets: getMotionGraphicPresets(),
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
	resolveUrl({
		stickerId,
	}: {
		stickerId: string;
		options?: { width?: number; height?: number };
	}): string {
		const preset = parseMotionGraphicStickerId({ stickerId });
		return buildMotionGraphicUrl({ key: preset?.key ?? "mg-title-card" });
	},
};
