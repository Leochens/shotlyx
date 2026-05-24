import { BaseNode } from "./base-node";
import type { TextElement, SubtitleElement } from "@/timeline";
import type { EffectPass } from "@/effects/types";
import type { BlendMode, Transform } from "@/rendering";
import {
	drawMeasuredTextHighlight,
	drawMeasuredTextLayout,
} from "@/text/primitives";
import type { MeasuredTextElement } from "@/text/measure-element";

export type TextNodeParams = (TextElement | SubtitleElement) & {
	transform: Transform;
	opacity: number;
	blendMode?: BlendMode;
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

export interface ResolvedTextNodeState {
	transform: Transform;
	opacity: number;
	textColor: string;
	backgroundColor: string;
	highlightText?: string;
	highlightColor?: string;
	effectPasses: EffectPass[][];
	measuredText: MeasuredTextElement;
}

export class TextNode extends BaseNode<TextNodeParams, ResolvedTextNodeState> {}

export function renderTextToContext({
	node,
	ctx,
}: {
	node: TextNode;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}): void {
	const resolved = node.resolved;
	if (!resolved) {
		return;
	}

	const x = resolved.transform.position.x + node.params.canvasCenter.x;
	const y = resolved.transform.position.y + node.params.canvasCenter.y;
	const baseline = node.params.textBaseline ?? "middle";

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(resolved.transform.scaleX, resolved.transform.scaleY);
	if (resolved.transform.rotate) {
		ctx.rotate((resolved.transform.rotate * Math.PI) / 180);
	}

	drawMeasuredTextLayout({
		ctx,
		layout: resolved.measuredText,
		textColor: resolved.textColor,
		background: resolved.measuredText.resolvedBackground,
		backgroundColor: resolved.backgroundColor,
		textBaseline: baseline,
	});

	const highlightText = resolved.highlightText;
	const highlightColor = resolved.highlightColor;
	if (
		typeof highlightText === "string" &&
		highlightText.length > 0 &&
		typeof highlightColor === "string"
	) {
		drawMeasuredTextHighlight({
			ctx,
			layout: resolved.measuredText,
			highlightText,
			textColor: highlightColor,
			textBaseline: baseline,
		});
	}

	ctx.restore();
}
