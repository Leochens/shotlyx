import { generateText, type LanguageModel } from "ai";
import { transform } from "esbuild";
import * as ReactRuntime from "react";
import type { CSSProperties, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Easing, interpolate, spring } from "remotion";
import { z } from "zod";
import {
	buildStructuredGenerateTextRequest,
	type GenerateTextRequest,
	isStructuredOutputSchemaError,
} from "@/agent/ai-sdk/request-builder";
import { getDefaultModelBundle } from "@/agent/ai-sdk/providers";
import type { LLMProviderConfig } from "@/agent/llm/types";
import { generateUUID } from "@/utils/id";
import { buildRemotionSkillContext } from "./skill-context";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	type ShotlyxMGAspectRatio,
	type ShotlyxMGPropDefinition,
	type ShotlyxMGPropRole,
	type ShotlyxMGPropType,
	type ShotlyxMGPropValue,
	type ShotlyxRemotionComponentDocument,
	type ShotlyxRemotionComponentManifest,
} from "./types";
import {
	assertValidShotlyxRemotionComponentAssetDocument,
	validateShotlyxRemotionComponentDataContract,
} from "./validator";

const DEFAULT_FPS = 30;
const DEFAULT_DURATION_SECONDS = 6;
const MAX_OUTPUT_TOKENS = 12000;
const RENDER_VALIDATION_FRAME_COUNT = 4;
const GENERATED_PROP_TYPE_ALIASES: Record<string, ShotlyxMGPropType> = {
	array: "table",
	asset: "image",
	avatar: "image",
	bool: "boolean",
	boolean: "boolean",
	checkbox: "boolean",
	choice: "select",
	choices: "select",
	color: "color",
	colorhex: "color",
	colour: "color",
	copy: "text",
	data: "table",
	dataset: "table",
	double: "number",
	dropdown: "select",
	enum: "select",
	float: "number",
	font: "font",
	fontfamily: "font",
	hex: "color",
	hexcolor: "color",
	icon: "image",
	image: "image",
	imageurl: "image",
	img: "image",
	int: "number",
	integer: "number",
	label: "text",
	list: "table",
	logo: "image",
	media: "image",
	number: "number",
	numeric: "number",
	object: "table",
	option: "select",
	palette: "color",
	photo: "image",
	picture: "image",
	range: "number",
	record: "table",
	richtext: "text",
	rows: "table",
	select: "select",
	slider: "number",
	source: "image",
	src: "image",
	string: "text",
	switch: "boolean",
	text: "text",
	textarea: "text",
	title: "text",
	toggle: "boolean",
	typeface: "font",
	typography: "font",
	url: "image",
	zarray: "table",
	zboolean: "boolean",
	zenum: "select",
	znumber: "number",
	zobject: "table",
	zrecord: "table",
	zstring: "text",
};
const GENERATED_PROP_ROLE_ALIASES: Record<string, ShotlyxMGPropRole> = {
	animation: "motion",
	asset: "asset",
	assets: "asset",
	color: "style",
	colors: "style",
	content: "content",
	copy: "content",
	data: "data",
	dataset: "data",
	design: "style",
	font: "typography",
	fonts: "typography",
	image: "asset",
	images: "asset",
	layout: "style",
	media: "asset",
	motion: "motion",
	parameter: "style",
	parameters: "style",
	prop: "style",
	props: "style",
	style: "style",
	styling: "style",
	table: "data",
	text: "content",
	timing: "motion",
	type: "typography",
	typography: "typography",
	video: "asset",
	visual: "style",
	visuals: "style",
};

const generatedScalarValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
]);

const generatedPropValueSchema = z.union([
	generatedScalarValueSchema,
	z.array(z.array(generatedScalarValueSchema).max(40)).max(200),
]);

