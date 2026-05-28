import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
	isStructuredOutputValueError,
	resolveStructuredGenerationMode,
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
let renderValidationQueue: Promise<void> = Promise.resolve();
const RUNTIME_REMOTION_BINDING_NAMES = [
	"AbsoluteFill",
	"Sequence",
	"useCurrentFrame",
	"useVideoConfig",
	"interpolate",
	"spring",
	"Easing",
	"Img",
	"Video",
] as const;
const RUNTIME_REMOTION_BINDING_NAME_SET = new Set<string>(
	RUNTIME_REMOTION_BINDING_NAMES,
);
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

export interface CreateShotlyxRemotionComponentDocumentOptions {
	name: string;
	componentSource: string;
	propsSchema: ShotlyxMGPropDefinition[];
	sourcePrompt: string;
	durationSeconds: number;
	aspectRatio: ShotlyxMGAspectRatio;
	fps?: number;
	width?: number;
	height?: number;
	thumbnailFrame?: number;
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
		"Do not include import statements. Do not redeclare or destructure Remotion APIs at module scope.",
		"Allowed Remotion APIs are injected by the Shotlyx runtime as bare bindings: AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video.",
		"Use those bare bindings directly, or call Remotion.AbsoluteFill / Remotion.useCurrentFrame inside ShotlyxComponent when needed.",
		"Use React JSX normally. React is available globally during compilation/runtime.",
		"Every user-editable text, color, font, number, boolean, data array, and media reference must be declared in propsSchema with a useful default value.",
		"For image props, declare type image and render via props. Never invent relative filenames like 4-3.png or /image.png. Use an empty string default and render a designed fallback when the image prop is empty.",
		"For table props, declare columns and use default as an array of row arrays in the same column order. The runtime will convert them to row objects.",
		'For table row rendering, always read cells with the exact declared column key. Use bracket access like row["核心症状"] for non-English labels; never invent aliases such as row.symptom unless the column is literally named symptom.',
		"Never use fetch, XMLHttpRequest, WebSocket, eval, Function, document, window, localStorage, sessionStorage, indexedDB, require, or dynamic import.",
		"Never use Node.js or CommonJS globals such as __filename, __dirname, process, Buffer, module, exports, or import.meta.",
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
			? "Return only one valid JSON object. Do not use markdown fences, comments, or prose. For custom TSX effects, use componentSourceLines: an array of code lines, instead of componentSource. Do not put raw multiline TSX inside componentSource."
			: "Return one structured object with name, durationSeconds, fps, width, height, aspectRatio, thumbnailFrame, componentSource, propsSchema.",
		plainJson
			? "Plain JSON may include either componentSourceLines or componentSource, but componentSourceLines is required for long or complex TSX. Every componentSourceLines item must be one valid JSON string line, and the server will join the lines with newline characters."
			: "",
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

function updateSourceBraceDepth({
	depth,
	line,
}: {
	depth: number;
	line: string;
}): number {
	let nextDepth = depth;
	for (const char of line) {
		if (char === "{") {
			nextDepth += 1;
		} else if (char === "}") {
			nextDepth = Math.max(0, nextDepth - 1);
		}
	}
	return nextDepth;
}

function normalizeTopLevelRemotionDestructuring({
	line,
}: {
	line: string;
}): string | null {
	const match = line.match(
		/^(\s*)(?:const|let|var)\s*\{\s*([^}]+)\s*\}\s*=\s*Remotion\s*;?\s*$/,
	);
	if (!match) return null;
	const indent = match[1] ?? "";
	const members = (match[2] ?? "")
		.split(",")
		.map((member) => member.trim())
		.filter(Boolean);
	if (!members.length) return null;
	const keptMembers: string[] = [];
	let removedRuntimeBinding = false;
	for (const member of members) {
		if (member.startsWith("...") || member.includes(":")) {
			keptMembers.push(member);
			continue;
		}
		const bindingName = member.replace(/\s*=.*$/, "").trim();
		if (
			RUNTIME_REMOTION_BINDING_NAME_SET.has(bindingName) &&
			/^[A-Za-z_$][\w$]*$/.test(bindingName)
		) {
			removedRuntimeBinding = true;
			continue;
		}
		keptMembers.push(member);
	}
	if (!removedRuntimeBinding) return line;
	if (!keptMembers.length) return "";
	return `${indent}const { ${keptMembers.join(", ")} } = Remotion;`;
}

function isTopLevelDuplicateRemotionAlias({ line }: { line: string }): boolean {
	const match = line.match(
		/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*Remotion\.([A-Za-z_$][\w$]*)\s*;?\s*$/,
	);
	if (!match) return false;
	const localName = match[1];
	const remotionName = match[2];
	return (
		localName === remotionName &&
		RUNTIME_REMOTION_BINDING_NAME_SET.has(localName)
	);
}

