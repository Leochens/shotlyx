import type { ParamValues } from "@/params";

export const TEXT_OVERLAY_KINDS = [
	"title",
	"subtitle",
	"caption",
	"lower_third",
	"label",
] as const;
export type TextOverlayKind = (typeof TEXT_OVERLAY_KINDS)[number];

export const TEXT_OVERLAY_STYLES = [
	"documentary",
	"clean",
	"bold",
	"social",
] as const;
export type TextOverlayStyle = (typeof TEXT_OVERLAY_STYLES)[number];

export const TEXT_OVERLAY_PLACEMENTS = [
	"top",
	"center",
	"lower_third",
	"bottom",
] as const;
export type TextOverlayPlacement = (typeof TEXT_OVERLAY_PLACEMENTS)[number];

export interface TextOverlayPlan {
	name: string;
	durationSeconds: number;
	params: ParamValues;
}

const DEFAULT_TEXT_PARAMS: ParamValues = {
	fontSize: 5,
	fontFamily: "Arial",
	color: "#ffffff",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	letterSpacing: 0,
	lineHeight: 1.2,
	"background.enabled": false,
	"background.color": "#000000",
	"background.cornerRadius": 0,
	"background.paddingX": 30,
	"background.paddingY": 42,
	"background.offsetX": 0,
	"background.offsetY": 0,
	"transform.positionX": 0,
	"transform.positionY": 0,
	"transform.scaleX": 1,
	"transform.scaleY": 1,
	"transform.rotate": 0,
	opacity: 1,
	blendMode: "normal",
};

function hasCjk({ value }: { value: string }): boolean {
	return /[\u3400-\u9fff]/.test(value);
}

function visibleLength({ value }: { value: string }): number {
	return Array.from(value.replace(/\s+/g, "")).length;
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
	return Math.min(max, Math.max(min, value));
}

function resolveDefaultPlacement({
	kind,
	placement,
}: {
	kind: TextOverlayKind;
	placement?: TextOverlayPlacement;
}): TextOverlayPlacement {
	if (placement) return placement;
	if (kind === "title") return "top";
	if (kind === "lower_third") return "lower_third";
	if (kind === "label") return "center";
	return "bottom";
}

function resolveFontSize({
	content,
	kind,
}: {
	content: string;
	kind: TextOverlayKind;
}): number {
	const length = visibleLength({ value: content });
	if (kind === "title")
		return clamp({ value: 9.5 - length * 0.16, min: 6.4, max: 9 });
	if (kind === "lower_third") {
		return clamp({ value: 6.2 - length * 0.08, min: 4.8, max: 6.2 });
	}
	if (kind === "label")
		return clamp({ value: 6 - length * 0.08, min: 4.2, max: 6 });
	return clamp({ value: 5.2 - length * 0.03, min: 4.1, max: 5.2 });
}

function resolvePositionY({
	canvasHeight,
	placement,
}: {
	canvasHeight: number;
	placement: TextOverlayPlacement;
}): number {
	if (placement === "top") return -canvasHeight * 0.34;
	if (placement === "center") return 0;
	if (placement === "lower_third") return canvasHeight * 0.24;
	return canvasHeight * 0.36;
}

function resolveStyleParams({
	style,
	kind,
}: {
	style: TextOverlayStyle;
	kind: TextOverlayKind;
}): ParamValues {
	if (style === "social") {
		return {
			fontWeight: "bold",
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#000000",
			"background.cornerRadius": 22,
			"background.paddingX": 24,
			"background.paddingY": 28,
		};
	}
	if (style === "bold") {
		return {
			fontWeight: "bold",
			color: "#ffffff",
			"background.enabled": true,
			"background.color": "#111827",
			"background.cornerRadius": 14,
			"background.paddingX": 26,
			"background.paddingY": 30,
		};
	}
	if (style === "documentary" || kind === "title") {
		return {
			fontWeight: "bold",
			color: "#f8fafc",
			"background.enabled": true,
			"background.color": "#0f172a",
			"background.cornerRadius": 10,
			"background.paddingX": 26,
			"background.paddingY": 28,
		};
	}
	return {
		fontWeight: "normal",
		color: "#ffffff",
		"background.enabled": kind !== "caption" && kind !== "subtitle",
		"background.color": "#000000",
		"background.cornerRadius": 8,
	};
}

function maybeWrapShortCjkTitle({
	content,
	kind,
}: {
	content: string;
	kind: TextOverlayKind;
}): string {
	if (kind !== "title" || !hasCjk({ value: content })) return content;
	const chars = Array.from(content);
	if (chars.length <= 10) return content;
	const midpoint = Math.ceil(chars.length / 2);
	return `${chars.slice(0, midpoint).join("")}\n${chars.slice(midpoint).join("")}`;
}

export function planTextOverlay({
	canvasSize,
	content,
	kind,
	style = "clean",
	placement,
	durationSeconds,
}: {
	canvasSize: { width: number; height: number };
	content: string;
	kind: TextOverlayKind;
	style?: TextOverlayStyle;
	placement?: TextOverlayPlacement;
	durationSeconds?: number;
}): TextOverlayPlan {
	const resolvedPlacement = resolveDefaultPlacement({ kind, placement });
	const plannedContent = maybeWrapShortCjkTitle({ content, kind });
	const fontSize = resolveFontSize({ content: plannedContent, kind });

	return {
		name:
			kind === "title"
				? "Title"
				: kind === "lower_third"
					? "Lower third"
					: kind === "label"
						? "Label"
						: "Text overlay",
		durationSeconds:
			durationSeconds ?? (kind === "title" ? 3 : kind === "caption" ? 4 : 5),
		params: {
			...DEFAULT_TEXT_PARAMS,
			...resolveStyleParams({ style, kind }),
			content: plannedContent,
			fontSize,
			fontFamily: "Arial",
			"transform.positionX": 0,
			"transform.positionY": resolvePositionY({
				canvasHeight: canvasSize.height,
				placement: resolvedPlacement,
			}),
		},
	};
}

export function buildDefaultTextParams({
	content,
}: {
	content: string;
}): ParamValues {
	return {
		...DEFAULT_TEXT_PARAMS,
		content,
	};
}