export const shotlyxRemotionGeneratedComponentSchema = z.object({
	name: z.string().min(1),
	durationSeconds: z.number().positive().max(120).nullable(),
	fps: z.number().positive().max(120).nullable(),
	width: z.number().positive().nullable(),
	height: z.number().positive().nullable(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]).nullable(),
	thumbnailFrame: z.number().int().nonnegative().nullable(),
	componentSource: z.string().min(1).max(30_000),
	propsSchema: z
		.array(
			z.object({
				key: z.string().min(1),
				label: z.string().min(1),
				type: z.enum([
					"text",
					"number",
					"color",
					"font",
					"boolean",
					"select",
					"image",
					"table",
				]),
				role: z.enum([
					"content",
					"style",
					"typography",
					"motion",
					"data",
					"asset",
				]),
				default: generatedPropValueSchema,
				min: z.number().nullable(),
				max: z.number().nullable(),
				step: z.number().nullable(),
				options: z
					.array(z.object({ label: z.string(), value: z.string() }))
					.nullable(),
				columns: z.array(z.string()).nullable(),
			}),
		)
		.min(1)
		.max(40),
});

type GeneratedComponent = z.infer<
	typeof shotlyxRemotionGeneratedComponentSchema
>;
type GeneratedPropDefinition = GeneratedComponent["propsSchema"][number];
type GeneratedTableRows = Array<
	Array<z.infer<typeof generatedScalarValueSchema>>
>;

export interface GenerateShotlyxMGComponentOptions {
	prompt: string;
	durationSeconds?: number;
	aspectRatio?: ShotlyxMGAspectRatio;
	styleGuide?: string;
	model?: LanguageModel;
	providerConfig?: LLMProviderConfig;
	generateTextFn?: typeof generateText;
	repairAttempts?: number;
	abortSignal?: AbortSignal;
	maxOutputTokens?: number;
	preferPlainJson?: boolean;
	transparentBackground?: boolean;
}

function canvasSizeForAspectRatio({
	aspectRatio,
}: {
	aspectRatio: ShotlyxMGAspectRatio;
}): { width: number; height: number } {
	if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
	if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
	return { width: 1920, height: 1080 };
}

function buildSystemPrompt({ skillContext }: { skillContext: string }): string {
	return [
		"You generate editable Shotlyx MG animations as real Remotion-compatible React components.",
		"Transparent-background MG is the default: generated graphics should be easy to overlay on top of existing video footage.",
		"Do not create full-canvas or decorative backgrounds unless the user explicitly asks for one.",
		"If any background/backdrop/canvas layer is necessary, expose it as propsSchema controls with a default of transparent, false, or zero opacity.",
		"Do not output a scene DSL, template name, storyboard, HTML document, CSS file, or SVG-only answer.",
		"The output component must be custom code that implements the user's requested effect.",
		"The componentSource must export default function ShotlyxComponent(props: Props).",
		"Do not include import statements. Use the provided global Remotion object instead.",
		"Allowed Remotion APIs are available both as Remotion.AbsoluteFill / Remotion.useCurrentFrame and as bare bindings: AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video.",
		"Prefer destructuring them at the top of ShotlyxComponent: const { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } = Remotion.",
		"Use React JSX normally. React is available globally during compilation/runtime.",
		"Every user-editable text, color, font, number, boolean, data array, and media reference must be declared in propsSchema with a useful default value.",
		"For image props, declare type image and render via props. Never invent relative filenames like 4-3.png or /image.png. Use an empty string default and render a designed fallback when the image prop is empty.",
		"For table props, declare columns and use default as an array of row arrays in the same column order. The runtime will convert them to row objects.",
		'For table row rendering, always read cells with the exact declared column key. Use bracket access like row["核心症状"] for non-English labels; never invent aliases such as row.symptom unless the column is literally named symptom.',
		"Never use fetch, XMLHttpRequest, WebSocket, eval, Function, document, window, localStorage, sessionStorage, indexedDB, require, or dynamic import.",
		"Animations must be deterministic from frame number and props. No randomness unless derived from deterministic props.",
		'Never use placeholder copy such as "标题", "标题强调", "Subtitle", "Focus here", "Lorem", or "Example". Extract concrete copy, numbers, and row data from the user request.',
		skillContext,
	].join("\n");
}