function normalizeGeneratedComponentSource({ source }: { source: string }): string {
	const normalizedLines: string[] = [];
	let braceDepth = 0;
	let skippingImportDeclaration = false;
	for (const line of source.split("\n")) {
		const trimmedLine = line.trim();
		if (skippingImportDeclaration) {
			if (trimmedLine.endsWith(";")) {
				skippingImportDeclaration = false;
			}
			continue;
		}
		if (braceDepth === 0 && /^\s*import\b/.test(line)) {
			if (!trimmedLine.endsWith(";")) {
				skippingImportDeclaration = true;
			}
			continue;
		}
		if (braceDepth === 0) {
			const normalizedDestructuringLine =
				normalizeTopLevelRemotionDestructuring({ line });
			if (normalizedDestructuringLine !== null) {
				if (normalizedDestructuringLine) {
					normalizedLines.push(normalizedDestructuringLine);
					braceDepth = updateSourceBraceDepth({
						depth: braceDepth,
						line: normalizedDestructuringLine,
					});
				}
				continue;
			}
			if (isTopLevelDuplicateRemotionAlias({ line })) {
				continue;
			}
		}
		normalizedLines.push(line);
		braceDepth = updateSourceBraceDepth({ depth: braceDepth, line });
	}
	return normalizedLines.join("\n").trim();
}

