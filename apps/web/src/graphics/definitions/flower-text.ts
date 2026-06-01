import type { ElementAnimations } from "@/animation/types";
import type { ParamDefinition, ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { GraphicDefinition } from "../types";

export const FLOWER_TEXT_CATEGORY = "flower-text";
const DEFAULT_FLOWER_TEXT_DURATION_TICKS = 5 * MEDIA_TIME_TICKS_PER_SECOND;

function mediaTimeFromIntegerTicksForFlowerText({
	ticks,
}: {
	ticks: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Constructed from integer MediaTime tick counts.
	return ticks as unknown as MediaTime;
}

export const DEFAULT_FLOWER_TEXT_DURATION =
	mediaTimeFromIntegerTicksForFlowerText({
		ticks: DEFAULT_FLOWER_TEXT_DURATION_TICKS,
	});

type FlowerTextKind =
	| "emphasis"
	| "number"
	| "burst"
	| "bubble"
	| "tag"
	| "arrow"
	| "caption"
	| "badge";

export interface FlowerTextPreset {
	id: string;
	definitionId: string;
	name: string;
	kind: FlowerTextKind;
	defaultText: string;
	keywords: string[];
	aliases: string[];
	useCases: string[];
	params: ParamValues;
}

const BASE_PARAMS = {
	fontFamily: "Arial",
	fontSize: 18,
	textColor: "#ffffff",
	strokeColor: "#111827",
	strokeWidth: 10,
	shadowColor: "rgba(0, 0, 0, 0.35)",
	shadowBlur: 8,
	shadowOffsetX: 0,
	shadowOffsetY: 4,
	accentColor: "#ffcf33",
	backgroundColor: "#111827",
	backgroundOpacity: 0.92,
	progress: 1,
} satisfies ParamValues;

export const FLOWER_TEXT_PRESETS: FlowerTextPreset[] = [
	{
		id: "emphasis-pop",
		definitionId: "flower-text-emphasis-pop",
		name: "Emphasis Pop",
		kind: "emphasis",
		defaultText: "重点来了",
		keywords: ["highlight", "emphasis", "pop", "key point", "bold"],
		aliases: ["花字", "强调", "重点", "弹字", "剪映"],
		useCases: ["Key phrases", "short-video emphasis", "important beats"],
		params: {
			...BASE_PARAMS,
			content: "重点来了",
			fontSize: 19,
			textColor: "#fff7ed",
			strokeColor: "#111827",
			strokeWidth: 12,
			accentColor: "#ff3b30",
			backgroundColor: "#ffcf33",
			backgroundOpacity: 0.18,
		},
	},
	{
		id: "number-boost",
		definitionId: "flower-text-number-boost",
		name: "Number Boost",
		kind: "number",
		defaultText: "+100%",
		keywords: ["number", "metric", "growth", "price", "score"],
		aliases: ["数字", "涨幅", "数据", "价格", "成绩"],
		useCases: ["Growth numbers", "scores", "prices", "metrics"],
		params: {
			...BASE_PARAMS,
			content: "+100%",
			fontSize: 23,
			textColor: "#111827",
			strokeColor: "#ffffff",
			strokeWidth: 13,
			accentColor: "#2dd4bf",
			backgroundColor: "#fef08a",
			backgroundOpacity: 0.9,
		},
	},
	{
		id: "exclamation-burst",
		definitionId: "flower-text-exclamation-burst",
		name: "Exclamation Burst",
		kind: "burst",
		defaultText: "哇！",
		keywords: ["surprise", "burst", "exclamation", "comic", "wow"],
		aliases: ["惊讶", "哇", "爆炸", "漫画", "感叹"],
		useCases: ["Surprises", "reveals", "comic reactions"],
		params: {
			...BASE_PARAMS,
			content: "哇！",
			fontSize: 24,
			textColor: "#ffffff",
			strokeColor: "#1f2937",
			strokeWidth: 11,
			accentColor: "#f97316",
			backgroundColor: "#ef4444",
			backgroundOpacity: 0.98,
		},
	},
	{
		id: "speech-bubble",
		definitionId: "flower-text-speech-bubble",
		name: "Speech Bubble",
		kind: "bubble",
		defaultText: "真的吗？",
		keywords: ["speech", "bubble", "comment", "reaction", "talk"],
		aliases: ["气泡", "评论", "对话", "反应", "吐槽"],
		useCases: ["Side comments", "reactions", "dialogue moments"],
		params: {
			...BASE_PARAMS,
			content: "真的吗？",
			fontSize: 17,
			textColor: "#111827",
			strokeColor: "#ffffff",
			strokeWidth: 4,
			accentColor: "#60a5fa",
			backgroundColor: "#ffffff",
			backgroundOpacity: 0.96,
		},
	},
	{
		id: "price-tag",
		definitionId: "flower-text-price-tag",
		name: "Price Tag",
		kind: "tag",
		defaultText: "限时优惠",
		keywords: ["price", "sale", "discount", "offer", "commerce"],
		aliases: ["价格", "优惠", "促销", "电商", "标签"],
		useCases: ["Offers", "prices", "shopping clips", "product videos"],
		params: {
			...BASE_PARAMS,
			content: "限时优惠",
			fontSize: 16,
			textColor: "#ffffff",
			strokeColor: "#7f1d1d",
			strokeWidth: 6,
			accentColor: "#fbbf24",
			backgroundColor: "#dc2626",
			backgroundOpacity: 0.96,
		},
	},
	{
		id: "arrow-callout",
		definitionId: "flower-text-arrow-callout",
		name: "Arrow Callout",
		kind: "arrow",
		defaultText: "看这里",
		keywords: ["arrow", "callout", "pointer", "annotation", "look"],
		aliases: ["箭头", "标注", "指向", "看这里", "提示"],
		useCases: ["Pointing at product details", "annotations", "UI demos"],
		params: {
			...BASE_PARAMS,
			content: "看这里",
			fontSize: 16,
			textColor: "#111827",
			strokeColor: "#ffffff",
			strokeWidth: 7,
			accentColor: "#22c55e",
			backgroundColor: "#bbf7d0",
			backgroundOpacity: 0.94,
		},
	},
	{
		id: "sticker-caption",
		definitionId: "flower-text-sticker-caption",
		name: "Sticker Caption",
		kind: "caption",
		defaultText: "太真实了",
		keywords: ["caption", "label", "sticker", "subtitle", "social"],
		aliases: ["贴纸字幕", "花字字幕", "标签", "社媒", "口播"],
		useCases: ["Short captions", "social labels", "spoken punchlines"],
		params: {
			...BASE_PARAMS,
			content: "太真实了",
			fontSize: 16,
			textColor: "#111827",
			strokeColor: "#ffffff",
			strokeWidth: 5,
			accentColor: "#a78bfa",
			backgroundColor: "#f5f3ff",
			backgroundOpacity: 0.95,
		},
	},
	{
		id: "completion-badge",
		definitionId: "flower-text-completion-badge",
		name: "Completion Badge",
		kind: "badge",
		defaultText: "搞定",
		keywords: ["done", "new", "ok", "badge", "complete"],
		aliases: ["完成", "搞定", "徽章", "OK", "上新"],
		useCases: ["Status beats", "task completion", "new feature labels"],
		params: {
			...BASE_PARAMS,
			content: "搞定",
			fontSize: 18,
			textColor: "#052e16",
			strokeColor: "#ffffff",
			strokeWidth: 5,
			accentColor: "#16a34a",
			backgroundColor: "#dcfce7",
			backgroundOpacity: 0.96,
		},
	},
];

function textParam({
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

function fontParam({
	defaultValue,
}: {
	defaultValue: string;
}): ParamDefinition {
	return {
		key: "fontFamily",
		label: "Font",
		type: "font",
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
	shortLabel,
}: {
	key: string;
	label: string;
	defaultValue: number;
	min: number;
	max?: number;
	step: number;
	shortLabel?: string;
}): ParamDefinition {
	return {
		key,
		label,
		type: "number",
		default: defaultValue,
		min,
		max,
		step,
		shortLabel,
	};
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
	return typeof value === "string" && value.trim() ? value : fallback;
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

function easeOutBack({ value }: { value: number }): number {
	const t = clamp({ value, min: 0, max: 1 });
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic({ value }: { value: number }): number {
	const t = clamp({ value, min: 0, max: 1 });
	return 1 - Math.pow(1 - t, 3);
}

function buildDefinitionParams({ preset }: { preset: FlowerTextPreset }) {
	return [
		textParam({
			key: "content",
			label: "Text",
			defaultValue: preset.defaultText,
		}),
		fontParam({
			defaultValue: String(preset.params.fontFamily ?? BASE_PARAMS.fontFamily),
		}),
		numberParam({
			key: "fontSize",
			label: "Size",
			defaultValue: Number(preset.params.fontSize ?? BASE_PARAMS.fontSize),
			min: 6,
			max: 36,
			step: 0.5,
		}),
		colorParam({
			key: "textColor",
			label: "Text",
			defaultValue: String(preset.params.textColor ?? BASE_PARAMS.textColor),
		}),
		colorParam({
			key: "strokeColor",
			label: "Outline",
			defaultValue: String(
				preset.params.strokeColor ?? BASE_PARAMS.strokeColor,
			),
		}),
		numberParam({
			key: "strokeWidth",
			label: "Outline width",
			defaultValue: Number(
				preset.params.strokeWidth ?? BASE_PARAMS.strokeWidth,
			),
			min: 0,
			max: 28,
			step: 0.5,
		}),
		colorParam({
			key: "shadowColor",
			label: "Shadow",
			defaultValue: String(
				preset.params.shadowColor ?? BASE_PARAMS.shadowColor,
			),
		}),
		numberParam({
			key: "shadowBlur",
			label: "Shadow blur",
			defaultValue: Number(preset.params.shadowBlur ?? BASE_PARAMS.shadowBlur),
			min: 0,
			max: 32,
			step: 1,
		}),
		numberParam({
			key: "shadowOffsetX",
			label: "Shadow X",
			defaultValue: Number(
				preset.params.shadowOffsetX ?? BASE_PARAMS.shadowOffsetX,
			),
			min: -32,
			max: 32,
			step: 1,
		}),
		numberParam({
			key: "shadowOffsetY",
			label: "Shadow Y",
			defaultValue: Number(
				preset.params.shadowOffsetY ?? BASE_PARAMS.shadowOffsetY,
			),
			min: -32,
			max: 32,
			step: 1,
		}),
		colorParam({
			key: "accentColor",
			label: "Accent",
			defaultValue: String(
				preset.params.accentColor ?? BASE_PARAMS.accentColor,
			),
		}),
		colorParam({
			key: "backgroundColor",
			label: "Background",
			defaultValue: String(
				preset.params.backgroundColor ?? BASE_PARAMS.backgroundColor,
			),
		}),
		numberParam({
			key: "backgroundOpacity",
			label: "Background opacity",
			defaultValue: Number(
				preset.params.backgroundOpacity ?? BASE_PARAMS.backgroundOpacity,
			),
			min: 0,
			max: 1,
			step: 0.01,
		}),
		numberParam({
			key: "progress",
			label: "Animation progress",
			defaultValue: Number(preset.params.progress ?? BASE_PARAMS.progress),
			min: 0,
			max: 1,
			step: 0.01,
			shortLabel: "%",
		}),
	];
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
	const r = clamp({ value: radius, min: 0, max: Math.min(width, height) / 2 });
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + width - r, y);
	ctx.quadraticCurveTo(x + width, y, x + width, y + r);
	ctx.lineTo(x + width, y + height - r);
	ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
	ctx.lineTo(x + r, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
	ctx.closePath();
}

function drawBurst({
	ctx,
	radius,
	fill,
	accent,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	radius: number;
	fill: string;
	accent: string;
}): void {
	const points = 18;
	ctx.save();
	ctx.beginPath();
	for (let i = 0; i < points; i++) {
		const angle = (Math.PI * 2 * i) / points - Math.PI / 2;
		const currentRadius = i % 2 === 0 ? radius : radius * 0.72;
		const x = Math.cos(angle) * currentRadius;
		const y = Math.sin(angle) * currentRadius;
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fillStyle = fill;
	ctx.fill();
	ctx.lineWidth = Math.max(3, radius * 0.04);
	ctx.strokeStyle = accent;
	ctx.stroke();
	ctx.restore();
}

function drawTag({
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
	const notch = Math.min(width * 0.16, height * 0.45);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + width - notch, y);
	ctx.lineTo(x + width, y + height / 2);
	ctx.lineTo(x + width - notch, y + height);
	ctx.lineTo(x + radius, y + height);
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

function fitFontSize({
	ctx,
	text,
	fontFamily,
	targetSize,
	maxWidth,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	text: string;
	fontFamily: string;
	targetSize: number;
	maxWidth: number;
}): number {
	let size = targetSize;
	while (size > 8) {
		ctx.font = `800 ${size}px ${fontFamily}, Arial, sans-serif`;
		if (ctx.measureText(text).width <= maxWidth) {
			return size;
		}
		size -= 2;
	}
	return size;
}

function drawFlowerText({
	ctx,
	preset,
	params,
	width,
	height,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	preset: FlowerTextPreset;
	params: ParamValues;
	width: number;
	height: number;
}): void {
	const content = getString({
		params,
		key: "content",
		fallback: preset.defaultText,
	});
	const fontFamily = getString({
		params,
		key: "fontFamily",
		fallback: "Arial",
	});
	const textColor = getString({
		params,
		key: "textColor",
		fallback: "#ffffff",
	});
	const strokeColor = getString({
		params,
		key: "strokeColor",
		fallback: "#111827",
	});
	const shadowColor = getString({
		params,
		key: "shadowColor",
		fallback: "rgba(0, 0, 0, 0.35)",
	});
	const accentColor = getString({
		params,
		key: "accentColor",
		fallback: "#ffcf33",
	});
	const backgroundColor = getString({
		params,
		key: "backgroundColor",
		fallback: "#111827",
	});
	const backgroundOpacity = clamp({
		value: getNumber({ params, key: "backgroundOpacity", fallback: 0.92 }),
		min: 0,
		max: 1,
	});
	const rawProgress = clamp({
		value: getNumber({ params, key: "progress", fallback: 1 }),
		min: 0,
		max: 1,
	});
	const eased = easeOutBack({ value: rawProgress });
	const alpha = clamp({ value: rawProgress * 1.5, min: 0, max: 1 });
	const baseScale = 0.76 + eased * 0.24;
	const slide = (1 - easeOutCubic({ value: rawProgress })) * width * 0.12;
	const rotate =
		preset.kind === "burst" ? ((1 - rawProgress) * -8 * Math.PI) / 180 : 0;
	const offsetX = preset.kind === "arrow" ? -slide : 0;
	const offsetY = preset.kind === "tag" ? slide * 0.45 : 0;

	ctx.save();
	ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
	ctx.rotate(rotate);
	ctx.scale(baseScale, baseScale);
	ctx.globalAlpha *= alpha;

	const targetFontSize =
		(height *
			getNumber({
				params,
				key: "fontSize",
				fallback: 18,
			})) /
		100;
	const maxTextWidth = width * 0.74;
	const fontSize = fitFontSize({
		ctx,
		text: content,
		fontFamily,
		targetSize: targetFontSize,
		maxWidth: maxTextWidth,
	});
	ctx.font = `800 ${fontSize}px ${fontFamily}, Arial, sans-serif`;
	const textWidth = Math.min(ctx.measureText(content).width, maxTextWidth);
	const paddingX = Math.max(width * 0.055, fontSize * 0.48);
	const paddingY = Math.max(height * 0.04, fontSize * 0.28);
	const boxWidth = Math.min(
		width * 0.88,
		Math.max(width * 0.32, textWidth + paddingX * 2),
	);
	const boxHeight = Math.min(
		height * 0.58,
		Math.max(fontSize + paddingY * 2, height * 0.18),
	);
	const boxX = -boxWidth / 2;
	const boxY = -boxHeight / 2;
	const radius = Math.min(boxHeight * 0.38, width * 0.08);

	ctx.save();
	ctx.globalAlpha *= backgroundOpacity;
	ctx.fillStyle = backgroundColor;
	if (preset.kind === "burst") {
		drawBurst({
			ctx,
			radius: Math.min(width, height) * 0.38,
			fill: backgroundColor,
			accent: accentColor,
		});
	} else if (preset.kind === "tag") {
		drawTag({
			ctx,
			x: boxX,
			y: boxY,
			width: boxWidth,
			height: boxHeight,
			radius,
		});
		ctx.fill();
		ctx.fillStyle = accentColor;
		ctx.beginPath();
		ctx.arc(
			boxX + boxWidth - boxHeight * 0.31,
			0,
			boxHeight * 0.07,
			0,
			Math.PI * 2,
		);
		ctx.fill();
	} else {
		roundedRect({
			ctx,
			x: boxX,
			y: boxY,
			width: boxWidth,
			height: boxHeight,
			radius,
		});
		ctx.fill();
		if (preset.kind === "bubble") {
			ctx.beginPath();
			ctx.moveTo(boxX + boxWidth * 0.22, boxY + boxHeight - 1);
			ctx.lineTo(boxX + boxWidth * 0.31, boxY + boxHeight + boxHeight * 0.22);
			ctx.lineTo(boxX + boxWidth * 0.42, boxY + boxHeight - 1);
			ctx.closePath();
			ctx.fill();
		}
	}
	ctx.restore();

	if (preset.kind === "number" || preset.kind === "emphasis") {
		ctx.save();
		ctx.globalAlpha *= 0.9;
		ctx.strokeStyle = accentColor;
		ctx.lineWidth = Math.max(2, height * 0.012);
		ctx.beginPath();
		ctx.arc(-boxWidth * 0.42, -boxHeight * 0.38, height * 0.04, 0, Math.PI * 2);
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(boxWidth * 0.42, boxHeight * 0.36, height * 0.035, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
	}

	if (preset.kind === "arrow") {
		ctx.save();
		ctx.strokeStyle = accentColor;
		ctx.fillStyle = accentColor;
		ctx.lineWidth = Math.max(4, height * 0.025);
		ctx.lineCap = "round";
		const startX = boxX + boxWidth * 0.82;
		const endX = boxX + boxWidth + width * 0.13;
		ctx.beginPath();
		ctx.moveTo(startX, boxY + boxHeight * 0.5);
		ctx.lineTo(endX, boxY + boxHeight * 0.5);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(endX, boxY + boxHeight * 0.5);
		ctx.lineTo(endX - height * 0.055, boxY + boxHeight * 0.37);
		ctx.lineTo(endX - height * 0.055, boxY + boxHeight * 0.63);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}

	if (preset.kind === "badge") {
		ctx.save();
		ctx.fillStyle = accentColor;
		ctx.beginPath();
		ctx.arc(boxX + boxHeight * 0.42, 0, boxHeight * 0.24, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = Math.max(2, height * 0.01);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.beginPath();
		ctx.moveTo(boxX + boxHeight * 0.32, boxHeight * 0.01);
		ctx.lineTo(boxX + boxHeight * 0.39, boxHeight * 0.09);
		ctx.lineTo(boxX + boxHeight * 0.54, -boxHeight * 0.1);
		ctx.stroke();
		ctx.restore();
	}

	ctx.save();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `800 ${fontSize}px ${fontFamily}, Arial, sans-serif`;
	ctx.lineJoin = "round";
	ctx.miterLimit = 2;
	ctx.shadowColor = shadowColor;
	ctx.shadowBlur = getNumber({ params, key: "shadowBlur", fallback: 8 });
	ctx.shadowOffsetX = getNumber({ params, key: "shadowOffsetX", fallback: 0 });
	ctx.shadowOffsetY = getNumber({ params, key: "shadowOffsetY", fallback: 4 });
	const strokeWidth = getNumber({
		params,
		key: "strokeWidth",
		fallback: 10,
	});
	if (strokeWidth > 0) {
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = strokeColor;
		ctx.strokeText(
			content,
			preset.kind === "badge" ? boxHeight * 0.12 : 0,
			0,
			maxTextWidth,
		);
	}
	ctx.fillStyle = textColor;
	ctx.fillText(
		content,
		preset.kind === "badge" ? boxHeight * 0.12 : 0,
		0,
		maxTextWidth,
	);
	ctx.restore();
	ctx.restore();
}

function createFlowerTextDefinition({
	preset,
}: {
	preset: FlowerTextPreset;
}): GraphicDefinition {
	return {
		id: preset.definitionId,
		name: preset.name,
		category: FLOWER_TEXT_CATEGORY,
		keywords: [
			FLOWER_TEXT_CATEGORY,
			"flower text",
			"jianying",
			"capcut",
			...preset.keywords,
			...preset.aliases,
		],
		params: buildDefinitionParams({ preset }),
		render: ({ ctx, params, width, height }) => {
			drawFlowerText({ ctx, preset, params, width, height });
		},
	};
}

export const flowerTextGraphicDefinitions: GraphicDefinition[] =
	FLOWER_TEXT_PRESETS.map((preset) => createFlowerTextDefinition({ preset }));

export function getFlowerTextPreset({
	presetId,
}: {
	presetId: string;
}): FlowerTextPreset | null {
	return FLOWER_TEXT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function getFlowerTextParams({
	preset,
	overrides,
}: {
	preset: FlowerTextPreset;
	overrides?: Partial<ParamValues>;
}): ParamValues {
	return {
		...preset.params,
		...(overrides ?? {}),
	};
}

export function buildFlowerTextProgressAnimation({
	duration,
}: {
	duration: MediaTime;
}): ElementAnimations {
	const durationTicks = Math.max(1, Number(duration));
	const introEnd = mediaTimeFromIntegerTicksForFlowerText({
		ticks: Math.max(1, Math.round(durationTicks * 0.18)),
	});
	const zero = mediaTimeFromIntegerTicksForFlowerText({ ticks: 0 });

	return {
		"params.progress": {
			keys: [
				{
					id: "flower-text-progress-start",
					time: zero,
					value: 0,
					segmentToNext: "bezier",
					tangentMode: "flat",
				},
				{
					id: "flower-text-progress-end",
					time: introEnd,
					value: 1,
					segmentToNext: "linear",
					tangentMode: "flat",
				},
			],
			extrapolation: {
				before: "hold",
				after: "hold",
			},
		},
	};
}
