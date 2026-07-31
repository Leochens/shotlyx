import {
	DEFAULT_FLOWER_TEXT_DURATION,
	FLOWER_TEXT_PRESETS,
	buildFlowerTextProgressAnimation,
	getFlowerTextParams,
	type FlowerTextPreset,
} from "@/graphics/definitions/flower-text";
import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import { buildGraphicElement } from "@/timeline/element-utils";
import type { CreateGraphicElement } from "@/timeline/types";
import type { MediaTime } from "@/wasm";

export interface FlowerTextMenuItem {
	id: string;
	name: string;
	definitionId: string;
	previewUrl: string;
	params: ParamValues;
	duration: MediaTime;
	animations: ElementAnimations;
	useCases: string[];
}

function escapeSvgText({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function buildFlowerTextPreviewUrl({
	preset,
}: {
	preset: FlowerTextPreset;
}): string {
	const params = getFlowerTextParams({ preset });
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

function presetMatchesQuery({
	preset,
	query,
}: {
	preset: FlowerTextPreset;
	query: string;
}): boolean {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return true;

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
}

function toFlowerTextMenuItem({
	preset,
}: {
	preset: FlowerTextPreset;
}): FlowerTextMenuItem {
	const duration = DEFAULT_FLOWER_TEXT_DURATION;
	return {
		id: preset.id,
		name: preset.name,
		definitionId: preset.definitionId,
		previewUrl: buildFlowerTextPreviewUrl({ preset }),
		params: getFlowerTextParams({ preset }),
		duration,
		animations: buildFlowerTextProgressAnimation({ duration }),
		useCases: preset.useCases,
	};
}

export function getFlowerTextMenuItems({
	query = "",
}: {
	query?: string;
} = {}): FlowerTextMenuItem[] {
	return FLOWER_TEXT_PRESETS.filter((preset) =>
		presetMatchesQuery({ preset, query }),
	).map((preset) => toFlowerTextMenuItem({ preset }));
}

export function buildFlowerTextMenuGraphicElement({
	item,
	startTime,
}: {
	item: FlowerTextMenuItem;
	startTime: MediaTime;
}): CreateGraphicElement {
	return buildGraphicElement({
		definitionId: item.definitionId,
		name: item.name,
		startTime,
		params: item.params,
		duration: item.duration,
		animations: item.animations,
	});
}
