import type { ElementAnimations } from "@/animation/types";
import {
	DEFAULT_FLOWER_TEXT_DURATION,
	buildFlowerTextProgressAnimation,
	getFlowerTextParams,
} from "@/graphics/definitions/flower-text";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";
import type { StickerItem } from "./types";
import { parseStickerId } from "./sticker-id";
import {
	FLOWER_TEXT_PROVIDER_ID,
	parseFlowerTextStickerId,
} from "./providers/flower-text";

export interface GraphicStickerPreset {
	name: string;
	definitionId: string;
	params?: Partial<ParamValues>;
	duration?: MediaTime;
	animations?: ElementAnimations;
}

const LEGACY_SHAPE_PRESETS: Record<
	string,
	{ name: string; definitionId: string; params?: Partial<ParamValues> }
> = {
	square: { name: "Square", definitionId: "rectangle" },
	circle: { name: "Circle", definitionId: "ellipse" },
	triangle: { name: "Triangle", definitionId: "polygon", params: { sides: 3 } },
	hexagon: { name: "Hexagon", definitionId: "polygon", params: { sides: 6 } },
	diamond: { name: "Diamond", definitionId: "polygon", params: { sides: 4 } },
	star: { name: "Star", definitionId: "star" },
};

function readMetadataString({
	item,
	key,
}: {
	item: StickerItem;
	key: string;
}): string | null {
	const value = item.metadata[key];
	return typeof value === "string" && value ? value : null;
}

function readMetadataParams({
	item,
}: {
	item: StickerItem;
}): Partial<ParamValues> | null {
	const value = item.metadata.params;
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Partial<ParamValues>)
		: null;
}

export function getGraphicStickerPreset({
	item,
}: {
	item: StickerItem;
}): GraphicStickerPreset | null {
	if (item.provider === "shapes") {
		const definitionIdFromMetadata = readMetadataString({
			item,
			key: "definitionId",
		});
		const parsed = (() => {
			try {
				return parseStickerId({ stickerId: item.id });
			} catch {
				return null;
			}
		})();
		const legacyPreset = parsed
			? LEGACY_SHAPE_PRESETS[parsed.providerValue]
			: undefined;
		const definitionId =
			definitionIdFromMetadata ??
			legacyPreset?.definitionId ??
			parsed?.providerValue;
		if (!definitionId) {
			return null;
		}
		return {
			name: legacyPreset?.name ?? item.name,
			definitionId,
			params: readMetadataParams({ item }) ?? legacyPreset?.params ?? {},
		};
	}

	if (item.provider === FLOWER_TEXT_PROVIDER_ID) {
		const preset = parseFlowerTextStickerId({ stickerId: item.id });
		if (!preset) {
			return null;
		}
		const duration = DEFAULT_FLOWER_TEXT_DURATION;
		return {
			name: preset.name,
			definitionId: preset.definitionId,
			params: getFlowerTextParams({ preset }),
			duration,
			animations: buildFlowerTextProgressAnimation({ duration }),
		};
	}

	return null;
}
