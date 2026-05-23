import type { ParamDefinition, ParamValues } from "@/params";
import type { GraphicDefinition } from "../types";

const MOTION_PROGRESS_PARAM: ParamDefinition<"progress"> = {
	key: "progress",
	label: "Animation progress",
	type: "number",
	default: 1,
	min: 0,
	max: 1,
	step: 0.01,
	shortLabel: "%",
};

const FONT_FAMILY_PARAM: ParamDefinition<"fontFamily"> = {
	key: "fontFamily",
	label: "Font",
	type: "font",
	default: "Arial",
	keyframable: false,
};

function stringParam({
	key,
	label,
	defaultValue,
}: {
	key: string;
	label: string;
	defaultValue: string;
}): ParamDefinition {
	return {
		key,
		label,
		type: "text",
		default: defaultValue,
		keyframable: false,
	};
}

function colorParam({
	key,
	label,
	defaultValue,
}: {
	key: string;
	label: string;
	defaultValue: string;
}): ParamDefinition {
	return {
		key,
		label,
		type: "color",
		default: defaultValue,
	};
}

function numberParam({
	key,
	label,
	defaultValue,
	min,
	max,
	step,
	unit,
}: {
	key: string;
	label: string;
	defaultValue: number;
	min: number;
	max?: number;
	step: number;
	unit?: "percent";
}): ParamDefinition {
	return {
		key,
		label,
		type: "number",
		default: defaultValue,
		min,
		max,
		step,
		unit,
	};
}

