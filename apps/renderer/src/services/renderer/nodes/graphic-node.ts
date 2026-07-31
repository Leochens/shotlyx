import { createCanvasSurface } from "../canvas-utils";
import type { CanvasRenderer } from "../canvas-renderer";
import {
	DEFAULT_GRAPHIC_SOURCE_SIZE,
	getGraphicDefinition,
	registerDefaultGraphics,
} from "@/graphics";
import type { ParamValues } from "@/params";
import {
	VisualNode,
	type ResolvedVisualNodeState,
	type VisualNodeParams,
} from "./visual-node";
import { SHOTLYX_MG_GRAPHIC_DEFINITION_ID } from "@/shotlyx/remotion-components/project-assets";

export interface GraphicNodeParams extends VisualNodeParams {
	definitionId: string;
	params: ParamValues;
	motionGraphicBaseParams?: ParamValues;
}

export interface ResolvedGraphicNodeState extends ResolvedVisualNodeState {
	resolvedParams: ParamValues;
	sourceWidth: number;
	sourceHeight: number;
}

const MAX_SHOTLYX_MG_SOURCE_SIZE = 4096;

export function getShotlyxMGExportSourceSize({
	width,
	height,
}: {
	width: number;
	height: number;
}): number {
	return Math.max(
		DEFAULT_GRAPHIC_SOURCE_SIZE,
		Math.min(MAX_SHOTLYX_MG_SOURCE_SIZE, Math.ceil(Math.max(width, height))),
	);
}

export function getShotlyxMGExportSourceRect({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const maxSide = Math.min(MAX_SHOTLYX_MG_SOURCE_SIZE, Math.max(width, height));
	if (maxSide <= 0 || width <= 0 || height <= 0) {
		return {
			width: DEFAULT_GRAPHIC_SOURCE_SIZE,
			height: DEFAULT_GRAPHIC_SOURCE_SIZE,
		};
	}
	const scale = maxSide / Math.max(width, height);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export function getGraphicNodeSourceSize({
	definitionId,
	renderer,
}: {
	definitionId: string;
	renderer: CanvasRenderer;
}): { width: number; height: number } {
	if (
		definitionId !== SHOTLYX_MG_GRAPHIC_DEFINITION_ID ||
		!renderer.renderShotlyxMG
	) {
		return {
			width: DEFAULT_GRAPHIC_SOURCE_SIZE,
			height: DEFAULT_GRAPHIC_SOURCE_SIZE,
		};
	}

	const size = getShotlyxMGExportSourceSize({
		width: renderer.width,
		height: renderer.height,
	});
	return { width: size, height: size };
}

export class GraphicNode extends VisualNode<
	GraphicNodeParams,
	ResolvedGraphicNodeState
> {
	private cachedKey: string | null = null;
	private cachedSource: OffscreenCanvas | null = null;

	constructor(params: GraphicNodeParams) {
		super(params);
		registerDefaultGraphics();
	}

	async getSource({
		resolvedParams,
		renderShotlyxMG,
		sourceWidth,
		sourceHeight,
	}: {
		resolvedParams: ParamValues;
		renderShotlyxMG: boolean;
		sourceWidth: number;
		sourceHeight: number;
	}): Promise<OffscreenCanvas | null> {
		if (
			this.params.definitionId === SHOTLYX_MG_GRAPHIC_DEFINITION_ID &&
			!renderShotlyxMG
		) {
			return null;
		}

		const definition = getGraphicDefinition({
			definitionId: this.params.definitionId,
		});
		const cacheKey = JSON.stringify({
			definitionId: this.params.definitionId,
			params: resolvedParams,
			sourceWidth,
			sourceHeight,
		});
		if (this.cachedSource && this.cachedKey === cacheKey) {
			return this.cachedSource;
		}

		const { canvas, context } = createCanvasSurface({
			width: sourceWidth,
			height: sourceHeight,
		});

		await definition.render({
			ctx: context,
			params: resolvedParams,
			width: sourceWidth,
			height: sourceHeight,
		});

		this.cachedKey = cacheKey;
		this.cachedSource = canvas;
		return canvas;
	}
}
