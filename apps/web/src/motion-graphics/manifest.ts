import type { GraphicDefinition } from "@/graphics/types";
import type { ParamDefinition, ParamValue, ParamValues } from "@/params";
import type {
	MotionGraphicEditableParam,
	MotionGraphicEditableParamRole,
	MotionGraphicSceneGraph,
	MotionGraphicSceneNode,
	MotionGraphicSceneNodeKind,
	ProjectMotionGraphicKind,
	ProjectMotionGraphicManifest,
} from "./types";

const HIDDEN_MANIFEST_PARAMS = new Set(["progress"]);

function readParamValue({
	param,
	params,
}: {
	param: ParamDefinition;
	params: ParamValues;
}): ParamValue {
	const value = params[param.key];
	return value === undefined ? param.default : value;
}

function inferParamRole({
	param,
}: {
	param: ParamDefinition;
}): MotionGraphicEditableParamRole {
	const key = param.key.toLowerCase();
	if (param.type === "font" || key.includes("font")) {
		return "typography";
	}
	if (key === "progress" || key.includes("duration")) {
		return "motion";
	}
	if (
		param.type === "color" ||
		key.includes("color") ||
		key.includes("opacity") ||
		key.includes("panel") ||
		key.includes("background")
	) {
		return "style";
	}
	if (
		param.type === "text" ||
		key.includes("title") ||
		key.includes("name") ||
		key.includes("subtitle") ||
		key.includes("role")
	) {
		return "content";
	}
	return "data";
}

function buildEditableParam({
	param,
	params,
}: {
	param: ParamDefinition;
	params: ParamValues;
}): MotionGraphicEditableParam {
	const base: MotionGraphicEditableParam = {
		key: param.key,
		label: param.label,
		type: param.type,
		role: inferParamRole({ param }),
		value: readParamValue({ param, params }),
		default: param.default,
		keyframable: param.keyframable !== false,
	};

	if (param.type === "number") {
		return {
			...base,
			min: param.min,
			max: param.max,
			step: param.step,
			unit: param.unit,
		};
	}

	if (param.type === "select") {
		return {
			...base,
			options: param.options,
		};
	}

	return base;
}

function buildParamRefs({
	definition,
	keys,
}: {
	definition: GraphicDefinition;
	keys: string[];
}): MotionGraphicSceneNode["paramRefs"] {
	return keys.flatMap((key) => {
		const param = definition.params.find((item) => item.key === key);
		return param
			? [
					{
						key,
						role: inferParamRole({ param }),
					},
				]
			: [];
	});
}

function buildSceneNode({
	definition,
	id,
	kind,
	label,
	paramKeys = [],
	children,
	locked,
}: {
	definition: GraphicDefinition;
	id: string;
	kind: MotionGraphicSceneNodeKind;
	label: string;
	paramKeys?: string[];
	children?: string[];
	locked?: boolean;
}): MotionGraphicSceneNode {
	return {
		id,
		kind,
		label,
		paramRefs: buildParamRefs({ definition, keys: paramKeys }),
		children,
		locked,
	};
}

function buildTitleSceneNodes({
	definition,
}: {
	definition: GraphicDefinition;
}): MotionGraphicSceneNode[] {
	return [
		buildSceneNode({
			definition,
			id: "root",
			kind: "group",
			label: "Title card",
			children: ["background", "panel", "title", "subtitle", "accent-bar"],
			locked: true,
		}),
		buildSceneNode({
			definition,
			id: "background",
			kind: "shape",
			label: "Background",
			paramKeys: ["backgroundColor", "backgroundOpacity"],
		}),
		buildSceneNode({
			definition,
			id: "panel",
			kind: "shape",
			label: "Title panel",
			paramKeys: ["panelColor"],
		}),
		buildSceneNode({
			definition,
			id: "title",
			kind: "text",
			label: "Title text",
			paramKeys: ["title", "textColor", "fontFamily"],
		}),
		buildSceneNode({
			definition,
			id: "subtitle",
			kind: "text",
			label: "Subtitle text",
			paramKeys: ["subtitle", "textColor", "fontFamily"],
		}),
		buildSceneNode({
			definition,
			id: "accent-bar",
			kind: "bar",
			label: "Accent bar",
			paramKeys: ["accentColor"],
		}),
	];
}

