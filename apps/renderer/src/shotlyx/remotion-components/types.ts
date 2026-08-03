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
export type ShotlyxMGPreferenceSource = "locked" | "derived" | "auto";
export type ShotlyxMGContentKind =
	| "title"
	| "metric"
	| "chart"
	| "process"
	| "comparison"
	| "callout"
	| "effect"
	| "general";

export interface ShotlyxMGVisualDNA {
	version: 1;
	summary: string;
	fingerprint: string;
	contentKind: ShotlyxMGContentKind;
	sources: {
		colors: ShotlyxMGPreferenceSource;
		typography: ShotlyxMGPreferenceSource;
		layout: ShotlyxMGPreferenceSource;
		motion: ShotlyxMGPreferenceSource;
	};
	composition: {
		focusX: number;
		focusY: number;
		asymmetry: number;
		density: number;
		safeMargin: number;
		decorationBudget: number;
	};
	colors: {
		primary: string;
		secondary: string;
		foreground: string;
		background: string;
		userLocked: string[];
	};
	typography: {
		fontFamilies: string[];
		contrast: number;
		maxLines: number;
		maxTextWidth: number;
	};
	motion: {
		energy: number;
		elasticity: number;
		continuity: number;
		entryShare: number;
		holdShare: number;
		exitShare: number;
		loop: boolean;
	};
	depth: {
		texture: number;
		shadow: number;
		glow: number;
	};
}

export interface ShotlyxMGMotionSpecElement {
	id: string;
	role: "hero" | "support" | "label" | "data" | "decoration";
	contentSource: "user" | "derived" | "none";
	priority: number;
	maxLines?: number;
	maxWidth?: number;
}

export interface ShotlyxMGMotionSpec {
	version: 1;
	textPolicy: "required" | "optional" | "forbidden";
	readingOrder: string[];
	elements: ShotlyxMGMotionSpecElement[];
	beats: Array<{
		id: string;
		label: string;
		start: number;
		end: number;
	}>;
	constraints: string[];
}

export interface ShotlyxMGQualityIssue {
	code: string;
	severity: "error" | "warning";
	message: string;
}

export interface ShotlyxMGQualityReport {
	status: "passed" | "needs-attention";
	reviewLevel: "local" | "vision";
	checkedFrames: number[];
	visibleTextProps: string[];
	issues: ShotlyxMGQualityIssue[];
	checkedAt: string;
	visionSummary?: string;
}
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
	visualDNA?: ShotlyxMGVisualDNA;
	motionSpec?: ShotlyxMGMotionSpec;
	quality?: ShotlyxMGQualityReport;
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
	shortId?: string;
	revision?: number;
	status?: "ready" | "needs-attention";
	sequenceId?: string;
	revisions?: Array<{
		revision: number;
		name: string;
		document: ShotlyxRemotionComponentDocument;
		createdAt: string;
	}>;
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
	asset: unknown,
): asset is ShotlyxRemotionMGAsset {
	return (
		typeof asset === "object" &&
		asset !== null &&
		Reflect.get(asset, "runtime") === SHOTLYX_REMOTION_COMPONENT_RUNTIME
	);
}

export function isShotlyxHyperFramesAsset(
	asset: unknown,
): asset is ShotlyxHyperFramesAsset {
	return (
		typeof asset === "object" &&
		asset !== null &&
		Reflect.get(asset, "runtime") === SHOTLYX_HYPERFRAMES_RUNTIME
	);
}
