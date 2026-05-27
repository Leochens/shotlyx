export const SHOTLYX_REMOTION_COMPONENT_RUNTIME =
	"shotlyx-remotion-component-v1" as const;
export const SHOTLYX_HYPERFRAMES_RUNTIME =
	"shotlyx-hyperframes-overlay-v1" as const;

export type ShotlyxRemotionComponentRuntime =
	typeof SHOTLYX_REMOTION_COMPONENT_RUNTIME;
export type ShotlyxHyperFramesRuntime = typeof SHOTLYX_HYPERFRAMES_RUNTIME;
export type ShotlyxMGRuntime =
	| ShotlyxRemotionComponentRuntime
	| ShotlyxHyperFramesRuntime;

export type ShotlyxMGAspectRatio = "16:9" | "9:16" | "1:1";
export type ShotlyxHyperFramesTemplateId =
	| "swiss-pulse-explainer"
	| "kinetic-launch-type"
	| "data-drift-ai"
	| "editorial-spotlight";

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

export interface ShotlyxHyperFramesRenderSnapshot {
	status: "simulated" | "pending" | "rendered" | "error";
	format: "html-preview" | "webm" | "mp4";
	mediaAssetId?: string;
	previewHtml?: string;
	diagnostics: string[];
	updatedAt: string;
}

export interface ShotlyxHyperFramesDocument {
	version: 1;
	runtime: ShotlyxHyperFramesRuntime;
	name: string;
	durationSeconds: number;
	fps: number;
	width: number;
	height: number;
	aspectRatio: ShotlyxMGAspectRatio;
	transparentBackground?: boolean;
	templateId: ShotlyxHyperFramesTemplateId;
	designBrief: string;
	htmlSource: string;
	propsSchema: ShotlyxMGPropDefinition[];
	defaultProps: Record<string, ShotlyxMGPropValue>;
	sourcePrompt: string;
	thumbnailFrame?: number;
	thumbnailUrl?: string;
	render: ShotlyxHyperFramesRenderSnapshot;
}

export type ShotlyxMGDocument =
	| ShotlyxRemotionComponentDocument
	| ShotlyxHyperFramesDocument;

export interface ShotlyxRemotionMGAsset {
	id: string;
	type: "shotlyx-remotion-component";
	name: string;
	runtime: ShotlyxRemotionComponentRuntime;
	document: ShotlyxRemotionComponentDocument;
	sourcePrompt: string;
	createdAt: string;
	updatedAt: string;
}

export interface ShotlyxHyperFramesAsset {
	id: string;
	type: "shotlyx-hyperframes-overlay";
	name: string;
	runtime: ShotlyxHyperFramesRuntime;
	document: ShotlyxHyperFramesDocument;
	sourcePrompt: string;
	createdAt: string;
	updatedAt: string;
}

export type ShotlyxMGAsset = ShotlyxRemotionMGAsset | ShotlyxHyperFramesAsset;

export function isShotlyxRemotionMGAsset(
	asset: ShotlyxMGAsset,
): asset is ShotlyxRemotionMGAsset {
	return asset.runtime === SHOTLYX_REMOTION_COMPONENT_RUNTIME;
}

export function isShotlyxHyperFramesAsset(
	asset: ShotlyxMGAsset,
): asset is ShotlyxHyperFramesAsset {
	return asset.runtime === SHOTLYX_HYPERFRAMES_RUNTIME;
}
