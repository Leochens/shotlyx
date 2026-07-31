import { z } from "zod";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
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
	{ pattern: /\b__filename\b/, label: "CommonJS global: __filename" },
	{ pattern: /\b__dirname\b/, label: "CommonJS global: __dirname" },
	{ pattern: /\bprocess\b/, label: "Node global: process" },
	{ pattern: /\bBuffer\b/, label: "Node global: Buffer" },
	{ pattern: /\bmodule\b/, label: "CommonJS global: module" },
	{ pattern: /\bexports\b/, label: "CommonJS global: exports" },
	{ pattern: /\bimport\.meta\b/, label: "import.meta" },
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateDoubleAppliedPositionTransforms({
	source,
}: {
	source: string;
}): string[] {
	const errors: string[] = [];
	const styleObjectPattern =
		/\bstyle\s*=\s*\{\{([\s\S]{0,1400}?)\}\}/g;
	for (const match of source.matchAll(styleObjectPattern)) {
		const style = match[1] ?? "";
		const axisChecks: Array<{
			property: "top" | "left";
			transform: "translateY" | "translateX";
		}> = [
			{ property: "top", transform: "translateY" },
			{ property: "left", transform: "translateX" },
		];
		for (const { property, transform } of axisChecks) {
			for (const propertyMatch of style.matchAll(
				new RegExp(`\\b${property}\\s*:\\s*([A-Za-z_$][\\w$]*)\\b`, "g"),
			)) {
				const variableName = propertyMatch[1];
				if (!variableName) continue;
				const translatePattern = new RegExp(
					`\\b${transform}\\s*\\(\\s*\\$\\{\\s*${escapeRegExp(
						variableName,
					)}\\s*\\}\\s*px\\s*\\)`,
				);
				if (!translatePattern.test(style)) continue;
				errors.push(
					`componentSource double-applies ${property} with ${transform}(${variableName}); use either ${property} or transform for that axis, not both`,
				);
				return errors;
			}
		}
	}
	return errors;
}

function validateTransparentBackgroundSource({
	source,
}: {
	source: string;
}): string[] {
	const errors: string[] = [];
	const styleObjectPattern =
		/<([A-Za-z][\w.]*)\b[^>]*style\s*=\s*\{\{([\s\S]{0,1200}?)\}\}/g;
	for (const match of source.matchAll(styleObjectPattern)) {
		const tagName = match[1] ?? "";
		const style = match[2] ?? "";
		if (!styleHasNonTransparentBackground({ style })) continue;
		if (!styleLooksFullCanvas({ tagName, style })) continue;
		errors.push(
			"transparentBackground components must not paint a full-canvas background layer",
		);
		break;
	}
	return errors;
}

function styleHasNonTransparentBackground({
	style,
}: {
	style: string;
}): boolean {
	const backgroundPattern =
		/\bbackground(?:Color|Image)?\s*:\s*([^,}\n]+)/g;
	for (const match of style.matchAll(backgroundPattern)) {
		if (!isTransparentBackgroundValue({ value: match[1] ?? "" })) {
			return true;
		}
	}
	return false;
}

function isTransparentBackgroundValue({ value }: { value: string }): boolean {
	const normalized = value.trim().replace(/;$/, "");
	return (
		/^["'`](?:transparent|none)["'`]$/i.test(normalized) ||
		/^["'`]rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)["'`]$/i.test(
			normalized,
		) ||
		/^["'`]#(?:[0-9a-f]{6}00|[0-9a-f]{3}0)["'`]$/i.test(normalized)
	);
}

function styleLooksFullCanvas({
	tagName,
	style,
}: {
	tagName: string;
	style: string;
}): boolean {
	if (tagName === "AbsoluteFill" || tagName.endsWith(".AbsoluteFill")) {
		return true;
	}
	const hasAbsolutePosition =
		/\bposition\s*:\s*["'`]?(?:absolute|fixed)["'`]?/.test(style);
	const hasInsetZero = /\binset\s*:\s*(?:0|["'`]0(?:px|%)?["'`])/.test(
		style,
	);
	const hasFullWidth = /\bwidth\s*:\s*["'`]100%["'`]/.test(style);
	const hasFullHeight = /\bheight\s*:\s*["'`]100%["'`]/.test(style);
	const hasLocalShape =
		/\bborderRadius\s*:/.test(style) || /\bclipPath\s*:/.test(style);
	return (
		(hasAbsolutePosition && hasInsetZero && !hasLocalShape) ||
		(hasAbsolutePosition && hasFullWidth && hasFullHeight)
	);
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
	errors.push(...validateDoubleAppliedPositionTransforms({ source }));
	if (transparentBackground) {
		errors.push(...validateTransparentBackgroundSource({ source }));
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
