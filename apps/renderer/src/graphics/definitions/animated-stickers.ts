import type { ElementAnimations } from "@/animation/types";
import type { ParamDefinition, ParamValues } from "@/params";
import type { MediaTime } from "@/wasm/media-time";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { GraphicDefinition, GraphicRenderContext } from "../types";

export const ANIMATED_STICKER_CATEGORY = "animated-sticker";
const DEFAULT_ANIMATED_STICKER_DURATION_TICKS = 3 * MEDIA_TIME_TICKS_PER_SECOND;

function mediaTimeFromIntegerTicksForAnimatedSticker({
	ticks,
}: {
	ticks: number;
}): MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Constructed from integer MediaTime tick counts.
	return ticks as unknown as MediaTime;
}

export const DEFAULT_ANIMATED_STICKER_DURATION =
	mediaTimeFromIntegerTicksForAnimatedSticker({
		ticks: DEFAULT_ANIMATED_STICKER_DURATION_TICKS,
	});

type AnimatedStickerKind =
	| "sparkle"
	| "confetti"
	| "arrow"
	| "heart"
	| "check"
	| "alert";

export interface AnimatedStickerPreset {
	id: string;
	definitionId: string;
	name: string;
	kind: AnimatedStickerKind;
	keywords: string[];
	aliases: string[];
	useCases: string[];
	params: ParamValues;
}

const BASE_PARAMS = {
	primaryColor: "#ffffff",
	accentColor: "#facc15",
	secondaryColor: "#38bdf8",
	progress: 1,
} satisfies ParamValues;