function buildUserPrompt({
	prompt,
	durationSeconds,
	aspectRatio,
	styleGuide,
	validationErrors,
	plainJson,
	transparentBackground,
}: {
	prompt: string;
	durationSeconds: number;
	aspectRatio: ShotlyxMGAspectRatio;
	styleGuide?: string;
	validationErrors?: string[];
	plainJson?: boolean;
	transparentBackground: boolean;
}): string {
	const size = canvasSizeForAspectRatio({ aspectRatio });
	return [
		`User request: ${prompt}`,
		`Duration: ${durationSeconds}s`,
		"Treat Duration as the real visible runtime for this component, not just an intro. If the main reveal finishes early, keep the design alive with subtle hold motion, pulsing highlights, cursor/scanline movement, counter shimmer, or a clean exit until the last frame. Do not leave the component blank or visually finished after the first second.",
		"If this is a short beat such as a quick arrow, circle, box, sticker pop, or word punch, it is acceptable to return a shorter durationSeconds that matches the action instead of padding dead time.",
		`Canvas: ${size.width}x${size.height}, aspect ${aspectRatio}, fps ${DEFAULT_FPS}`,
		`Background: ${transparentBackground ? "transparent" : "solid/custom"}`,
		transparentBackground
			? "Render as an overlay MG with a transparent root canvas. Default to no background. Do not set a full-canvas background color on AbsoluteFill, body, root containers, or nested position:absolute/inset:0 layers. Avoid black or dark full-screen backplates. Use local cards, pills, strokes, glows, or panels only where the design needs them. If you include any background/backdrop/canvas surface, make it editable through propsSchema and default it to transparent, disabled, or opacity 0."
			: "A full-canvas background is allowed when it improves the requested design.",
		styleGuide ? `Style guide: ${styleGuide}` : "",
		validationErrors?.length
			? `Previous output failed validation. Fix these errors:\n${validationErrors.join("\n")}`
			: "",
		plainJson
			? "Return only one valid JSON object. Do not use markdown fences, comments, or prose."
			: "Return one structured object with name, durationSeconds, fps, width, height, aspectRatio, thumbnailFrame, componentSource, propsSchema.",
		"Always include durationSeconds, fps, width, height, aspectRatio, and thumbnailFrame. Use null if a value should use the requested default.",
		"Choose thumbnailFrame as the representative frame for the asset cover: pick a frame where the animation content is visible and characteristic, not an empty intro frame.",
		"Every propsSchema item must include min, max, step, options, and columns. Use null when the field does not apply.",
		'Every propsSchema[].type must be exactly one of: "text", "number", "color", "font", "boolean", "select", "image", "table".',
		'Every propsSchema[].role must be exactly one of: "content", "style", "typography", "motion", "data", "asset".',
		"Do not return a separate defaults object. Put each editable default only in propsSchema[].default.",
		'For table defaults, return rows as arrays, for example [["2014", 1364], ["2023", 1410]], not objects.',
		'When rendering table rows, use the same column labels from propsSchema.columns, for example row["year"] and row["population"]. Chinese column labels must also be read by bracket syntax, for example row["病害名称"].',
		'Never use placeholder copy such as "标题", "标题强调", "Subtitle", "Focus here", "Lorem", or "Example"; all visible text and table data must come from the user request.',
		"For typewriter effects, implement real per-frame character reveal using useCurrentFrame(), not opacity-only fade.",
		"For charts or data animations, animate paths/bars/labels with frame-based interpolation.",
	]
		.filter(Boolean)
		.join("\n");
}

function stripDefaultExport({ source }: { source: string }): string {
	return source.replace(
		/export\s+default\s+function\s+ShotlyxComponent\b/,
		"function ShotlyxComponent",
	);
}

async function compileRemotionComponentModule({
	source,
}: {
	source: string;
}): Promise<string> {
	const wrappedSource = [
		"const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;",
		"const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;",
		"const { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video } = Remotion;",
		stripDefaultExport({ source }),
		"export default ShotlyxComponent;",
	].join("\n");
	const result = await transform(wrappedSource, {
		loader: "tsx",
		format: "esm",
		target: "es2020",
		jsx: "transform",
		jsxFactory: "React.createElement",
		jsxFragment: "React.Fragment",
	});
	return result.code;
}

function buildDataModuleUrl({ source }: { source: string }): string {
	return `data:text/javascript;base64,${Buffer.from(source, "utf8").toString(
		"base64",
	)}`;
}

