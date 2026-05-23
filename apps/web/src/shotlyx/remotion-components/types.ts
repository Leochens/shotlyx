export const SHOTLYX_REMOTION_COMPONENT_RUNTIME =
	"shotlyx-remotion-component-v1" as const;

export type ShotlyxRemotionComponentRuntime =
	typeof SHOTLYX_REMOTION_COMPONENT_RUNTIME;

export type ShotlyxMGAspectRatio = "16:9" | "9:16" | "1:1";

export type ShotlyxMGPropValue =
	| string
	| number
	| boolean
	| Array<Record<string, string | number | boolean>>;

export type ShotlyxMGPropType =
	| "text"
	| "number"
	| "color"
	| "font"
	| "boolean"
	| "select"
	| "image"
	| "table";

export type ShotlyxMGPropRole =
	| "content"
	| "style"
	| "typography"
	| "motion"
	| "data"
	| "asset";

export interface ShotlyxMGPropDefinition {
	key: string;
	label: string;
	type: ShotlyxMGPropType;
	role: ShotlyxMGPropRole;
	default: ShotlyxMGPropValue;
	min?: number;
	max?: number;
	step?: number;
	options?: Array<{ label: string; value: string }>;
	columns?: string[];
}

export interface ShotlyxRemotionComponentManifest {
	id: string;
	version: 1;
	runtime: ShotlyxRemotionComponentRuntime;
	name: string;
	durationSeconds: number;
	durationInFrames: number;
	fps: number;
	width: number;
	height: number;
	aspectRatio: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
	entry: "component.tsx";
	propsSchemaPath: "props.schema.json";
	defaultPropsPath: "props.default.json";
	thumbnailPath: "thumbnail.png";
	sourcePrompt: string;
}

export interface ShotlyxRemotionComponentDocument {
	version: 1;
	runtime: ShotlyxRemotionComponentRuntime;
	name: string;
	durationSeconds: number;
	fps: number;
	width: number;
	height: number;
	aspectRatio: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
	componentSource: string;
	compiledModule: string;
	propsSchema: ShotlyxMGPropDefinition[];
	defaultProps: Record<string, ShotlyxMGPropValue>;
	sourcePrompt: string;
	thumbnailFrame?: number;
	thumbnailUrl?: string;
	manifest?: ShotlyxRemotionComponentManifest;
}

export interface ShotlyxMGAsset {
	id: string;
	type: "shotlyx-remotion-component";
	name: string;
	runtime: ShotlyxRemotionComponentRuntime;
	document: ShotlyxRemotionComponentDocument;
	sourcePrompt: string;
	createdAt: string;
	updatedAt: string;
}
