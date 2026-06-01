import type { EffectPass } from "@/effects/types";
import type { ElementAnimations } from "@/animation/types";
import type { ParamValues } from "@/params";
import type { Transform } from "@/rendering";
import { BaseNode } from "./base-node";

export type EffectLayerNodeParams = {
	effectType: string;
	effectParams: ParamValues;
	timeOffset: number;
	duration: number;
	transform: Transform;
	animations?: ElementAnimations;
};

export type ResolvedEffectLayerNodeState = {
	passes: EffectPass[];
	transform: Transform;
};

export class EffectLayerNode extends BaseNode<
	EffectLayerNodeParams,
	ResolvedEffectLayerNodeState
> {}