function getRenderValidationFrames({
	durationInFrames,
	thumbnailFrame,
}: {
	durationInFrames: number;
	thumbnailFrame?: number;
}): number[] {
	const candidates = [
		0,
		Math.floor(durationInFrames * 0.25),
		thumbnailFrame ?? Math.floor(durationInFrames * 0.45),
		durationInFrames - 1,
	];
	return Array.from(
		new Set(
			candidates.map((frame) =>
				Math.max(0, Math.min(durationInFrames - 1, frame)),
			),
		),
	).slice(0, RENDER_VALIDATION_FRAME_COUNT);
}

function StubAbsoluteFill({
	children,
	style,
}: {
	children?: ReactNode;
	style?: CSSProperties;
}) {
	return ReactRuntime.createElement(
		"div",
		{
			style: {
				position: "absolute",
				inset: 0,
				width: "100%",
				height: "100%",
				...style,
			},
		},
		children,
	);
}

function StubSequence({ children }: { children?: ReactNode }) {
	return ReactRuntime.createElement(ReactRuntime.Fragment, null, children);
}

function StubImg({ src, style }: { src?: unknown; style?: CSSProperties }) {
	return ReactRuntime.createElement("img", {
		alt: "",
		src: typeof src === "string" && src ? src : undefined,
		style,
	});
}

function StubVideo({ src, style }: { src?: unknown; style?: CSSProperties }) {
	return ReactRuntime.createElement("video", {
		src: typeof src === "string" && src ? src : undefined,
		style,
	});
}

