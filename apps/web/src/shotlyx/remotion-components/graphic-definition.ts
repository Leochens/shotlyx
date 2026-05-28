import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicDefinition } from "@/graphics/types";
import { getShotlyxMGAsset } from "./asset-store";
import {
	SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
	SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
} from "./project-assets";

const SHOTLYX_ASSET_ID_PARAM: ParamDefinition<"shotlyxMGAssetId"> = {
	key: "shotlyxMGAssetId",
	label: "Shotlyx MG Asset",
	type: "text",
	default: "",
	keyframable: false,
};

const SHOTLYX_PROGRESS_PARAM: ParamDefinition<"progress"> = {
	key: "progress",
	label: "Animation progress",
	type: "number",
	default: 1,
	min: 0,
	max: 1,
	step: 0.01,
	shortLabel: "%",
};

const SHOTLYX_BACKGROUND_COLOR_PARAM: ParamDefinition<
	typeof SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY
> = {
	key: SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	label: "Background color",
	type: "color",
	default: "#050505",
	keyframable: false,
};

const SHOTLYX_BACKGROUND_OPACITY_PARAM: ParamDefinition<
	typeof SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY
> = {
	key: SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
	label: "Background opacity",
	type: "number",
	default: 0,
	min: 0,
	max: 1,
	step: 0.01,
	shortLabel: "%",
	keyframable: false,
};

function getStringParam({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" && value.trim().length > 0
		? value
		: fallback;
}

function drawFallback({
	ctx,
	width,
	height,
	label,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	label: string;
}): void {
	ctx.save();
	ctx.fillStyle = "#0d1117";
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = "rgba(56,189,248,0.65)";
	ctx.lineWidth = Math.max(3, width * 0.012);
	ctx.strokeRect(width * 0.08, height * 0.22, width * 0.84, height * 0.56);
	ctx.fillStyle = "rgba(248,250,252,0.88)";
	ctx.font = `700 ${Math.max(18, width * 0.055)}px sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(label, width / 2, height / 2, width * 0.78);
	ctx.restore();
}

export const shotlyxMGGraphicDefinition: GraphicDefinition = {
	id: SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
	name: "Shotlyx Remotion MG",
	category: "motion-graphic",
	keywords: [
		"shotlyx",
		"mg",
		"motion graphic",
		"remotion",
		"overlay",
		"component",
		"ai",
	],
	params: [
		SHOTLYX_PROGRESS_PARAM,
		SHOTLYX_BACKGROUND_OPACITY_PARAM,
		SHOTLYX_BACKGROUND_COLOR_PARAM,
		SHOTLYX_ASSET_ID_PARAM,
	],
	render({ ctx, params, width, height }) {
		const assetId = getStringParam({
			params,
			key: "shotlyxMGAssetId",
			fallback: "",
		});
		const asset = assetId ? getShotlyxMGAsset({ id: assetId }) : null;
		if (!asset) {
			drawFallback({
				ctx,
				width,
				height,
				label: "Shotlyx MG",
			});
		}
	},
};