function buildLowerThirdSceneNodes({
	definition,
}: {
	definition: GraphicDefinition;
}): MotionGraphicSceneNode[] {
	return [
		buildSceneNode({
			definition,
			id: "root",
			kind: "group",
			label: "Lower third",
			children: ["panel", "accent-bar", "name", "role"],
			locked: true,
		}),
		buildSceneNode({
			definition,
			id: "panel",
			kind: "shape",
			label: "Nameplate panel",
			paramKeys: ["panelColor"],
		}),
		buildSceneNode({
			definition,
			id: "accent-bar",
			kind: "bar",
			label: "Accent bar",
			paramKeys: ["accentColor"],
		}),
		buildSceneNode({
			definition,
			id: "name",
			kind: "text",
			label: "Name text",
			paramKeys: ["name", "textColor", "fontFamily"],
		}),
		buildSceneNode({
			definition,
			id: "role",
			kind: "text",
			label: "Role text",
			paramKeys: ["role", "textColor", "fontFamily"],
		}),
	];
}

function buildBattleCardSceneNodes({
	definition,
}: {
	definition: GraphicDefinition;
}): MotionGraphicSceneNode[] {
	return [
		buildSceneNode({
			definition,
			id: "root",
			kind: "group",
			label: "Battle card",
			children: [
				"background",
				"title-banner",
				"left-card",
				"right-card",
				"left-hp-bar",
				"right-hp-bar",
				"accent-bar",
			],
			locked: true,
		}),
		buildSceneNode({
			definition,
			id: "background",
			kind: "shape",
			label: "Background",
			paramKeys: ["backgroundColor"],
		}),
		buildSceneNode({
			definition,
			id: "title-banner",
			kind: "text",
			label: "Result title",
			paramKeys: ["title", "textColor", "fontFamily"],
		}),
		buildSceneNode({
			definition,
			id: "left-card",
			kind: "group",
			label: "Left competitor card",
			paramKeys: ["leftName", "leftColor"],
		}),
		buildSceneNode({
			definition,
			id: "right-card",
			kind: "group",
			label: "Right competitor card",
			paramKeys: ["rightName", "rightColor"],
		}),
		buildSceneNode({
			definition,
			id: "left-hp-bar",
			kind: "bar",
			label: "Left HP bar",
			paramKeys: ["leftHp", "leftColor"],
		}),
		buildSceneNode({
			definition,
			id: "right-hp-bar",
			kind: "bar",
			label: "Right HP bar",
			paramKeys: ["rightHp", "rightColor"],
		}),
		buildSceneNode({
			definition,
			id: "accent-bar",
			kind: "bar",
			label: "Accent bar",
			paramKeys: ["accentColor"],
		}),
	];
}

function inferSceneKind({
	definition,
	kind,
}: {
	definition: GraphicDefinition;
	kind?: ProjectMotionGraphicKind;
}): ProjectMotionGraphicKind {
	if (kind) return kind;
	if (definition.id === "mg-battle-card") return "battle-card";
	if (definition.id === "mg-lower-third") return "lower-third";
	return "title";
}

export function buildMotionGraphicSceneGraph({
	definition,
	kind,
}: {
	definition: GraphicDefinition;
	kind?: ProjectMotionGraphicKind;
}): MotionGraphicSceneGraph {
	const sceneKind = inferSceneKind({ definition, kind });
	const nodes =
		sceneKind === "battle-card"
			? buildBattleCardSceneNodes({ definition })
			: sceneKind === "lower-third"
				? buildLowerThirdSceneNodes({ definition })
				: buildTitleSceneNodes({ definition });

	return {
		version: 1,
		canvas: {
			width: 1920,
			height: 1080,
			aspectRatio: "16:9",
		},
		nodes,
		animation: {
			progressParam: "progress",
			phases: [
				{
					id: "intro",
					label: "Intro",
					progressRange: [0, 0.28],
					description: "Elements enter and establish the layout.",
				},
				{
					id: "hold",
					label: "Hold",
					progressRange: [0.28, 0.78],
					description: "Core text and data stay readable for editing and review.",
				},
				{
					id: "outro",
					label: "Outro",
					progressRange: [0.78, 1],
					description: "Accent motion completes and prepares the cut.",
				},
			],
		},
	};
}

export function buildMotionGraphicManifest({
	definition,
	kind,
	params,
	sourcePrompt,
	generatedAt,
	updatedAt,
}: {
	definition: GraphicDefinition;
	kind?: ProjectMotionGraphicKind;
	params: ParamValues;
	sourcePrompt?: string;
	generatedAt?: string;
	updatedAt?: string;
}): ProjectMotionGraphicManifest {
	const now = new Date().toISOString();
	return {
		version: 1,
		engine: "opencut-graphic-v1",
		definitionId: definition.id,
		definitionName: definition.name,
		kind,
		sourcePrompt,
		editableParams: definition.params
			.filter((param) => !HIDDEN_MANIFEST_PARAMS.has(param.key))
			.map((param) => buildEditableParam({ param, params })),
		scene: buildMotionGraphicSceneGraph({ definition, kind }),
		generatedAt: generatedAt ?? now,
		updatedAt: updatedAt ?? now,
	};
}