async function assertRenderableShotlyxRemotionComponent({
	document,
}: {
	document: ShotlyxRemotionComponentDocument;
}): Promise<void> {
	let currentFrame = 0;
	const previousRuntime = Reflect.get(
		globalThis,
		"__SHOTLYX_REMOTION_RUNTIME__",
	);
	try {
		Reflect.set(globalThis, "__SHOTLYX_REMOTION_RUNTIME__", {
			React: ReactRuntime,
			Remotion: {
				AbsoluteFill: StubAbsoluteFill,
				Sequence: StubSequence,
				useCurrentFrame: () => currentFrame,
				useVideoConfig: () => ({
					id: document.name,
					width: document.width,
					height: document.height,
					fps: document.fps,
					durationInFrames: Math.round(document.durationSeconds * document.fps),
					defaultProps: document.defaultProps,
					props: document.defaultProps,
				}),
				interpolate,
				spring,
				Easing,
				Img: StubImg,
				Video: StubVideo,
			},
		});
		const moduleUrl = buildDataModuleUrl({
			source: `${document.compiledModule}\n//# sourceURL=shotlyx-mg-render-validation-${document.manifest?.id ?? "component"}.mjs`,
		});
		const mod: unknown = await import(/* webpackIgnore: true */ moduleUrl);
		const Component =
			typeof mod === "object" && mod !== null
				? Reflect.get(mod, "default")
				: null;
		if (typeof Component !== "function") {
			throw new Error("compiled module default export is not a component");
		}
		const durationInFrames = Math.max(
			1,
			Math.round(document.durationSeconds * document.fps),
		);
		for (const frame of getRenderValidationFrames({
			durationInFrames,
			thumbnailFrame: document.thumbnailFrame,
		})) {
			currentFrame = frame;
			renderToStaticMarkup(
				ReactRuntime.createElement(Component, document.defaultProps),
			);
		}
	} catch (error) {
		throw new Error(
			`Render validation failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	} finally {
		if (previousRuntime === undefined) {
			Reflect.deleteProperty(globalThis, "__SHOTLYX_REMOTION_RUNTIME__");
		} else {
			Reflect.set(globalThis, "__SHOTLYX_REMOTION_RUNTIME__", previousRuntime);
		}
	}
}

function isGeneratedTableRows(
	value: GeneratedPropDefinition["default"],
): value is GeneratedTableRows {
	return Array.isArray(value) && value.every((row) => Array.isArray(row));
}

function normalizeGeneratedTableDefault({
	columns,
	rows,
}: {
	columns: string[] | null | undefined;
	rows: GeneratedTableRows;
}): Array<Record<string, string | number | boolean>> {
	const normalizedColumns =
		columns && columns.length > 0
			? columns
			: (rows[0] ?? []).map((_, index) => `column${index + 1}`);
	return rows.map((row) =>
		Object.fromEntries(
			normalizedColumns.map((column, index) => [column, row[index] ?? ""]),
		),
	);
}

function normalizeGeneratedPropDefault({
	prop,
	transparentBackground,
}: {
	prop: GeneratedPropDefinition;
	transparentBackground: boolean;
}): ShotlyxMGPropValue {
	if (prop.type === "table") {
		if (!isGeneratedTableRows(prop.default)) {
			return [];
		}
		return normalizeGeneratedTableDefault({
			columns: prop.columns,
			rows: prop.default,
		});
	}
	if (Array.isArray(prop.default)) {
		return "";
	}
	if (
		transparentBackground &&
		prop.type === "color" &&
		isBackgroundColorProp({ prop })
	) {
		return "transparent";
	}
	return prop.default;
}

function isBackgroundColorProp({
	prop,
}: {
	prop: Pick<GeneratedPropDefinition, "key" | "label">;
}): boolean {
	const text = `${prop.key} ${prop.label}`.toLowerCase();
	return (
		text.includes("background") ||
		text.includes("backdrop") ||
		text.includes("canvas") ||
		/\bbg\b/.test(text)
	);
}

function normalizeGeneratedPropsSchema({
	propsSchema,
	transparentBackground,
}: {
	propsSchema: GeneratedComponent["propsSchema"];
	transparentBackground: boolean;
}): ShotlyxMGPropDefinition[] {
	return propsSchema.map((prop) => {
		const normalized: ShotlyxMGPropDefinition = {
			key: prop.key,
			label: prop.label,
			type: prop.type,
			role: prop.role,
			default: normalizeGeneratedPropDefault({ prop, transparentBackground }),
		};
		if (prop.min !== null) normalized.min = prop.min;
		if (prop.max !== null) normalized.max = prop.max;
		if (prop.step !== null) normalized.step = prop.step;
		if (prop.options !== null) normalized.options = prop.options;
		if (prop.columns !== null) normalized.columns = prop.columns;
		return normalized;
	});
}

function buildDefaultPropsFromSchema({
	propsSchema,
}: {
	propsSchema: ShotlyxMGPropDefinition[];
}): Record<string, ShotlyxMGPropValue> {
	return Object.fromEntries(
		propsSchema.map((prop) => [prop.key, prop.default]),
	);
}

function assertUniqueGeneratedPropKeys({
	propsSchema,
}: {
	propsSchema: ShotlyxMGPropDefinition[];
}): void {
	const seenPropKeys = new Set<string>();
	for (const prop of propsSchema) {
		if (seenPropKeys.has(prop.key)) {
			throw new Error(`propsSchema duplicate key "${prop.key}"`);
		}
		seenPropKeys.add(prop.key);
	}
}

function buildManifest({
	id,
	document,
}: {
	id: string;
	document: Omit<ShotlyxRemotionComponentDocument, "manifest">;
}): ShotlyxRemotionComponentManifest {
	return {
		id,
		version: 1,
		runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
		name: document.name,
		durationSeconds: document.durationSeconds,
		durationInFrames: Math.round(document.durationSeconds * document.fps),
		fps: document.fps,
		width: document.width,
		height: document.height,
		aspectRatio: document.aspectRatio,
		transparentBackground: document.transparentBackground,
		entry: "component.tsx",
		propsSchemaPath: "props.schema.json",
		defaultPropsPath: "props.default.json",
		thumbnailPath: "thumbnail.png",
		sourcePrompt: document.sourcePrompt,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAliasToken(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^z\./, "z")
		.replace(/\(\)$/, "")
		.replace(/[^a-z0-9]+/g, "");
	return normalized || undefined;
}

function isShotlyxPropTypeToken(token: string): token is ShotlyxMGPropType {
	switch (token) {
		case "text":
		case "number":
		case "color":
		case "font":
		case "boolean":
		case "select":
		case "image":
		case "table":
			return true;
		default:
			return false;
	}
}

function isShotlyxPropRoleToken(token: string): token is ShotlyxMGPropRole {
	switch (token) {
		case "content":
		case "style":
		case "typography":
		case "motion":
		case "data":
		case "asset":
			return true;
		default:
			return false;
	}
}

function textIncludesAny({
	text,
	terms,
}: {
	text: string;
	terms: string[];
}): boolean {
	return terms.some((term) => text.includes(term));
}

function propContextText({
	key,
	label,
	type,
	role,
}: {
	key: unknown;
	label: unknown;
	type?: unknown;
	role?: unknown;
}): string {
	return [key, label, type, role]
		.filter((value): value is string => typeof value === "string")
		.join(" ")
		.toLowerCase();
}

function isColorLikeProp({
	key,
	label,
	defaultValue,
}: {
	key: unknown;
	label: unknown;
	defaultValue: unknown;
}): boolean {
	const text = propContextText({ key, label });
	return (
		textIncludesAny({
			text,
			terms: ["color", "colour", "accent", "background", "backdrop", "fill"],
		}) ||
		(typeof defaultValue === "string" &&
			/^(?:#(?:[0-9a-f]{3,8})|rgba?\(|hsla?\()/i.test(defaultValue.trim()))
	);
}

function isImageLikeProp({
	key,
	label,
	type,
	role,
}: {
	key: unknown;
	label: unknown;
	type?: unknown;
	role?: unknown;
}): boolean {
	return textIncludesAny({
		text: propContextText({ key, label, type, role }),
		terms: [
			"asset",
			"avatar",
			"icon",
			"image",
			"img",
			"logo",
			"media",
			"photo",
			"picture",
			"src",
			"url",
		],
	});
}

function isMotionLikeProp({
	key,
	label,
	role,
}: {
	key: unknown;
	label: unknown;
	role?: unknown;
}): boolean {
	return textIncludesAny({
		text: propContextText({ key, label, role }),
		terms: [
			"animation",
			"delay",
			"duration",
			"easing",
			"motion",
			"speed",
			"spring",
			"stagger",
			"timing",
		],
	});
}

function isTypographyLikeProp({
	key,
	label,
	role,
}: {
	key: unknown;
	label: unknown;
	role?: unknown;
}): boolean {
	return textIncludesAny({
		text: propContextText({ key, label, role }),
		terms: ["font", "typeface", "typography"],
	});
}

function normalizeGeneratedPropTypeAlias({
	key,
	label,
	type,
	role,
	defaultValue,
	columns,
}: {
	key: unknown;
	label: unknown;
	type: unknown;
	role: unknown;
	defaultValue: unknown;
	columns: unknown;
}): ShotlyxMGPropType {
	if (
		Array.isArray(columns) ||
		(Array.isArray(defaultValue) &&
			defaultValue.some((row) => Array.isArray(row)))
	) {
		return "table";
	}

	const token = normalizeAliasToken(type);
	const aliased = token
		? (GENERATED_PROP_TYPE_ALIASES[token] ??
			(isShotlyxPropTypeToken(token) ? token : undefined))
		: undefined;
	if (aliased && aliased !== "text") return aliased;
	if (aliased === "text" && isImageLikeProp({ key, label, type, role })) {
		return "image";
	}
	if (aliased === "text" && isColorLikeProp({ key, label, defaultValue })) {
		return "color";
	}
	if (aliased === "text" && isTypographyLikeProp({ key, label, role })) {
		return "font";
	}
	if (aliased) return aliased;

	if (isImageLikeProp({ key, label, type, role })) return "image";
	if (isColorLikeProp({ key, label, defaultValue })) return "color";
	if (isTypographyLikeProp({ key, label, role })) return "font";
	if (typeof defaultValue === "number") return "number";
	if (typeof defaultValue === "boolean") return "boolean";
	return "text";
}

function normalizeGeneratedPropRoleAlias({
	key,
	label,
	role,
	type,
}: {
	key: unknown;
	label: unknown;
	role: unknown;
	type: ShotlyxMGPropType;
}): ShotlyxMGPropRole {
	const token = normalizeAliasToken(role);
	const aliased = token
		? (GENERATED_PROP_ROLE_ALIASES[token] ??
			(isShotlyxPropRoleToken(token) ? token : undefined))
		: undefined;
	if (aliased) return aliased;
	if (type === "table") return "data";
	if (type === "image") return "asset";
	if (type === "font") return "typography";
	if (isMotionLikeProp({ key, label, role })) return "motion";
	if (type === "color" || type === "select" || type === "boolean") {
		return "style";
	}
	return "content";
}

function humanizePropKey({ key }: { key: string }): string {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim();
	if (!spaced) return "Property";
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeColumnLabel({
	value,
	index,
}: {
	value: unknown;
	index: number;
}): string {
	if (typeof value === "string" && value.trim()) {
		return value.trim();
	}
	if (isRecord(value)) {
		for (const key of ["key", "value", "label", "name"]) {
			const candidate = value[key];
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate.trim();
			}
		}
	}
	return `Column ${index + 1}`;
}

function normalizeRawGeneratedComponent(value: unknown): unknown {
	if (!isRecord(value)) return value;
	const normalized: Record<string, unknown> = { ...value };
	for (const key of [
		"durationSeconds",
		"fps",
		"width",
		"height",
		"aspectRatio",
		"thumbnailFrame",
	]) {
		if (!(key in normalized)) normalized[key] = null;
	}
	if (Array.isArray(normalized.propsSchema)) {
		normalized.propsSchema = normalized.propsSchema.map((prop) => {
			if (!isRecord(prop)) return prop;
			const propKey =
				typeof prop.key === "string" && prop.key.trim()
					? prop.key.trim()
					: prop.key;
			const propLabel =
				typeof prop.label === "string" && prop.label.trim()
					? prop.label.trim()
					: typeof propKey === "string"
						? humanizePropKey({ key: propKey })
						: prop.label;
			const columns = Array.isArray(prop.columns)
				? prop.columns.map((column, index) =>
						normalizeColumnLabel({ value: column, index }),
					)
				: null;
			const propType = normalizeGeneratedPropTypeAlias({
				key: propKey,
				label: propLabel,
				type: prop.type,
				role: prop.role,
				defaultValue: prop.default,
				columns,
			});
			return {
				...prop,
				key: propKey,
				label: propLabel,
				type: propType,
				role: normalizeGeneratedPropRoleAlias({
					key: propKey,
					label: propLabel,
					role: prop.role,
					type: propType,
				}),
				min: "min" in prop ? prop.min : null,
				max: "max" in prop ? prop.max : null,
				step: "step" in prop ? prop.step : null,
				options: "options" in prop ? prop.options : null,
				columns,
			};
		});
	}
	return normalized;
}

function parseGeneratedComponent(value: unknown): GeneratedComponent {
	const result = shotlyxRemotionGeneratedComponentSchema.safeParse(
		normalizeRawGeneratedComponent(value),
	);
	if (!result.success) {
		throw new Error(
			`模型返回的 Remotion JSON 不符合 Shotlyx schema：${result.error.issues
				.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
				.join("; ")}`,
		);
	}
	return result.data;
}

function parseJsonObjectFromText({ text }: { text: string }): unknown {
	const trimmed = text.trim();
	if (!trimmed) {
		throw new Error("No output generated.");
	}
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	const candidate = fenced?.[1] ?? trimmed;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start < 0 || end < start) {
		throw new Error("模型没有返回可解析的 JSON 对象");
	}
	return JSON.parse(candidate.slice(start, end + 1));
}

function textFromGenerateTextResult(result: unknown): string {
	if (isRecord(result) && typeof result.text === "string") {
		return result.text;
	}
	if (isRecord(result) && typeof result.output === "string") {
		return result.output;
	}
	throw new Error("No output generated.");
}

export async function generateShotlyxMGComponentDocument({
	prompt,
	durationSeconds = DEFAULT_DURATION_SECONDS,
	aspectRatio = "16:9",
	styleGuide,
	model,
	providerConfig,
	generateTextFn = generateText,
	repairAttempts = 1,
	abortSignal,
	maxOutputTokens = MAX_OUTPUT_TOKENS,
	preferPlainJson = false,
	transparentBackground = true,
}: GenerateShotlyxMGComponentOptions): Promise<ShotlyxRemotionComponentDocument> {
	const defaultBundle = model ? undefined : getDefaultModelBundle();
	const selectedModel = model ?? defaultBundle?.model;
	if (!selectedModel) {
		throw new Error("configuration_error: missing LLM model");
	}
	const selectedProviderConfig = providerConfig ?? defaultBundle?.config;
	const requestedDuration = Math.max(0.1, Math.min(durationSeconds, 120));
	const requestedSize = canvasSizeForAspectRatio({ aspectRatio });
	let validationErrors: string[] | undefined;
	let lastError: unknown;
	let usePlainJson = preferPlainJson;
	let attempt = 0;
	const skillContext = buildRemotionSkillContext({
		prompt,
		styleGuide,
	});

	while (attempt <= repairAttempts) {
		try {
			const baseRequest: GenerateTextRequest = {
				model: selectedModel,
				system: buildSystemPrompt({ skillContext }),
				prompt: buildUserPrompt({
					prompt,
					durationSeconds: requestedDuration,
					aspectRatio,
					styleGuide,
					validationErrors,
					plainJson: usePlainJson,
					transparentBackground,
				}),
				maxOutputTokens,
				abortSignal,
			};
			const structuredRequest = buildStructuredGenerateTextRequest({
				baseRequest,
				config: selectedProviderConfig,
				outputName: "ShotlyxRemotionComponent",
				outputDescription:
					"One editable Remotion-compatible React component asset.",
				schema: shotlyxRemotionGeneratedComponentSchema,
				preferPlainJson: usePlainJson,
			});
			const generated =
				structuredRequest.mode === "plain-json"
					? parseGeneratedComponent(
							parseJsonObjectFromText({
								text: textFromGenerateTextResult(
									await generateTextFn(structuredRequest.request),
								),
							}),
						)
					: parseGeneratedComponent(
							(await generateTextFn(structuredRequest.request)).output,
						);
			const normalizedDuration = generated.durationSeconds ?? requestedDuration;
			const fps = generated.fps ?? DEFAULT_FPS;
			const width = generated.width ?? requestedSize.width;
			const height = generated.height ?? requestedSize.height;
			const normalizedAspectRatio = generated.aspectRatio ?? aspectRatio;
			const durationInFrames = Math.max(
				1,
				Math.round(normalizedDuration * fps),
			);
			const thumbnailFrame =
				generated.thumbnailFrame === null
					? Math.floor(durationInFrames * 0.45)
					: Math.min(durationInFrames - 1, generated.thumbnailFrame);
			const propsSchema = normalizeGeneratedPropsSchema({
				propsSchema: generated.propsSchema,
				transparentBackground,
			});
			assertUniqueGeneratedPropKeys({ propsSchema });
			const defaultProps = buildDefaultPropsFromSchema({
				propsSchema,
			});
			const compiledModule = await compileRemotionComponentModule({
				source: generated.componentSource,
			});
			const withoutManifest = {
				version: 1 as const,
				runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
				name: generated.name,
				durationSeconds: normalizedDuration,
				fps,
				width,
				height,
				aspectRatio: normalizedAspectRatio,
				transparentBackground,
				componentSource: generated.componentSource,
				compiledModule,
				propsSchema,
				defaultProps,
				sourcePrompt: prompt,
				thumbnailFrame,
			};
			const document: ShotlyxRemotionComponentDocument = {
				...withoutManifest,
				manifest: buildManifest({
					id: generateUUID(),
					document: withoutManifest,
				}),
			};
			assertValidShotlyxRemotionComponentAssetDocument(document);
			const dataContractValidation =
				validateShotlyxRemotionComponentDataContract({
					source: document.componentSource,
					propsSchema: document.propsSchema,
				});
			if (!dataContractValidation.valid) {
				throw new Error(
					`Invalid Shotlyx Remotion component data contract: ${dataContractValidation.errors.join(
						"; ",
					)}`,
				);
			}
			await assertRenderableShotlyxRemotionComponent({ document });
			return document;
		} catch (error) {
			lastError = error;
			validationErrors = [
				error instanceof Error ? error.message : String(error),
			];
			if (!usePlainJson && isStructuredOutputSchemaError(error)) {
				usePlainJson = true;
				validationErrors = [
					`结构化输出 schema 被 provider 拒绝，已切换为普通 JSON 生成模式继续重试：${validationErrors[0]}`,
				];
				continue;
			}
			attempt += 1;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Shotlyx Remotion component generation failed");
}
