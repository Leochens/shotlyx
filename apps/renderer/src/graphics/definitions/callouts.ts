import type { ParamDefinition } from "@/params";
import type { GraphicDefinition } from "../types";

interface CalloutParams {
	fill: string;
	stroke: string;
	strokeWidth: number;
	cornerRadius: number;
	headSize: number;
	tailWidth: number;
}

const FILL_PARAM: ParamDefinition<"fill"> = {
	key: "fill",
	label: "Fill",
	type: "color",
	default: "rgba(250, 204, 21, 0.08)",
};

const STROKE_PARAM: ParamDefinition<"stroke"> = {
	key: "stroke",
	label: "Stroke",
	type: "color",
	default: "#facc15",
	group: "stroke",
};

const STROKE_WIDTH_PARAM: ParamDefinition<"strokeWidth"> = {
	key: "strokeWidth",
	label: "Width",
	type: "number",
	default: 18,
	min: 0,
	max: 80,
	step: 1,
	shortLabel: "W",
	group: "stroke",
};

const CORNER_RADIUS_PARAM: ParamDefinition<"cornerRadius"> = {
	key: "cornerRadius",
	label: "Corner radius",
	type: "number",
	default: 18,
	min: 0,
	max: 50,
	step: 1,
	shortLabel: "R",
};

const HEAD_SIZE_PARAM: ParamDefinition<"headSize"> = {
	key: "headSize",
	label: "Head size",
	type: "number",
	default: 30,
	min: 12,
	max: 50,
	step: 1,
	shortLabel: "H",
};

const TAIL_WIDTH_PARAM: ParamDefinition<"tailWidth"> = {
	key: "tailWidth",
	label: "Tail width",
	type: "number",
	default: 18,
	min: 4,
	max: 42,
	step: 1,
	shortLabel: "T",
};

function readString({
	params,
	key,
	fallback,
}: {
	params: Record<string, unknown>;
	key: keyof CalloutParams;
	fallback: string;
}): string {
	const value = params[key];
	return typeof value === "string" && value.trim().length > 0
		? value
		: fallback;
}

function readNumber({
	params,
	key,
	fallback,
}: {
	params: Record<string, unknown>;
	key: keyof CalloutParams;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.max(min, Math.min(max, value));
}

function strokePath({
	ctx,
	path,
	stroke,
	strokeWidth,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	path: Path2D;
	stroke: string;
	strokeWidth: number;
}): void {
	if (strokeWidth <= 0) return;
	ctx.strokeStyle = stroke;
	ctx.lineWidth = strokeWidth;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.stroke(path);
}

const outlineParams = [
	FILL_PARAM,
	STROKE_PARAM,
	STROKE_WIDTH_PARAM,
	CORNER_RADIUS_PARAM,
] satisfies ParamDefinition[];

export const calloutArrowGraphicDefinition: GraphicDefinition = {
	id: "callout-arrow",
	name: "Arrow",
	category: "shape",
	keywords: ["arrow", "callout", "pointer", "indicator", "annotation"],
	params: [
		{
			...FILL_PARAM,
			default: "#facc15",
		},
		STROKE_PARAM,
		STROKE_WIDTH_PARAM,
		HEAD_SIZE_PARAM,
		TAIL_WIDTH_PARAM,
	],
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);

		const fill = readString({ params, key: "fill", fallback: "#facc15" });
		const stroke = readString({ params, key: "stroke", fallback: "#facc15" });
		const strokeWidth = Math.max(
			0,
			readNumber({ params, key: "strokeWidth", fallback: 18 }),
		);
		const headSize = clamp({
			value: readNumber({ params, key: "headSize", fallback: 30 }),
			min: 12,
			max: 50,
		});
		const tailWidth = clamp({
			value: readNumber({ params, key: "tailWidth", fallback: 18 }),
			min: 4,
			max: 42,
		});
		const inset = Math.max(2, strokeWidth / 2 + Math.min(width, height) * 0.04);
		const left = inset;
		const right = width - inset;
		const centerY = height / 2;
		const headLength = (width - inset * 2) * (headSize / 100);
		const tailHalf = height * (tailWidth / 100);
		const headHalf = Math.min(height / 2 - inset, tailHalf * 2.1);
		const headBaseX = Math.max(left, right - headLength);

		const path = new Path2D();
		path.moveTo(left, centerY - tailHalf);
		path.lineTo(headBaseX, centerY - tailHalf);
		path.lineTo(headBaseX, centerY - headHalf);
		path.lineTo(right, centerY);
		path.lineTo(headBaseX, centerY + headHalf);
		path.lineTo(headBaseX, centerY + tailHalf);
		path.lineTo(left, centerY + tailHalf);
		path.closePath();

		ctx.fillStyle = fill;
		ctx.fill(path);
		strokePath({ ctx, path, stroke, strokeWidth });
	},
};

export const calloutBoxGraphicDefinition: GraphicDefinition = {
	id: "callout-box",
	name: "Callout Box",
	category: "shape",
	keywords: ["box", "rectangle", "callout", "outline", "highlight"],
	params: outlineParams,
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);

		const fill = readString({
			params,
			key: "fill",
			fallback: "rgba(250, 204, 21, 0.08)",
		});
		const stroke = readString({ params, key: "stroke", fallback: "#facc15" });
		const strokeWidth = Math.max(
			0,
			readNumber({ params, key: "strokeWidth", fallback: 18 }),
		);
		const radiusPercent = clamp({
			value: readNumber({ params, key: "cornerRadius", fallback: 18 }),
			min: 0,
			max: 50,
		});
		const inset = Math.max(1, strokeWidth / 2);
		const drawWidth = Math.max(1, width - inset * 2);
		const drawHeight = Math.max(1, height - inset * 2);
		const radius = (Math.min(drawWidth, drawHeight) / 2) * (radiusPercent / 50);

		const path = new Path2D();
		path.roundRect(inset, inset, drawWidth, drawHeight, radius);
		ctx.fillStyle = fill;
		ctx.fill(path);
		strokePath({ ctx, path, stroke, strokeWidth });
	},
};

export const calloutCircleGraphicDefinition: GraphicDefinition = {
	id: "callout-circle",
	name: "Callout Circle",
	category: "shape",
	keywords: ["circle", "ellipse", "ring", "callout", "highlight"],
	params: outlineParams,
	render({ ctx, params, width, height }) {
		ctx.clearRect(0, 0, width, height);

		const fill = readString({
			params,
			key: "fill",
			fallback: "rgba(250, 204, 21, 0.08)",
		});
		const stroke = readString({ params, key: "stroke", fallback: "#facc15" });
		const strokeWidth = Math.max(
			0,
			readNumber({ params, key: "strokeWidth", fallback: 18 }),
		);
		const inset = Math.max(1, strokeWidth / 2);

		ctx.beginPath();
		ctx.ellipse(
			width / 2,
			height / 2,
			Math.max(1, width / 2 - inset),
			Math.max(1, height / 2 - inset),
			0,
			0,
			Math.PI * 2,
		);
		ctx.fillStyle = fill;
		ctx.fill();
		if (strokeWidth > 0) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = strokeWidth;
			ctx.stroke();
		}
	},
};

export const calloutGraphicDefinitions = [
	calloutArrowGraphicDefinition,
	calloutBoxGraphicDefinition,
	calloutCircleGraphicDefinition,
];