async function compileRemotionComponentModule({
	source,
}: {
	source: string;
}): Promise<string> {
	const normalizedSource = normalizeGeneratedComponentSource({ source });
	const wrappedSource = [
		"const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;",
		"const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;",
		"const { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video } = Remotion;",
		stripDefaultExport({ source: normalizedSource }),
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

async function importModuleFromSource({
	source,
	id,
}: {
	source: string;
	id: string;
}): Promise<unknown> {
	const tempDir = await mkdtemp(join(tmpdir(), "shotlyx-mg-validation-"));
	const filePath = join(tempDir, `${id}.mjs`);
	try {
		await writeFile(filePath, source, "utf8");
		return await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
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
	const previousQueue = renderValidationQueue;
	let releaseValidation = () => {};
	renderValidationQueue = new Promise((resolve) => {
		releaseValidation = resolve;
	});
	await previousQueue;
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
		const mod = await importModuleFromSource({
			source: document.compiledModule,
			id: `shotlyx-mg-render-validation-${document.manifest?.id ?? "component"}`,
		});
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
		releaseValidation();
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

export async function createShotlyxRemotionComponentDocument({
	name,
	componentSource,
	propsSchema,
	sourcePrompt,
	durationSeconds,
	aspectRatio,
	fps = DEFAULT_FPS,
	width,
	height,
	thumbnailFrame,
	transparentBackground = true,
}: CreateShotlyxRemotionComponentDocumentOptions): Promise<ShotlyxRemotionComponentDocument> {
	const requestedSize = canvasSizeForAspectRatio({ aspectRatio });
	const resolvedWidth = width ?? requestedSize.width;
	const resolvedHeight = height ?? requestedSize.height;
	const durationInFrames = Math.max(1, Math.round(durationSeconds * fps));
	const resolvedThumbnailFrame =
		thumbnailFrame === undefined
			? Math.floor(durationInFrames * 0.45)
			: Math.max(0, Math.min(durationInFrames - 1, thumbnailFrame));
	assertUniqueGeneratedPropKeys({ propsSchema });
	const defaultProps = buildDefaultPropsFromSchema({
		propsSchema,
	});
	const normalizedComponentSource = normalizeGeneratedComponentSource({
		source: componentSource,
	});
	const compiledModule = await compileRemotionComponentModule({
		source: normalizedComponentSource,
	});
	const withoutManifest = {
		version: 1 as const,
		runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
		name,
		durationSeconds,
		fps,
		width: resolvedWidth,
		height: resolvedHeight,
		aspectRatio,
		transparentBackground,
		componentSource: normalizedComponentSource,
		compiledModule,
		propsSchema,
		defaultProps,
		sourcePrompt,
		thumbnailFrame: resolvedThumbnailFrame,
	};
	const document: ShotlyxRemotionComponentDocument = {
		...withoutManifest,
		manifest: buildManifest({
			id: generateUUID(),
			document: withoutManifest,
		}),
	};
	assertValidShotlyxRemotionComponentAssetDocument(document);
	const dataContractValidation = validateShotlyxRemotionComponentDataContract({
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

function normalizeComponentSourceFromRaw({
	normalized,
}: {
	normalized: Record<string, unknown>;
}): void {
	const rawSource = normalized.componentSource;
	if (Array.isArray(rawSource) && rawSource.every((line) => typeof line === "string")) {
		normalized.componentSource = rawSource.join("\n");
		return;
	}
	if (typeof rawSource === "string" && rawSource.trim()) return;
	for (const key of ["componentSourceLines", "sourceLines"]) {
		const lines = normalized[key];
		if (Array.isArray(lines) && lines.every((line) => typeof line === "string")) {
			normalized.componentSource = lines.join("\n");
			return;
		}
	}
}

function camelCasePropKey({ value }: { value: string }): string | null {
	const tokens = value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	if (tokens.length === 0) return null;
	const [first, ...rest] = tokens;
	if (!first) return null;
	return [
		first.charAt(0).toLowerCase() + first.slice(1),
		...rest.map((token) => token.charAt(0).toUpperCase() + token.slice(1)),
	].join("");
}

function normalizeGeneratedPropKey({
	key,
	label,
	index,
}: {
	key: unknown;
	label: unknown;
	index: number;
}): string {
	if (typeof key === "string" && key.trim()) {
		return key.trim();
	}
	if (isRecord(key)) {
		for (const field of ["key", "value", "label", "name"]) {
			const candidate = key[field];
			if (typeof candidate === "string" && candidate.trim()) {
				return candidate.trim();
			}
		}
	}
	if (typeof label === "string" && label.trim()) {
		const fromLabel = camelCasePropKey({ value: label });
		if (fromLabel) return fromLabel;
	}
	return `prop${index + 1}`;
}

function hasExplicitGeneratedPropKey({ key }: { key: unknown }): boolean {
	if (typeof key === "string") return key.trim().length > 0;
	if (!isRecord(key)) return false;
	return ["key", "value", "label", "name"].some((field) => {
		const candidate = key[field];
		return typeof candidate === "string" && candidate.trim().length > 0;
	});
}

function makeUniquePropKey({
	key,
	seenKeys,
}: {
	key: string;
	seenKeys: Set<string>;
}): string {
	if (!seenKeys.has(key)) {
		seenKeys.add(key);
		return key;
	}
	let suffix = 2;
	while (seenKeys.has(`${key}${suffix}`)) {
		suffix += 1;
	}
	const uniqueKey = `${key}${suffix}`;
	seenKeys.add(uniqueKey);
	return uniqueKey;
}

function normalizeRawGeneratedComponent(value: unknown): unknown {
	if (!isRecord(value)) return value;
	const normalized: Record<string, unknown> = { ...value };
	normalizeComponentSourceFromRaw({ normalized });
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
		const seenPropKeys = new Set<string>();
		normalized.propsSchema = normalized.propsSchema.map((prop, index) => {
			if (!isRecord(prop)) return prop;
			const normalizedPropKey = normalizeGeneratedPropKey({
				key: prop.key,
				label: prop.label,
				index,
			});
			const propKey = hasExplicitGeneratedPropKey({ key: prop.key })
				? normalizedPropKey
				: makeUniquePropKey({
						key: normalizedPropKey,
						seenKeys: seenPropKeys,
					});
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
	const jsonText = candidate.slice(start, end + 1);
	try {
		return JSON.parse(jsonText);
	} catch (error) {
		throw new Error(
			buildPlainJsonParseErrorMessage({
				jsonText,
				error,
			}),
		);
	}
}

function buildPlainJsonParseErrorMessage({
	jsonText,
	error,
}: {
	jsonText: string;
	error: unknown;
}): string {
	const rawMessage = error instanceof Error ? error.message : String(error);
	const positionMatch = rawMessage.match(/position\s+(\d+)/i);
	const position = positionMatch ? Number(positionMatch[1]) : NaN;
	const excerpt = Number.isFinite(position)
		? jsonText.slice(
				Math.max(0, position - 160),
				Math.min(jsonText.length, position + 160),
			)
		: jsonText.slice(0, 320);
	return [
		`模型返回的 Remotion JSON 解析失败：${rawMessage}。`,
		"常见原因是 componentSource 里的 JSX、换行或双引号没有按 JSON 字符串转义，或者模型输出被截断。",
		"优先使用 componentSourceLines 字符串数组逐行输出 TSX；如果必须使用 componentSource，请按 JSON.stringify 的语义转义：换行写成 \\n，双引号写成 \\\"，不要把多行代码直接粘进 JSON 字符串。",
		`JSON 输出长度：${jsonText.length}。`,
		`错误附近片段：${excerpt}`,
	].join(" ");
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
			const structuredMode = resolveStructuredGenerationMode({
				config: selectedProviderConfig,
				preferPlainJson: usePlainJson,
			});
			const plainJsonRequest = structuredMode === "plain-json";
			const baseRequest: GenerateTextRequest = {
				model: selectedModel,
				system: buildSystemPrompt({ skillContext }),
				prompt: buildUserPrompt({
					prompt,
					durationSeconds: requestedDuration,
					aspectRatio,
					styleGuide,
					validationErrors,
					plainJson: plainJsonRequest,
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
				preferPlainJson: plainJsonRequest,
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
				return await createShotlyxRemotionComponentDocument({
					name: generated.name,
					durationSeconds: normalizedDuration,
					fps,
					width,
					height,
					aspectRatio: normalizedAspectRatio,
					transparentBackground,
					componentSource: generated.componentSource,
					propsSchema,
					sourcePrompt: prompt,
					thumbnailFrame,
				});
			} catch (error) {
				lastError = error;
				validationErrors = [
					error instanceof Error ? error.message : String(error),
				];
			if (
				!usePlainJson &&
				(isStructuredOutputSchemaError(error) ||
					isStructuredOutputValueError(error))
			) {
				usePlainJson = true;
				validationErrors = [
					`结构化输出不可用，已切换为普通 JSON 生成模式继续重试：${validationErrors[0]}`,
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
