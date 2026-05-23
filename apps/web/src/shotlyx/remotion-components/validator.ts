import { z } from "zod";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	type ShotlyxMGPropDefinition,
	type ShotlyxRemotionComponentDocument,
} from "./types";

const propValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
]);

export const shotlyxRemotionComponentDocumentSchema = z.object({
	version: z.literal(1),
	runtime: z.literal(SHOTLYX_REMOTION_COMPONENT_RUNTIME),
	name: z.string().min(1),
	durationSeconds: z.number().positive().max(120),
	fps: z.number().positive().max(120),
	width: z.number().positive(),
	height: z.number().positive(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
	transparentBackground: z.boolean().optional(),
	componentSource: z.string().min(1).max(30_000),
	compiledModule: z.string().min(1).max(120_000),
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
				default: propValueSchema,
				min: z.number().optional(),
				max: z.number().optional(),
				step: z.number().optional(),
				options: z
					.array(z.object({ label: z.string(), value: z.string() }))
					.optional(),
				columns: z.array(z.string()).optional(),
			}),
		)
		.min(1)
		.max(40),
	defaultProps: z.record(z.string(), propValueSchema),
	sourcePrompt: z.string(),
	thumbnailFrame: z.number().int().nonnegative().optional(),
	thumbnailUrl: z.string().optional(),
	manifest: z.unknown().optional(),
});

const FORBIDDEN_SOURCE_PATTERNS: Array<{
	pattern: RegExp;
	label: string;
}> = [
	{ pattern: /\bfetch\s*\(/, label: "fetch" },
	{ pattern: /\bXMLHttpRequest\b/, label: "XMLHttpRequest" },
	{ pattern: /\bWebSocket\b/, label: "WebSocket" },
	{ pattern: /\blocalStorage\b/, label: "localStorage" },
	{ pattern: /\bsessionStorage\b/, label: "sessionStorage" },
	{ pattern: /\bindexedDB\b/, label: "indexedDB" },
	{ pattern: /\bdocument\b/, label: "document" },
	{ pattern: /\bwindow\b/, label: "window" },
	{ pattern: /\bglobalThis\b/, label: "globalThis" },
	{ pattern: /\beval\s*\(/, label: "eval" },
	{ pattern: /\bFunction\s*\(/, label: "Function" },
	{ pattern: /\bimport\s*\(/, label: "dynamic import" },
	{ pattern: /\brequire\s*\(/, label: "require" },
	{ pattern: /^\s*import\s/m, label: "import declaration" },
	{ pattern: /\bstaticFile\s*\(/, label: "unsupported API: staticFile" },
	{ pattern: /\bSeries\b/, label: "unsupported API: Series" },
	{ pattern: /\bAudio\b/, label: "unsupported API: Audio" },
	{ pattern: /\buseDelayRender\b/, label: "unsupported API: useDelayRender" },
	{
		pattern: /\btransition(?:Property|Duration|TimingFunction|Delay)?\s*:/,
		label: "CSS transition",
	},
	{
		pattern:
			/\banimation(?:Name|Duration|TimingFunction|Delay|IterationCount|FillMode|Direction|PlayState)?\s*:/,
		label: "CSS animation",
	},
	{
		pattern: /@keyframes\b/,
		label: "CSS keyframes animation",
	},
	{
		pattern: /className\s*=\s*["'][^"']*\b(?:animate-|transition-)/,
		label: "CSS utility animation",
	},
];

export interface ShotlyxRemotionValidationResult {
	valid: boolean;
	errors: string[];
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateShotlyxRemotionComponentQuality({
	source,
}: {
	source: string;
}): string[] {
	const errors: string[] = [];
	if (!/\buseCurrentFrame\s*\(/.test(source)) {
		errors.push(
			"componentSource should use useCurrentFrame() for frame-based MG motion",
		);
	}
	return errors;
}

function validateTransparentBackgroundSource({
	source,
}: {
	source: string;
}): string[] {
	const errors: string[] = [];
	const absoluteFillStylePattern =
		/<AbsoluteFill\b[^>]*style\s*=\s*\{\{([\s\S]{0,900}?)\}\}/g;
	for (const match of source.matchAll(absoluteFillStylePattern)) {
		const style = match[1] ?? "";
		if (
			/\bbackground(?:Color|Image)?\s*:\s*(?!["'`]transparent["'`])/.test(
				style,
			)
		) {
			errors.push(
				"transparentBackground components must not paint a full-canvas background on AbsoluteFill",
			);
			break;
		}
	}
	return errors;
}

export function validateShotlyxRemotionComponentSource({
	source,
	transparentBackground = false,
}: {
	source: string;
	transparentBackground?: boolean;
}): ShotlyxRemotionValidationResult {
	const errors: string[] = [];
	if (!/export\s+default\s+function\s+ShotlyxComponent\b/.test(source)) {
		errors.push(
			"componentSource must export default function ShotlyxComponent",
		);
	}
	for (const { pattern, label } of FORBIDDEN_SOURCE_PATTERNS) {
		if (pattern.test(source)) {
			errors.push(`componentSource uses forbidden API: ${label}`);
		}
	}
	errors.push(...validateShotlyxRemotionComponentQuality({ source }));
	if (transparentBackground) {
		errors.push(...validateTransparentBackgroundSource({ source }));
	}
	return {
		valid: errors.length === 0,
		errors,
	};
}

function isSafeIdentifier(value: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(value);
}

function hasTableColumnReference({
	source,
	column,
}: {
	source: string;
	column: string;
}): boolean {
	const escaped = escapeRegExp(column);
	if (new RegExp(String.raw`\[\s*["'\`]${escaped}["'\`]\s*\]`).test(source)) {
		return true;
	}
	return isSafeIdentifier(column)
		? new RegExp(String.raw`\.\s*${escaped}\b`).test(source)
		: false;
}

export function validateShotlyxRemotionComponentDataContract({
	source,
	propsSchema,
}: {
	source: string;
	propsSchema: ShotlyxMGPropDefinition[];
}): ShotlyxRemotionValidationResult {
	const errors: string[] = [];
	for (const prop of propsSchema) {
		if (prop.type !== "table" || !prop.columns?.length) continue;
		for (const column of prop.columns) {
			if (!hasTableColumnReference({ source, column })) {
				errors.push(
					`table prop "${prop.key}" column "${column}" must be read with the exact generated column key`,
				);
			}
		}
	}
	return {
		valid: errors.length === 0,
		errors,
	};
}

export function assertValidShotlyxRemotionComponentAssetDocument(
	value: unknown,
): asserts value is ShotlyxRemotionComponentDocument {
	const result = shotlyxRemotionComponentDocumentSchema.safeParse(value);
	if (!result.success) {
		throw new Error(
			`Invalid Shotlyx Remotion component document: ${result.error.issues
				.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
				.join("; ")}`,
		);
	}

	const sourceValidation = validateShotlyxRemotionComponentSource({
		source: result.data.componentSource,
		transparentBackground: result.data.transparentBackground === true,
	});
	if (!sourceValidation.valid) {
		throw new Error(
			`Invalid Shotlyx Remotion component source: ${sourceValidation.errors.join(
				"; ",
			)}`,
		);
	}

	for (const prop of result.data.propsSchema) {
		if (!(prop.key in result.data.defaultProps)) {
			throw new Error(`defaultProps missing key "${prop.key}"`);
		}
	}
}
