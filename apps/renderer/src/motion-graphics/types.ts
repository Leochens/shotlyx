import type { ParamValue, ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";

export type MotionGraphicEngine = "opencut-graphic-v1";

export type ProjectMotionGraphicKind = "title" | "lower-third" | "battle-card";

export type MotionGraphicEditableParamRole =
	| "content"
	| "style"
	| "typography"
	| "motion"
	| "data";

export interface MotionGraphicEditableParam {
	key: string;
	label: string;
	type: "number" | "boolean" | "color" | "select" | "text" | "font";
	role: MotionGraphicEditableParamRole;
	value: ParamValue;
	default: ParamValue;
	keyframable: boolean;
	min?: number;
	max?: number;
	step?: number;
	unit?: "percent";
	options?: Array<{ value: string; label: string }>;
}

export type MotionGraphicSceneNodeKind =
	| "group"
	| "text"
	| "shape"
	| "bar"
	| "image-placeholder";

export interface MotionGraphicSceneParamRef {
	key: string;
	role: MotionGraphicEditableParamRole;
}

export interface MotionGraphicSceneNode {
	id: string;
	kind: MotionGraphicSceneNodeKind;
	label: string;
	paramRefs: MotionGraphicSceneParamRef[];
	children?: string[];
	locked?: boolean;
}

export interface MotionGraphicSceneAnimationPhase {
	id: string;
	label: string;
	progressRange: [number, number];
	description: string;
}

export interface MotionGraphicSceneGraph {
	version: 1;
	canvas: {
		width: number;
		height: number;
		aspectRatio: "16:9";
	};
	nodes: MotionGraphicSceneNode[];
	animation: {
		progressParam: "progress";
		phases: MotionGraphicSceneAnimationPhase[];
	};
}

export interface ProjectMotionGraphicManifest {
	version: 1;
	engine: MotionGraphicEngine;
	definitionId: string;
	definitionName: string;
	kind?: ProjectMotionGraphicKind;
	sourcePrompt?: string;
	editableParams: MotionGraphicEditableParam[];
	scene?: MotionGraphicSceneGraph;
	generatedAt: string;
	updatedAt: string;
}

export interface ProjectMotionGraphicAsset {
	id: string;
	name: string;
	engine: MotionGraphicEngine;
	definitionId: string;
	params: ParamValues;
	duration: MediaTime;
	kind?: ProjectMotionGraphicKind;
	sourcePrompt?: string;
	manifest?: ProjectMotionGraphicManifest;
	thumbnailUrl?: string;
	createdAt: string;
	updatedAt: string;
}