export const ANIMATED_STICKER_PRESETS: AnimatedStickerPreset[] = [
	{
		id: "sparkle-loop",
		definitionId: "animated-sticker-sparkle-loop",
		name: "Sparkle Loop",
		kind: "sparkle",
		keywords: ["sparkle", "shine", "loop", "transparent", "glow"],
		aliases: ["闪光", "高光", "亮晶晶", "透明", "动效"],
		useCases: ["Highlight product details", "beauty shots", "premium beats"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#fde68a",
			accentColor: "#f59e0b",
			secondaryColor: "#ffffff",
		},
	},
	{
		id: "confetti-pop",
		definitionId: "animated-sticker-confetti-pop",
		name: "Confetti Pop",
		kind: "confetti",
		keywords: ["confetti", "celebrate", "pop", "party", "transparent"],
		aliases: ["礼花", "庆祝", "撒花", "弹出", "透明"],
		useCases: ["Celebrations", "wins", "new feature reveals"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#f97316",
			accentColor: "#22c55e",
			secondaryColor: "#3b82f6",
		},
	},
	{
		id: "bounce-arrow",
		definitionId: "animated-sticker-bounce-arrow",
		name: "Bounce Arrow",
		kind: "arrow",
		keywords: ["arrow", "bounce", "pointer", "tap", "transparent"],
		aliases: ["箭头", "弹跳", "指向", "点击", "透明"],
		useCases: ["Point at buttons", "call out details", "tutorial steps"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#22c55e",
			accentColor: "#bbf7d0",
			secondaryColor: "#14532d",
		},
	},
	{
		id: "heart-pulse",
		definitionId: "animated-sticker-heart-pulse",
		name: "Heart Pulse",
		kind: "heart",
		keywords: ["heart", "like", "pulse", "love", "reaction"],
		aliases: ["爱心", "点赞", "喜欢", "心动", "动效"],
		useCases: ["Reactions", "likes", "warm lifestyle moments"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#fb7185",
			accentColor: "#fff1f2",
			secondaryColor: "#be123c",
		},
	},
	{
		id: "check-pop",
		definitionId: "animated-sticker-check-pop",
		name: "Check Pop",
		kind: "check",
		keywords: ["check", "done", "success", "complete", "pop"],
		aliases: ["完成", "通过", "打勾", "确认", "弹出"],
		useCases: ["Status beats", "success moments", "task completion"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#16a34a",
			accentColor: "#dcfce7",
			secondaryColor: "#052e16",
		},
	},
	{
		id: "alert-shake",
		definitionId: "animated-sticker-alert-shake",
		name: "Alert Shake",
		kind: "alert",
		keywords: ["alert", "warning", "shake", "notice", "transparent"],
		aliases: ["警示", "注意", "提醒", "抖动", "透明"],
		useCases: ["Warnings", "gotchas", "risk notes", "strong reminders"],
		params: {
			...BASE_PARAMS,
			primaryColor: "#facc15",
			accentColor: "#111827",
			secondaryColor: "#fef3c7",
		},
	},
];

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
}: {
	key: string;
	label: string;
	defaultValue: number;
	min: number;
	max: number;
	step: number;
}): ParamDefinition {
	return {
		key,
		label,
		type: "number",
		default: defaultValue,
		min,
		max,
		step,
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

function drawSparkle({
	ctx,
	x,
	y,
	size,
	color,
}: {
	ctx: GraphicRenderContext["ctx"];
	x: number;
	y: number;
	size: number;
	color: string;
}): void {
	ctx.beginPath();
	ctx.moveTo(x, y - size);
	ctx.lineTo(x + size * 0.24, y - size * 0.24);
	ctx.lineTo(x + size, y);
	ctx.lineTo(x + size * 0.24, y + size * 0.24);
	ctx.lineTo(x, y + size);
	ctx.lineTo(x - size * 0.24, y + size * 0.24);
	ctx.lineTo(x - size, y);
	ctx.lineTo(x - size * 0.24, y - size * 0.24);
	ctx.closePath();
	ctx.fillStyle = color;
	ctx.fill();
}

function drawHeartPath({
	ctx,
	x,
	y,
	size,
}: {
	ctx: GraphicRenderContext["ctx"];
	x: number;
	y: number;
	size: number;
}): void {
	ctx.beginPath();
	ctx.moveTo(x, y + size * 0.33);
	ctx.bezierCurveTo(
		x - size,
		y - size * 0.22,
		x - size * 0.5,
		y - size,
		x,
		y - size * 0.42,
	);
	ctx.bezierCurveTo(
		x + size * 0.5,
		y - size,
		x + size,
		y - size * 0.22,
		x,
		y + size * 0.33,
	);
	ctx.closePath();
}

function drawRoundedBurst({
	ctx,
	x,
	y,
	radius,
	points,
}: {
	ctx: GraphicRenderContext["ctx"];
	x: number;
	y: number;
	radius: number;
	points: number;
}): void {
	ctx.beginPath();
	for (let index = 0; index < points * 2; index += 1) {
		const angle = -Math.PI / 2 + (index / (points * 2)) * Math.PI * 2;
		const r = index % 2 === 0 ? radius : radius * 0.72;
		const px = x + Math.cos(angle) * r;
		const py = y + Math.sin(angle) * r;
		if (index === 0) {
			ctx.moveTo(px, py);
		} else {
			ctx.lineTo(px, py);
		}
	}
	ctx.closePath();
}

function drawSparkleSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const centerX = width / 2;
	const centerY = height / 2;
	const unit = Math.min(width, height);
	const scale = 0.7 + easeOutBack({ value: progress }) * 0.3;
	const rotation = progress * Math.PI * 0.18;

	ctx.save();
	ctx.translate(centerX, centerY);
	ctx.rotate(rotation);
	drawSparkle({
		ctx,
		x: 0,
		y: 0,
		size: unit * 0.24 * scale,
		color: primaryColor,
	});
	ctx.restore();

	drawSparkle({
		ctx,
		x: width * 0.25,
		y: height * (0.34 - progress * 0.06),
		size: unit * 0.08,
		color: accentColor,
	});
	drawSparkle({
		ctx,
		x: width * 0.72,
		y: height * (0.68 + progress * 0.04),
		size: unit * 0.1,
		color: secondaryColor,
	});
}

function drawConfettiSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const centerX = width / 2;
	const centerY = height * 0.6;
	const unit = Math.min(width, height);
	const colors = [primaryColor, accentColor, secondaryColor];
	const burst = easeOutCubic({ value: progress });

	for (let index = 0; index < 16; index += 1) {
		const angle = -Math.PI * 0.95 + (index / 15) * Math.PI * 0.9;
		const distance = unit * (0.12 + burst * (0.22 + (index % 4) * 0.035));
		const x = centerX + Math.cos(angle) * distance;
		const y = centerY + Math.sin(angle) * distance + progress * unit * 0.08;
		const size = unit * (0.025 + (index % 3) * 0.008);
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(angle + progress * Math.PI * 2);
		ctx.fillStyle = colors[index % colors.length];
		ctx.fillRect(-size / 2, -size / 2, size, size * 1.7);
		ctx.restore();
	}

	ctx.beginPath();
	ctx.arc(
		centerX,
		centerY,
		unit * 0.12 * easeOutBack({ value: progress }),
		0,
		Math.PI * 2,
	);
	ctx.fillStyle = primaryColor;
	ctx.fill();
}

function drawArrowSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const unit = Math.min(width, height);
	const bounce = Math.sin(progress * Math.PI) * unit * 0.1;
	const centerX = width / 2;
	const centerY = height / 2 + bounce;
	const shaftWidth = unit * 0.16;
	const headSize = unit * 0.28;

	ctx.save();
	ctx.translate(centerX, centerY);
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	ctx.shadowColor = accentColor;
	ctx.shadowBlur = unit * 0.06;
	ctx.fillStyle = primaryColor;
	ctx.strokeStyle = secondaryColor;
	ctx.lineWidth = unit * 0.035;
	ctx.beginPath();
	ctx.roundRect(
		-shaftWidth / 2,
		-unit * 0.28,
		shaftWidth,
		unit * 0.34,
		shaftWidth / 2,
	);
	ctx.moveTo(-headSize, unit * 0.02);
	ctx.lineTo(0, unit * 0.32);
	ctx.lineTo(headSize, unit * 0.02);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

function drawHeartSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const unit = Math.min(width, height);
	const pulse = 1 + Math.sin(progress * Math.PI) * 0.12;
	const centerX = width / 2;
	const centerY = height / 2;

	ctx.save();
	ctx.translate(centerX, centerY);
	ctx.scale(pulse, pulse);
	drawHeartPath({ ctx, x: 0, y: 0, size: unit * 0.36 });
	ctx.fillStyle = primaryColor;
	ctx.fill();
	ctx.lineWidth = unit * 0.05;
	ctx.strokeStyle = accentColor;
	ctx.stroke();
	ctx.restore();

	ctx.globalAlpha = 1 - progress * 0.45;
	ctx.strokeStyle = secondaryColor;
	ctx.lineWidth = unit * 0.025;
	ctx.beginPath();
	ctx.arc(centerX, centerY, unit * (0.22 + progress * 0.16), 0, Math.PI * 2);
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawCheckSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const unit = Math.min(width, height);
	const centerX = width / 2;
	const centerY = height / 2;
	const scale = easeOutBack({ value: progress });

	ctx.beginPath();
	ctx.arc(centerX, centerY, unit * 0.32 * scale, 0, Math.PI * 2);
	ctx.fillStyle = accentColor;
	ctx.fill();
	ctx.lineWidth = unit * 0.055;
	ctx.strokeStyle = primaryColor;
	ctx.stroke();

	const reveal = clamp({ value: progress * 1.35, min: 0, max: 1 });
	ctx.beginPath();
	ctx.moveTo(centerX - unit * 0.16, centerY + unit * 0.01);
	ctx.lineTo(centerX - unit * 0.03, centerY + unit * 0.13);
	ctx.lineTo(centerX + unit * 0.18 * reveal, centerY - unit * 0.13 * reveal);
	ctx.strokeStyle = secondaryColor;
	ctx.lineWidth = unit * 0.07;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.stroke();
}