function getNumber({
	params,
	key,
	fallback,
}: {
	params: ParamValues;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getString({
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

function easeOutCubic({ value }: { value: number }): number {
	const t = clamp({ value, min: 0, max: 1 });
	return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic({ value }: { value: number }): number {
	const t = clamp({ value, min: 0, max: 1 });
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedRect({
	ctx,
	x,
	y,
	width,
	height,
	radius,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
}): void {
	if (width <= 0 || height <= 0) return;

	const safeRadius = clamp({
		value: radius,
		min: 0,
		max: Math.min(width, height) / 2,
	});
	const path = new Path2D();
	path.roundRect(x, y, width, height, safeRadius);
	ctx.fill(path);
}

function drawText({
	ctx,
	text,
	x,
	y,
	maxWidth,
	size,
	weight = "700",
	color,
	fontFamily,
	align = "left",
	baseline = "middle",
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	text: string;
	x: number;
	y: number;
	maxWidth: number;
	size: number;
	weight?: string;
	color: string;
	fontFamily: string;
	align?: CanvasTextAlign;
	baseline?: CanvasTextBaseline;
}): void {
	ctx.save();
	ctx.textAlign = align;
	ctx.textBaseline = baseline;
	ctx.fillStyle = color;
	ctx.font = `${weight} ${size}px ${fontFamily}, Arial, sans-serif`;
	ctx.fillText(text, x, y, maxWidth);
	ctx.restore();
}

function drawHpBar({
	ctx,
	x,
	y,
	width,
	height,
	value,
	fill,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	x: number;
	y: number;
	width: number;
	height: number;
	value: number;
	fill: string;
}): void {
	ctx.save();
	ctx.fillStyle = "#303033";
	roundedRect({ ctx, x, y, width, height, radius: height / 2 });
	ctx.fillStyle = fill;
	roundedRect({
		ctx,
		x: x + 2,
		y: y + 2,
		width: Math.max(
			0,
			((width - 4) * clamp({ value, min: 0, max: 100 })) / 100,
		),
		height: height - 4,
		radius: (height - 4) / 2,
	});
	ctx.restore();
}

export const mgTitleCardGraphicDefinition: GraphicDefinition = {
	id: "mg-title-card",
	name: "MG Title Card",
	category: "motion-graphic",
	keywords: ["motion", "mg", "title", "title card", "opening", "chapter"],
	params: [
		MOTION_PROGRESS_PARAM,
		stringParam({
			key: "title",
			label: "Title",
			defaultValue: "New Chapter",
		}),
		stringParam({
			key: "subtitle",
			label: "Subtitle",
			defaultValue: "Motion graphic title",
		}),
		FONT_FAMILY_PARAM,
		colorParam({
			key: "accentColor",
			label: "Accent",
			defaultValue: "#f5b83d",
		}),
		colorParam({
			key: "textColor",
			label: "Text",
			defaultValue: "#ffffff",
		}),
		colorParam({
			key: "panelColor",
			label: "Panel",
			defaultValue: "#14161a",
		}),
		colorParam({
			key: "backgroundColor",
			label: "Background",
			defaultValue: "#0d1117",
		}),
		numberParam({
			key: "backgroundOpacity",
			label: "Background opacity",
			defaultValue: 0.88,
			min: 0,
			max: 1,
			step: 0.01,
		}),
	],
	render({ ctx, params, width, height }) {
		const progress = easeOutCubic({
			value: getNumber({ params, key: "progress", fallback: 1 }),
		});
		const title = getString({
			params,
			key: "title",
			fallback: "New Chapter",
		});
		const subtitle = getString({
			params,
			key: "subtitle",
			fallback: "Motion graphic title",
		});
		const fontFamily = getString({
			params,
			key: "fontFamily",
			fallback: "Arial",
		});
		const accentColor = getString({
			params,
			key: "accentColor",
			fallback: "#f5b83d",
		});
		const textColor = getString({
			params,
			key: "textColor",
			fallback: "#ffffff",
		});
		const panelColor = getString({
			params,
			key: "panelColor",
			fallback: "#14161a",
		});
		const backgroundColor = getString({
			params,
			key: "backgroundColor",
			fallback: "#0d1117",
		});
		const backgroundOpacity = clamp({
			value: getNumber({ params, key: "backgroundOpacity", fallback: 0.88 }),
			min: 0,
			max: 1,
		});

		ctx.clearRect(0, 0, width, height);
		ctx.save();
		ctx.globalAlpha = backgroundOpacity * progress;
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();

		const panelW = width * 0.78;
		const panelH = height * 0.34;
		const panelX = (width - panelW) / 2;
		const panelY = height * 0.34 + (1 - progress) * height * 0.16;
		ctx.save();
		ctx.globalAlpha = progress;
		ctx.fillStyle = panelColor;
		roundedRect({
			ctx,
			x: panelX,
			y: panelY,
			width: panelW,
			height: panelH,
			radius: width * 0.035,
		});
		ctx.fillStyle = accentColor;
		roundedRect({
			ctx,
			x: panelX + panelW * 0.06,
			y: panelY + panelH * 0.19,
			width: panelW * 0.18 * progress,
			height: Math.max(4, height * 0.012),
			radius: height * 0.006,
		});
		drawText({
			ctx,
			text: title,
			x: panelX + panelW * 0.06,
			y: panelY + panelH * 0.52,
			maxWidth: panelW * 0.88,
			size: Math.max(26, width * 0.07),
			color: textColor,
			fontFamily,
		});
		drawText({
			ctx,
			text: subtitle,
			x: panelX + panelW * 0.06,
			y: panelY + panelH * 0.76,
			maxWidth: panelW * 0.82,
			size: Math.max(14, width * 0.028),
			weight: "500",
			color: "rgba(255,255,255,0.72)",
			fontFamily,
		});
		ctx.restore();
	},
};

export const mgLowerThirdGraphicDefinition: GraphicDefinition = {
	id: "mg-lower-third",
	name: "MG Lower Third",
	category: "motion-graphic",
	keywords: ["motion", "mg", "lower third", "name", "speaker", "caption"],
	params: [
		MOTION_PROGRESS_PARAM,
		stringParam({ key: "name", label: "Name", defaultValue: "Speaker Name" }),
		stringParam({
			key: "role",
			label: "Role",
			defaultValue: "Title or context",
		}),
		FONT_FAMILY_PARAM,
		colorParam({
			key: "accentColor",
			label: "Accent",
			defaultValue: "#f5b83d",
		}),
		colorParam({
			key: "panelColor",
			label: "Panel",
			defaultValue: "#15171c",
		}),
		colorParam({ key: "textColor", label: "Text", defaultValue: "#ffffff" }),
	],
	render({ ctx, params, width, height }) {
		const progress = easeOutCubic({
			value: getNumber({ params, key: "progress", fallback: 1 }),
		});
		const name = getString({
			params,
			key: "name",
			fallback: "Speaker Name",
		});
		const role = getString({
			params,
			key: "role",
			fallback: "Title or context",
		});
		const fontFamily = getString({
			params,
			key: "fontFamily",
			fallback: "Arial",
		});
		const accentColor = getString({
			params,
			key: "accentColor",
			fallback: "#f5b83d",
		});
		const panelColor = getString({
			params,
			key: "panelColor",
			fallback: "#15171c",
		});
		const textColor = getString({
			params,
			key: "textColor",
			fallback: "#ffffff",
		});

		ctx.clearRect(0, 0, width, height);
		const panelW = width * 0.7;
		const panelH = height * 0.2;
		const x = width * 0.08 - (1 - progress) * width * 0.22;
		const y = height * 0.66;

		ctx.save();
		ctx.globalAlpha = progress;
		ctx.fillStyle = panelColor;
		roundedRect({
			ctx,
			x,
			y,
			width: panelW,
			height: panelH,
			radius: height * 0.035,
		});
		ctx.fillStyle = accentColor;
		roundedRect({
			ctx,
			x,
			y,
			width: panelW * 0.018,
			height: panelH,
			radius: height * 0.035,
		});
		drawText({
			ctx,
			text: name,
			x: x + panelW * 0.08,
			y: y + panelH * 0.42,
			maxWidth: panelW * 0.82,
			size: Math.max(22, width * 0.052),
			color: textColor,
			fontFamily,
		});
		drawText({
			ctx,
			text: role,
			x: x + panelW * 0.08,
			y: y + panelH * 0.72,
			maxWidth: panelW * 0.82,
			size: Math.max(13, width * 0.026),
			weight: "500",
			color: "rgba(255,255,255,0.66)",
			fontFamily,
		});
		ctx.restore();
	},
};

export const mgBattleCardGraphicDefinition: GraphicDefinition = {
	id: "mg-battle-card",
	name: "MG Battle Card",
	category: "motion-graphic",
	keywords: [
		"motion",
		"mg",
		"battle",
		"comparison",
		"versus",
		"vs",
		"infographic",
	],
	params: [
		MOTION_PROGRESS_PARAM,
		stringParam({
			key: "title",
			label: "Title",
			defaultValue: "NVIDIA vs AMD - competitive history",
		}),
		stringParam({ key: "leftName", label: "Left name", defaultValue: "AMD" }),
		stringParam({
			key: "rightName",
			label: "Right name",
			defaultValue: "NVIDIA",
		}),
		numberParam({
			key: "leftHp",
			label: "Left HP",
			defaultValue: 60,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		}),
		numberParam({
			key: "rightHp",
			label: "Right HP",
			defaultValue: 85,
			min: 0,
			max: 100,
			step: 1,
			unit: "percent",
		}),
		FONT_FAMILY_PARAM,
		colorParam({
			key: "leftColor",
			label: "Left color",
			defaultValue: "#a6423a",
		}),
		colorParam({
			key: "rightColor",
			label: "Right color",
			defaultValue: "#5f7f24",
		}),
		colorParam({
			key: "accentColor",
			label: "Accent",
			defaultValue: "#f5b83d",
		}),
		colorParam({
			key: "backgroundColor",
			label: "Background",
			defaultValue: "#e9f2fb",
		}),
		colorParam({
			key: "textColor",
			label: "Text",
			defaultValue: "#323438",
		}),
	],
	render({ ctx, params, width, height }) {
		const progress = easeInOutCubic({
			value: getNumber({ params, key: "progress", fallback: 1 }),
		});
		const title = getString({
			params,
			key: "title",
			fallback: "NVIDIA vs AMD - competitive history",
		});
		const leftName = getString({
			params,
			key: "leftName",
			fallback: "AMD",
		});
		const rightName = getString({
			params,
			key: "rightName",
			fallback: "NVIDIA",
		});
		const leftHp = getNumber({ params, key: "leftHp", fallback: 60 });
		const rightHp = getNumber({ params, key: "rightHp", fallback: 85 });
		const fontFamily = getString({
			params,
			key: "fontFamily",
			fallback: "Arial",
		});
		const leftColor = getString({
			params,
			key: "leftColor",
			fallback: "#a6423a",
		});
		const rightColor = getString({
			params,
			key: "rightColor",
			fallback: "#5f7f24",
		});
		const accentColor = getString({
			params,
			key: "accentColor",
			fallback: "#f5b83d",
		});
		const backgroundColor = getString({
			params,
			key: "backgroundColor",
			fallback: "#e9f2fb",
		});
		const textColor = getString({
			params,
			key: "textColor",
			fallback: "#323438",
		});

		ctx.clearRect(0, 0, width, height);
		ctx.save();
		ctx.globalAlpha = 0.96;
		ctx.fillStyle = backgroundColor;
		ctx.fillRect(0, 0, width, height);
		ctx.restore();

		const cardOpacity = clamp({ value: progress * 1.4, min: 0, max: 1 });
		const slide = (1 - progress) * width * 0.12;
		const chipSize = width * 0.15;

		ctx.save();
		ctx.globalAlpha = cardOpacity;
		ctx.fillStyle = "rgba(0,0,0,0.12)";
		ctx.beginPath();
		ctx.ellipse(
			width * 0.32,
			height * 0.48,
			width * 0.25,
			height * 0.11,
			0,
			0,
			Math.PI * 2,
		);
		ctx.fill();
		ctx.beginPath();
		ctx.ellipse(
			width * 0.72,
			height * 0.34,
			width * 0.2,
			height * 0.09,
			0,
			0,
			Math.PI * 2,
		);
		ctx.fill();

		const leftX = width * 0.22 - slide;
		const rightX = width * 0.64 + slide;
		const chipY = height * 0.28;

		ctx.fillStyle = leftColor;
		roundedRect({
			ctx,
			x: leftX,
			y: chipY + height * 0.18,
			width: chipSize,
			height: chipSize,
			radius: width * 0.018,
		});
		ctx.fillStyle = rightColor;
		roundedRect({
			ctx,
			x: rightX,
			y: chipY,
			width: chipSize,
			height: chipSize,
			radius: width * 0.018,
		});
		ctx.fillStyle = "#111";
		roundedRect({
			ctx,
			x: leftX + chipSize * 0.18,
			y: chipY + height * 0.18 + chipSize * 0.18,
			width: chipSize * 0.64,
			height: chipSize * 0.64,
			radius: width * 0.012,
		});
		roundedRect({
			ctx,
			x: rightX + chipSize * 0.18,
			y: chipY + chipSize * 0.18,
			width: chipSize * 0.64,
			height: chipSize * 0.64,
			radius: width * 0.012,
		});
		drawText({
			ctx,
			text: leftName.slice(0, 3).toUpperCase(),
			x: leftX + chipSize / 2,
			y: chipY + height * 0.18 + chipSize * 0.52,
			maxWidth: chipSize * 0.55,
			size: Math.max(18, width * 0.04),
			color: leftColor,
			fontFamily,
			align: "center",
		});
		drawText({
			ctx,
			text: rightName.slice(0, 3).toUpperCase(),
			x: rightX + chipSize / 2,
			y: chipY + chipSize * 0.52,
			maxWidth: chipSize * 0.55,
			size: Math.max(18, width * 0.04),
			color: "#ffffff",
			fontFamily,
			align: "center",
		});

		const barW = width * 0.29;
		const barH = height * 0.1;
		const leftBarX = width * 0.08 - slide;
		const rightBarX = width * 0.68 + slide;
		const topBarY = height * 0.14;
		const bottomBarY = height * 0.56;
		ctx.fillStyle = "#fffde3";
		roundedRect({
			ctx,
			x: leftBarX,
			y: topBarY,
			width: barW,
			height: barH,
			radius: width * 0.016,
		});
		roundedRect({
			ctx,
			x: rightBarX,
			y: bottomBarY,
			width: barW,
			height: barH,
			radius: width * 0.016,
		});
		drawText({
			ctx,
			text: leftName,
			x: leftBarX + barW * 0.06,
			y: topBarY + barH * 0.35,
			maxWidth: barW * 0.55,
			size: Math.max(15, width * 0.026),
			color: textColor,
			fontFamily,
		});
		drawText({
			ctx,
			text: rightName,
			x: rightBarX + barW * 0.06,
			y: bottomBarY + barH * 0.35,
			maxWidth: barW * 0.55,
			size: Math.max(15, width * 0.026),
			color: textColor,
			fontFamily,
		});
		drawHpBar({
			ctx,
			x: leftBarX + barW * 0.06,
			y: topBarY + barH * 0.58,
			width: barW * 0.88,
			height: barH * 0.22,
			value: leftHp * progress,
			fill: "#46c84b",
		});
		drawHpBar({
			ctx,
			x: rightBarX + barW * 0.06,
			y: bottomBarY + barH * 0.58,
			width: barW * 0.88,
			height: barH * 0.22,
			value: rightHp * progress,
			fill: "#46c84b",
		});

		const bannerX = width * 0.06;
		const bannerY = height * 0.78;
		const bannerW = width * 0.88;
		const bannerH = height * 0.14;
		ctx.fillStyle = "#f8f8f8";
		roundedRect({
			ctx,
			x: bannerX,
			y: bannerY,
			width: bannerW,
			height: bannerH,
			radius: width * 0.012,
		});
		ctx.strokeStyle = "#34363a";
		ctx.lineWidth = Math.max(2, width * 0.006);
		const border = new Path2D();
		border.roundRect(bannerX, bannerY, bannerW, bannerH, width * 0.012);
		ctx.stroke(border);
		drawText({
			ctx,
			text: title,
			x: bannerX + bannerW * 0.03,
			y: bannerY + bannerH * 0.52,
			maxWidth: bannerW * 0.9,
			size: Math.max(18, width * 0.04),
			color: textColor,
			fontFamily,
		});
		ctx.fillStyle = accentColor;
		roundedRect({
			ctx,
			x: width * 0.48,
			y: height * 0.92,
			width: width * 0.12 * progress,
			height: height * 0.035,
			radius: height * 0.01,
		});
		ctx.restore();
	},
};

export const motionGraphicDefinitions = [
	mgTitleCardGraphicDefinition,
	mgLowerThirdGraphicDefinition,
	mgBattleCardGraphicDefinition,
];
