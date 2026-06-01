import type { MaskableElement, VisualElement } from "./types";
import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";

interface BaseDragData {
	id: string;
	name: string;
}

export interface MediaDragData extends BaseDragData {
	type: "media";
	mediaType: "image" | "video" | "audio";
	targetElementTypes?: MaskableElement["type"][];
	insertMode?: "media" | "silent-overlay";
}

export interface TextDragData extends BaseDragData {
	type: "text";
	content: string;
}

export interface StickerDragData extends BaseDragData {
	type: "sticker";
	stickerId: string;
}

export interface GraphicDragData extends BaseDragData {
	type: "graphic";
	definitionId: string;
	params: Partial<ParamValues>;
	duration?: MediaTime;
	animations?: ElementAnimations;
	motionGraphicAssetId?: string;
	motionGraphicBaseParams?: ParamValues;
}

export interface EffectDragData extends BaseDragData {
	type: "effect";
	effectType: string;
	targetElementTypes: VisualElement["type"][];
}

export type TimelineDragData =
	| MediaDragData
	| TextDragData
	| StickerDragData
	| GraphicDragData
	| EffectDragData;
