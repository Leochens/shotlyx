import { z } from "zod";
import {
	SHOTLYX_HYPERFRAMES_RUNTIME,
	type ShotlyxHyperFramesDocument,
} from "@/shotlyx/remotion-components/types";

const propValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
]);

const propDefinitionSchema = z.object({
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
	role: z.enum(["content", "style", "typography", "motion", "data", "asset"]),
	default: propValueSchema,
	min: z.number().optional(),
	max: z.number().optional(),
	step: z.number().optional(),
	options: z
		.array(z.object({ label: z.string(), value: z.string() }))
		.optional(),
	columns: z.array(z.string()).optional(),
});

export const shotlyxHyperFramesDocumentSchema = z.object({
	version: z.literal(1),
	runtime: z.literal(SHOTLYX_HYPERFRAMES_RUNTIME),
	name: z.string().min(1),
	durationSeconds: z.number().positive().max(30),
	fps: z.number().positive().max(120),
	width: z.number().positive(),
	height: z.number().positive(),
	aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
	transparentBackground: z.boolean().optional(),
	templateId: z.enum([
		"swiss-pulse-explainer",
		"kinetic-launch-type",
		"data-drift-ai",
		"editorial-spotlight",
	]),
	designBrief: z.string().min(1),
	htmlSource: z.string().min(1).max(120_000),
	propsSchema: z.array(propDefinitionSchema).min(1).max(40),
	defaultProps: z.record(z.string(), propValueSchema),
	sourcePrompt: z.string(),
	thumbnailFrame: z.number().int().nonnegative().optional(),
	thumbnailUrl: z.string().optional(),
	render: z.object({
		status: z.enum(["simulated", "pending", "rendered", "error"]),
		format: z.enum(["html-preview", "webm", "mp4"]),
		mediaAssetId: z.string().optional(),
		previewHtml: z.string().optional(),
		diagnostics: z.array(z.string()),
		updatedAt: z.string(),
	}),
});

export function validateShotlyxHyperFramesDocument({
	document,
}: {
	document: ShotlyxHyperFramesDocument;
}): { valid: boolean; errors: string[] } {
	const errors: string[] = [];
	const parsed = shotlyxHyperFramesDocumentSchema.safeParse(document);
	if (!parsed.success) {
		errors.push(
			...parsed.error.issues.map(
				(issue) => `${issue.path.join(".") || "root"} ${issue.message}`,
			),
		);
		return { valid: false, errors };
	}

	const { htmlSource } = parsed.data;
	const requiredSnippets = [
		"data-composition-id",
		'data-start="0"',
		"data-duration",
		"data-track-index",
		"data-composition-variables",
		"gsap.timeline",
		"paused: true",
		"window.__timelines",
	];
	for (const snippet of requiredSnippets) {
		if (!htmlSource.includes(snippet)) {
			errors.push(
				`htmlSource missing HyperFrames contract snippet: ${snippet}`,
			);
		}
	}
	if (
		/data-layer=|data-end=|repeat:\s*-1|Math\.random|Date\.now/.test(htmlSource)
	) {
		errors.push("htmlSource violates deterministic HyperFrames contract");
	}
	return { valid: errors.length === 0, errors };
}

export function assertValidShotlyxHyperFramesDocument(
	value: unknown,
): asserts value is ShotlyxHyperFramesDocument {
	const result = shotlyxHyperFramesDocumentSchema.safeParse(value);
	if (!result.success) {
		throw new Error(
			`Invalid Shotlyx HyperFrames document: ${result.error.issues
				.map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
				.join("; ")}`,
		);
	}
	const validation = validateShotlyxHyperFramesDocument({
		document: result.data,
	});
	if (!validation.valid) {
		throw new Error(
			`Invalid Shotlyx HyperFrames document: ${validation.errors.join("; ")}`,
		);
	}
}
