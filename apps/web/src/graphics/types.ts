import type { ParamDefinition, ParamValues } from "@/params";

export const DEFAULT_GRAPHIC_SOURCE_SIZE = 512;

export type GraphicCategory = "shape" | "motion-graphic" | "flower-text";

export interface GraphicRenderContext {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	params: ParamValues;
	width: number;
	height: number;
}

export interface GraphicDefinition {
	id: string;
	name: string;
	category?: GraphicCategory;
	keywords: string[];
	params: ParamDefinition[];
	render(context: GraphicRenderContext): void | Promise<void>;
}

export interface GraphicInstance {
	definitionId: string;
	params: ParamValues;
}