function drawAlertSticker({
	ctx,
	width,
	height,
	primaryColor,
	accentColor,
	secondaryColor,
	progress,
}: GraphicRenderContext & {
	primaryColor: string;
	accentColor: string;
	secondaryColor: string;
	progress: number;
}): void {
	const unit = Math.min(width, height);
	const centerX = width / 2;
	const centerY = height / 2;
	const shake =
		Math.sin(progress * Math.PI * 8) * unit * 0.025 * (1 - progress);

	ctx.save();
	ctx.translate(shake, 0);
	drawRoundedBurst({
		ctx,
		x: centerX,
		y: centerY,
		radius: unit * 0.34 * easeOutBack({ value: progress }),
		points: 10,
	});
	ctx.fillStyle = primaryColor;
	ctx.fill();
	ctx.lineWidth = unit * 0.035;
	ctx.strokeStyle = secondaryColor;
	ctx.stroke();

	ctx.fillStyle = accentColor;
	ctx.font = `900 ${unit * 0.42}px Arial, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("!", centerX, centerY + unit * 0.02);
	ctx.restore();
}

function buildDefinitionParams({
	preset,
}: {
	preset: AnimatedStickerPreset;
}): ParamDefinition[] {
	return [
		colorParam({
			key: "primaryColor",
			label: "Primary",
			defaultValue: String(
				preset.params.primaryColor ?? BASE_PARAMS.primaryColor,
			),
		}),
		colorParam({
			key: "accentColor",
			label: "Accent",
			defaultValue: String(
				preset.params.accentColor ?? BASE_PARAMS.accentColor,
			),
		}),
		colorParam({
			key: "secondaryColor",
			label: "Secondary",
			defaultValue: String(
				preset.params.secondaryColor ?? BASE_PARAMS.secondaryColor,
			),
		}),
		numberParam({
			key: "progress",
			label: "Motion",
			defaultValue: Number(preset.params.progress ?? BASE_PARAMS.progress),
			min: 0,
			max: 1,
			step: 0.01,
		}),
	];
}

function renderAnimatedSticker({
	preset,
	ctx,
	params,
	width,
	height,
}: GraphicRenderContext & { preset: AnimatedStickerPreset }): void {
	ctx.clearRect(0, 0, width, height);
	const progress = clamp({
		value: getNumber({ params, key: "progress", fallback: 1 }),
		min: 0,
		max: 1,
	});
	const shared = {
		ctx,
		params,
		width,
		height,
		progress,
		primaryColor: getString({
			params,
			key: "primaryColor",
			fallback: String(preset.params.primaryColor ?? BASE_PARAMS.primaryColor),
		}),
		accentColor: getString({
			params,
			key: "accentColor",
			fallback: String(preset.params.accentColor ?? BASE_PARAMS.accentColor),
		}),
		secondaryColor: getString({
			params,
			key: "secondaryColor",
			fallback: String(
				preset.params.secondaryColor ?? BASE_PARAMS.secondaryColor,
			),
		}),
	};

	switch (preset.kind) {
		case "sparkle":
			drawSparkleSticker(shared);
			break;
		case "confetti":
			drawConfettiSticker(shared);
			break;
		case "arrow":
			drawArrowSticker(shared);
			break;
		case "heart":
			drawHeartSticker(shared);
			break;
		case "check":
			drawCheckSticker(shared);
			break;
		case "alert":
			drawAlertSticker(shared);
			break;
	}
}

function createAnimatedStickerDefinition({
	preset,
}: {
	preset: AnimatedStickerPreset;
}): GraphicDefinition {
	return {
		id: preset.definitionId,
		name: preset.name,
		category: ANIMATED_STICKER_CATEGORY,
		keywords: [...preset.keywords, ...preset.aliases],
		params: buildDefinitionParams({ preset }),
		render(context) {
			renderAnimatedSticker({ preset, ...context });
		},
	};
}

export const animatedStickerGraphicDefinitions = ANIMATED_STICKER_PRESETS.map(
	(preset) => createAnimatedStickerDefinition({ preset }),
);

export function getAnimatedStickerPreset({
	presetId,
}: {
	presetId: string;
}): AnimatedStickerPreset | null {
	return (
		ANIMATED_STICKER_PRESETS.find((preset) => preset.id === presetId) ?? null
	);
}

export function getAnimatedStickerParams({
	preset,
	overrides,
}: {
	preset: AnimatedStickerPreset;
	overrides?: Partial<ParamValues>;
}): ParamValues {
	return {
		...BASE_PARAMS,
		...preset.params,
		...overrides,
	};
}

export function buildAnimatedStickerProgressAnimation({
	duration = DEFAULT_ANIMATED_STICKER_DURATION,
}: {
	duration?: MediaTime;
} = {}): ElementAnimations {
	return {
		"params.progress": {
			keys: [
				{
					id: "animated-sticker-progress-start",
					time: mediaTimeFromIntegerTicksForAnimatedSticker({ ticks: 0 }),
					value: 0,
					segmentToNext: "linear",
					tangentMode: "auto",
				},
				{
					id: "animated-sticker-progress-end",
					time: duration,
					value: 1,
					segmentToNext: "linear",
					tangentMode: "auto",
				},
			],
			extrapolation: {
				before: "hold",
				after: "hold",
			},
		},
	};
}
