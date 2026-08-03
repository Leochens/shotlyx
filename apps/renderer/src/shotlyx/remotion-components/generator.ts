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
import { getDefaultModelBundle } from "@/agent/ai-sdk/providers";
import type { LLMProviderConfig } from "@/agent/llm/types";
import { generateUUID } from "@/utils/id";
import { buildRemotionSkillContext } from "./skill-context";
import { createShotlyxMotionPrimitives } from "./motion-primitives";
import {
	buildShotlyxMGGenerationRequest,
	type ShotlyxMGGenerationRequest,
} from "./generation-request";
import {
	assertShotlyxMGHardQuality,
	evaluateShotlyxMGLocalQuality,
	type ShotlyxMGRenderedFrame,
} from "./quality";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	type ShotlyxMGAspectRatio,
	type ShotlyxMGPropDefinition,
	type ShotlyxMGPropType,
	type ShotlyxMGPropValue,
	type ShotlyxRemotionComponentDocument,
	type ShotlyxRemotionComponentManifest,
	type ShotlyxMGMotionSpec,
	type ShotlyxMGVisualDNA,
} from "./types";
import { assertValidShotlyxRemotionComponentAssetDocument } from "./validator";
import {
	createShotlyxMGMotionSpec,
	createShotlyxMGVisualDNA,
	formatShotlyxMGDesignContract,
} from "./visual-dna";

const DEFAULT_FPS = 30;
const DEFAULT_DURATION_SECONDS = 6;
const MAX_OUTPUT_TOKENS = 12_000;
const RENDER_VALIDATION_FRAME_COUNT = 4;
const MAX_SOURCE_CHARS = 32_000;
const SVG_CHILD_TAG_RE =
	/<(?:animate|circle|clipPath|defs|ellipse|fe[A-Z][A-Za-z]*|filter|g|line|linearGradient|mask|path|pattern|polygon|polyline|radialGradient|rect|stop|text|textPath|tspan|use)\b/i;
const SVG_BLOCK_RE = /<svg\b[\s\S]*?<\/svg>/gi;
const NON_FINITE_RENDER_VALUE_RE = /\b(?:NaN|Infinity|-Infinity)\b/;

let renderValidationQueue: Promise<void> = Promise.resolve();
const recentVisualFingerprints: string[] = [];

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

export interface GenerateShotlyxMGComponentOptions {
	prompt: string;
	durationSeconds?: number;
	aspectRatio?: ShotlyxMGAspectRatio;
	styleGuide?: string;
	model?: LanguageModel;
	providerConfig?: LLMProviderConfig;
	generateTextFn?: typeof generateText;
	generateSourceFn?: GenerateShotlyxMGSourceFn;
	repairAttempts?: number;
	abortSignal?: AbortSignal;
	maxOutputTokens?: number;
	transparentBackground?: boolean;
	name?: string;
	generationRequest?: ShotlyxMGGenerationRequest;
}

export type GenerateShotlyxMGSourceFn = (options: {
	system: string;
	prompt: string;
	maxOutputTokens: number;
	abortSignal?: AbortSignal;
}) => Promise<string>;

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
	visualDNA?: ShotlyxMGVisualDNA;
	motionSpec?: ShotlyxMGMotionSpec;
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

function isStandaloneDefaultExportStart({ line }: { line: string }): boolean {
	const trimmedLine = line.trim();
	if (/^export\s+default\s+function\s+ShotlyxComponent\b/.test(trimmedLine)) {
		return false;
	}
	return (
		/^export\s+default\b/.test(trimmedLine) ||
		/^export\s*\{[^}]*\bdefault\b[^}]*\}\s*;?\s*$/.test(trimmedLine)
	);
}

function isDefaultExportStatementComplete({ line }: { line: string }): boolean {
	const trimmedLine = line.trim();
	return (
		trimmedLine.endsWith(";") ||
		/^export\s*\{[^}]*\bdefault\b[^}]*\}\s*;?\s*$/.test(trimmedLine) ||
		/^export\s+default\s+[A-Za-z_$][\w$.$]*\s*$/.test(trimmedLine)
	);
}

function stripStandaloneDefaultExports({ source }: { source: string }): string {
	const normalizedLines: string[] = [];
	let skippingDefaultExport = false;
	for (const line of source.split("\n")) {
		if (skippingDefaultExport) {
			if (isDefaultExportStatementComplete({ line })) {
				skippingDefaultExport = false;
			}
			continue;
		}
		if (isStandaloneDefaultExportStart({ line })) {
			if (!isDefaultExportStatementComplete({ line })) {
				skippingDefaultExport = true;
			}
			continue;
		}
		normalizedLines.push(line);
	}
	return normalizedLines.join("\n").trim();
}

function stripDefaultExport({ source }: { source: string }): string {
	return stripStandaloneDefaultExports({
		source: source.replace(
			/export\s+default\s+function\s+ShotlyxComponent\b/,
			"function ShotlyxComponent",
		),
	});
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

function normalizeGeneratedComponentSource({
	source,
}: {
	source: string;
}): string {
	const normalizedLines: string[] = [];
	let braceDepth = 0;
	let skippingImportDeclaration = false;
	let skippingDefaultExport = false;
	for (const line of source.split("\n")) {
		const trimmedLine = line.trim();
		if (skippingImportDeclaration) {
			if (trimmedLine.endsWith(";")) {
				skippingImportDeclaration = false;
			}
			continue;
		}
		if (skippingDefaultExport) {
			if (isDefaultExportStatementComplete({ line })) {
				skippingDefaultExport = false;
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
			if (isStandaloneDefaultExportStart({ line })) {
				if (!isDefaultExportStatementComplete({ line })) {
					skippingDefaultExport = true;
				}
				continue;
			}
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
			if (isTopLevelDuplicateRemotionAlias({ line })) continue;
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
		"const ShotlyxMotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.ShotlyxMotion;",
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
		return await import(
			/* @vite-ignore */ `${pathToFileURL(filePath).href}?t=${Date.now()}`
		);
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

function assertValidRenderedMarkup({ markup }: { markup: string }): void {
	if (NON_FINITE_RENDER_VALUE_RE.test(markup)) {
		throw new Error("rendered markup contains a non-finite value");
	}
	const outsideSvg = markup.replace(SVG_BLOCK_RE, "");
	if (SVG_CHILD_TAG_RE.test(outsideSvg)) {
		throw new Error(
			"rendered SVG child tags must be wrapped in an <svg> element",
		);
	}
}

async function assertRenderableShotlyxRemotionComponent({
	document,
}: {
	document: ShotlyxRemotionComponentDocument;
}): Promise<ShotlyxMGRenderedFrame[]> {
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
	const previousConsoleError = console.error;
	const previousConsoleWarn = console.warn;
	const renderWarnings: string[] = [];
	const renderedFrames: ShotlyxMGRenderedFrame[] = [];
	const captureConsoleMessage = (args: unknown[]) => {
		const message = args
			.map((arg) => (typeof arg === "string" ? arg : String(arg)))
			.join(" ");
		if (
			/\bNaN\b/.test(message) ||
			/\bInfinity\b/.test(message) ||
			message.toLowerCase().includes("received")
		) {
			renderWarnings.push(message);
		}
	};
	try {
		console.error = (...args: unknown[]) => {
			captureConsoleMessage(args);
			previousConsoleError(...args);
		};
		console.warn = (...args: unknown[]) => {
			captureConsoleMessage(args);
			previousConsoleWarn(...args);
		};
		Reflect.set(globalThis, "__SHOTLYX_REMOTION_RUNTIME__", {
			React: ReactRuntime,
			ShotlyxMotion: createShotlyxMotionPrimitives(),
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
			const markup = renderToStaticMarkup(
				ReactRuntime.createElement(Component, document.defaultProps),
			);
			assertValidRenderedMarkup({ markup });
			renderedFrames.push({ frame, markup });
		}
		if (renderWarnings.length > 0) {
			throw new Error(
				`React render warning: ${renderWarnings.slice(0, 3).join(" | ")}`,
			);
		}
		return renderedFrames;
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
		console.error = previousConsoleError;
		console.warn = previousConsoleWarn;
		releaseValidation();
	}
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
	visualDNA,
	motionSpec,
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
	const defaultProps = buildDefaultPropsFromSchema({ propsSchema });
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
		visualDNA,
		motionSpec,
	};
	const document: ShotlyxRemotionComponentDocument = {
		...withoutManifest,
		manifest: buildManifest({
			id: generateUUID(),
			document: withoutManifest,
		}),
	};
	assertValidShotlyxRemotionComponentAssetDocument(document);
	const frames = await assertRenderableShotlyxRemotionComponent({ document });
	const quality = evaluateShotlyxMGLocalQuality({ document, frames });
	assertShotlyxMGHardQuality(quality);
	document.quality = quality;
	return document;
}

function isNoTextMGRequest({ prompt }: { prompt: string }): boolean {
	const normalized = prompt.toLowerCase();
	return [
		"不出现文字",
		"不要文字",
		"无文字",
		"纯视觉",
		"no text",
		"without text",
		"pure visual",
	].some((term) => normalized.includes(term));
}

function isDataLikeMGRequest({ prompt }: { prompt: string }): boolean {
	const normalized = prompt.toLowerCase();
	return [
		"数据",
		"图表",
		"表格",
		"指标",
		"趋势",
		"排行",
		"柱状",
		"折线",
		"chart",
		"table",
		"metric",
		"kpi",
		"trend",
		"bar",
		"line chart",
	].some((term) => normalized.includes(term));
}

function truncateForGeneratedName({
	value,
	maxLength,
}: {
	value: string;
	maxLength: number;
}): string {
	const normalized = value.trim().replace(/\s+/g, " ");
	if (!normalized) return "自定义 MG";
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function buildGeneratedComponentName({
	prompt,
	contentKind,
}: {
	prompt: string;
	contentKind: ShotlyxMGGenerationRequest["contentKind"];
}): string {
	const explicitName = extractExplicitMGAssetName({ prompt });
	if (explicitName) return explicitName;
	const quoted = extractQuotedTextSnippets({ prompt })[0];
	const kindLabel: Record<ShotlyxMGGenerationRequest["contentKind"], string> = {
		title: "标题动效",
		metric: "数据动效",
		chart: "图表动效",
		process: "流程动效",
		comparison: "对比动效",
		callout: "重点标注",
		effect: "视觉动效",
		general: "MG 动画",
	};
	if (quoted) {
		return `${truncateForGeneratedName({ value: quoted, maxLength: 24 })} · ${kindLabel[contentKind]}`;
	}
	const subject = prompt
		.replace(/(?:请|帮我|生成|制作|做一个|做成|创建|需要)/g, " ")
		.replace(/(?:MG|动画|动效)/gi, " ")
		.split(/[。.!！?？；;\n]/)[0]
		?.trim();
	return truncateForGeneratedName({
		value: subject
			? `${subject} · ${kindLabel[contentKind]}`
			: kindLabel[contentKind],
		maxLength: 34,
	});
}

function extractExplicitMGAssetName({
	prompt,
}: {
	prompt: string;
}): string | null {
	const match = prompt.match(
		/(?:MG asset name|MG 资产名|资产名称|组件名称)\s*[:：]\s*([^\n]+)/i,
	);
	const rawName = match?.[1]?.trim();
	if (!rawName) return null;
	const cleanName = rawName.replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, "");
	if (!cleanName) return null;
	return truncateForGeneratedName({ value: cleanName, maxLength: 40 });
}

function extractQuotedTextSnippets({ prompt }: { prompt: string }): string[] {
	const snippets: string[] = [];
	for (const pattern of [
		/["“]([^"”]{1,80})["”]/g,
		/「([^」]{1,80})」/g,
		/『([^』]{1,80})』/g,
		/《([^》]{1,80})》/g,
	]) {
		for (const match of prompt.matchAll(pattern)) {
			const value = match[1]?.trim();
			if (value && !snippets.includes(value)) snippets.push(value);
		}
	}
	return snippets.slice(0, 6);
}

function extractPromptHexColors({
	prompt,
	styleGuide,
}: {
	prompt: string;
	styleGuide?: string;
}): string[] {
	const text = `${prompt}\n${styleGuide ?? ""}`;
	return Array.from(
		new Set(
			(text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((color) =>
				color.toLowerCase(),
			),
		),
	).slice(0, 6);
}

function extractPromptNumbers({ prompt }: { prompt: string }): string[] {
	const dataText = prompt
		.replace(/\d+(?:\.\d+)?\s*(?:秒|s|secs?|seconds?)/gi, " ")
		.replace(/\b(?:16:9|9:16|1:1)\b/g, " ");
	return Array.from(
		new Set(dataText.match(/[-+]?\d+(?:\.\d+)?%?(?:万|亿|k|K|m|M)?/g) ?? []),
	).slice(0, 8);
}

function deriveTextDefaults({
	prompt,
	noText,
}: {
	prompt: string;
	noText: boolean;
}): {
	title?: string;
	subtitle?: string;
	caption?: string;
} {
	if (noText) return {};
	const snippets = extractQuotedTextSnippets({ prompt });
	const compactPrompt = prompt
		.replace(/\s+/g, " ")
		.replace(/[\n\r]+/g, " ")
		.trim();
	const [firstClause, secondClause] = compactPrompt
		.split(/[。.!！?？；;，,]/)
		.map((part) => part.trim())
		.filter(Boolean);
	const title = snippets[0] ?? firstClause ?? "自定义 MG 动画";
	const subtitle = snippets[1] ?? secondClause ?? "";
	return {
		title: truncateForGeneratedName({ value: title, maxLength: 28 }),
		subtitle: truncateForGeneratedName({ value: subtitle, maxLength: 42 }),
		caption: truncateForGeneratedName({ value: compactPrompt, maxLength: 68 }),
	};
}

function deriveTableRows({
	prompt,
	noText,
}: {
	prompt: string;
	noText: boolean;
}): Array<Record<string, string | number | boolean>> {
	if (noText || !isDataLikeMGRequest({ prompt })) return [];
	const numbers = extractPromptNumbers({ prompt });
	if (numbers.length === 0) return [];
	return numbers.slice(0, 6).map((value) => ({
		label: "",
		value,
		note: "",
	}));
}

function prop({
	key,
	label,
	type,
	role,
	defaultValue,
	min,
	max,
	step,
	options,
	columns,
}: {
	key: string;
	label: string;
	type: ShotlyxMGPropType;
	role: ShotlyxMGPropDefinition["role"];
	defaultValue: ShotlyxMGPropValue;
	min?: number;
	max?: number;
	step?: number;
	options?: Array<{ label: string; value: string }>;
	columns?: string[];
}): ShotlyxMGPropDefinition {
	return {
		key,
		label,
		type,
		role,
		default: defaultValue,
		...(min === undefined ? {} : { min }),
		...(max === undefined ? {} : { max }),
		...(step === undefined ? {} : { step }),
		...(options ? { options } : {}),
		...(columns ? { columns } : {}),
	};
}

function derivePropsSchema({
	prompt,
	styleGuide,
	transparentBackground,
	visualDNA,
}: {
	prompt: string;
	styleGuide?: string;
	transparentBackground: boolean;
	visualDNA: ShotlyxMGVisualDNA;
}): ShotlyxMGPropDefinition[] {
	const noText = isNoTextMGRequest({ prompt });
	const colors = extractPromptHexColors({ prompt, styleGuide });
	const textDefaults = deriveTextDefaults({ prompt, noText });
	const rows = deriveTableRows({ prompt, noText });
	const props: ShotlyxMGPropDefinition[] = [];

	if (!noText) {
		props.push(
			prop({
				key: "title",
				label: "Title",
				type: "text",
				role: "content",
				defaultValue: textDefaults.title ?? "自定义 MG 动画",
			}),
			prop({
				key: "subtitle",
				label: "Subtitle",
				type: "text",
				role: "content",
				defaultValue: textDefaults.subtitle ?? "",
			}),
			prop({
				key: "caption",
				label: "Caption",
				type: "text",
				role: "content",
				defaultValue: textDefaults.caption ?? "",
			}),
			prop({
				key: "showLabels",
				label: "Show labels",
				type: "boolean",
				role: "content",
				defaultValue: true,
			}),
		);
	}

	if (rows.length > 0) {
		props.push(
			prop({
				key: "items",
				label: "Data items",
				type: "table",
				role: "data",
				defaultValue: rows,
				columns: ["label", "value", "note"],
			}),
		);
	}

	props.push(
		prop({
			key: "primaryColor",
			label: "Primary color",
			type: "color",
			role: "style",
			defaultValue: colors[0] ?? visualDNA.colors.primary,
		}),
		prop({
			key: "secondaryColor",
			label: "Secondary color",
			type: "color",
			role: "style",
			defaultValue: colors[1] ?? visualDNA.colors.secondary,
		}),
		prop({
			key: "warningColor",
			label: "Warning color",
			type: "color",
			role: "style",
			defaultValue: colors[2] ?? visualDNA.colors.primary,
		}),
		prop({
			key: "foregroundColor",
			label: "Foreground color",
			type: "color",
			role: "style",
			defaultValue: colors[2] ?? visualDNA.colors.foreground,
		}),
		prop({
			key: "fontFamily",
			label: "Font family",
			type: "font",
			role: "typography",
			defaultValue: visualDNA.typography.fontFamilies.join(", "),
		}),
		prop({
			key: "intensity",
			label: "Motion intensity",
			type: "number",
			role: "motion",
			defaultValue: 1,
			min: 0.2,
			max: 2,
			step: 0.05,
		}),
		prop({
			key: "density",
			label: "Visual density",
			type: "number",
			role: "motion",
			defaultValue: 1,
			min: 0.2,
			max: 2,
			step: 0.05,
		}),
	);

	if (transparentBackground) {
		props.push(
			prop({
				key: "backdropOpacity",
				label: "Backdrop opacity",
				type: "number",
				role: "style",
				defaultValue: 0,
				min: 0,
				max: 1,
				step: 0.05,
			}),
			prop({
				key: "backgroundColor",
				label: "Backdrop color",
				type: "color",
				role: "style",
				defaultValue: colors[3] ?? visualDNA.colors.background,
			}),
		);
	} else {
		props.push(
			prop({
				key: "backgroundColor",
				label: "Background color",
				type: "color",
				role: "style",
				defaultValue: colors[3] ?? visualDNA.colors.background,
			}),
		);
	}

	return props;
}

function typeForProp({ prop }: { prop: ShotlyxMGPropDefinition }): string {
	switch (prop.type) {
		case "number":
			return "number";
		case "boolean":
			return "boolean";
		case "table":
			return "Array<{ label: string; value: string | number | boolean; note: string }>";
		case "text":
		case "color":
		case "font":
		case "select":
		case "image":
		default:
			return "string";
	}
}

function buildPropsType({
	propsSchema,
}: {
	propsSchema: ShotlyxMGPropDefinition[];
}): string {
	return [
		"type Props = {",
		...propsSchema.map(
			(item) => `  ${item.key}: ${typeForProp({ prop: item })};`,
		),
		"};",
	].join("\n");
}

function buildCodeSystemPrompt({
	skillContext,
	propsSchema,
	providerConfig,
}: {
	skillContext: string;
	propsSchema: ShotlyxMGPropDefinition[];
	providerConfig?: LLMProviderConfig;
}): string {
	return [
		"You generate fully custom Shotlyx MG animations as Remotion-compatible React component source code.",
		"Return TSX code only. Do not return JSON, Markdown explanation, a template id, a storyboard, or prose.",
		"The code must export default function ShotlyxComponent(props: Props).",
		"Do not include import statements. Do not redeclare Remotion APIs at module scope.",
		"Allowed Remotion APIs are injected as bare bindings: AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video.",
		"ShotlyxMotion is injected as a small atomic helper library: clamp01, progress, buildHoldResolve, stagger, seeded, fitText, and countTo. These are motion/layout primitives, not visual templates. Prefer them when they improve timing, text fit, or deterministic variation.",
		"React is available globally. Use JSX normally.",
		"Never use fetch, XMLHttpRequest, WebSocket, eval, Function, document, window, localStorage, sessionStorage, indexedDB, require, dynamic import, __filename, __dirname, process, Buffer, module, exports, or import.meta.",
		"Use frame-based motion only: useCurrentFrame(), useVideoConfig(), interpolate(), spring(), and deterministic math.",
		"Do not use CSS transition, CSS animation, @keyframes, or Tailwind animate/transition utility classes.",
		"Prefer SVG, div geometry, masks, gradients, strokes, paths, and deterministic particle arrays for motion graphics.",
		"When using SVG tags such as g, rect, circle, line, or path, always wrap them inside an <svg> element.",
		"All animated numeric values must be finite. Guard divisions and scale values so JSX never renders NaN, Infinity, or -Infinity.",
		"For moving elements, do not apply the same axis twice. Example: do not use top: y together with transform: translateY(y); use one positioning method per axis.",
		"Use only the provided props contract. Do not invent additional props.",
		buildPropsType({ propsSchema }),
		`Default editable props: ${JSON.stringify(
			buildDefaultPropsFromSchema({ propsSchema }),
		)}`,
		providerConfig?.provider ? `Provider: ${providerConfig.provider}` : "",
		skillContext,
	]
		.filter(Boolean)
		.join("\n");
}

function buildCodeUserPrompt({
	prompt,
	durationSeconds,
	aspectRatio,
	styleGuide,
	validationErrors,
	previousSource,
	transparentBackground,
	propsSchema,
	designContract,
}: {
	prompt: string;
	durationSeconds: number;
	aspectRatio: ShotlyxMGAspectRatio;
	styleGuide?: string;
	validationErrors?: string[];
	previousSource?: string;
	transparentBackground: boolean;
	propsSchema: ShotlyxMGPropDefinition[];
	designContract: string;
}): string {
	const size = canvasSizeForAspectRatio({ aspectRatio });
	const noText = isNoTextMGRequest({ prompt });
	return [
		`User request: ${prompt}`,
		`Duration: ${durationSeconds}s`,
		`Canvas: ${size.width}x${size.height}, aspect ${aspectRatio}, fps ${DEFAULT_FPS}`,
		`Background: ${transparentBackground ? "transparent overlay" : "solid/custom allowed"}`,
		styleGuide ? `Style guide: ${styleGuide}` : "",
		designContract,
		noText
			? "The user requested no text / pure visual. Do not render words, labels, numbers, headings, captions, or placeholder text."
			: "Visible text must come from the provided props and the user request. Do not render placeholder copy.",
		transparentBackground
			? "Do not paint a full-canvas opaque background. If a backdrop is needed, use props.backdropOpacity and keep it local/subtle."
			: "A full-canvas background is allowed when it improves the requested design.",
		"Design the content structure, visual direction, timing, and micro-motion yourself. Do not imitate a builtin template.",
		"Use enough geometry or particles so the result is visibly non-empty at frame 0, 25%, 50%, 75%, and the final frame. For falling/rain effects, initialize some elements already inside the viewport and wrap them deterministically.",
		"Keep animated coordinates within or near the canvas. Avoid putting every element off-screen during the sampled frames.",
		`Editable props available to the component: ${propsSchema
			.map((item) => item.key)
			.join(", ")}`,
		validationErrors?.length
			? `Previous code failed. Fix only the code and return a complete corrected TSX component.\nErrors:\n${validationErrors.join("\n")}`
			: "",
		previousSource
			? `Previous code:\n\`\`\`tsx\n${previousSource.slice(
					0,
					MAX_SOURCE_CHARS,
				)}\n\`\`\``
			: "",
	]
		.filter(Boolean)
		.join("\n");
}

function extractComponentSourceFromText({ text }: { text: string }): string {
	const trimmed = text.trim();
	if (!trimmed) throw new Error("No output generated.");
	const fenced = trimmed.match(
		/```(?:tsx|typescript|ts|jsx|javascript|js)?\s*([\s\S]*?)```/i,
	);
	let source = (fenced?.[1] ?? trimmed).trim();
	const exportIndex = source.search(
		/export\s+default\s+function\s+ShotlyxComponent\b/,
	);
	if (exportIndex > 0) source = source.slice(exportIndex).trim();
	if (!/export\s+default\s+function\s+ShotlyxComponent\b/.test(source)) {
		source = source.replace(
			/\bfunction\s+ShotlyxComponent\b/,
			"export default function ShotlyxComponent",
		);
	}
	const trailingFenceIndex = source.indexOf("```");
	if (trailingFenceIndex >= 0) {
		source = source.slice(0, trailingFenceIndex).trim();
	}
	return source;
}

function textFromGenerateTextResult(result: unknown): string {
	if (
		typeof result === "object" &&
		result !== null &&
		"text" in result &&
		typeof result.text === "string"
	) {
		return result.text;
	}
	if (
		typeof result === "object" &&
		result !== null &&
		"output" in result &&
		typeof result.output === "string"
	) {
		return result.output;
	}
	throw new Error("No output generated.");
}

export async function generateShotlyxMGComponentDocument({
	prompt,
	durationSeconds,
	aspectRatio = "16:9",
	styleGuide,
	model,
	providerConfig,
	generateTextFn = generateText,
	generateSourceFn,
	repairAttempts = 2,
	abortSignal,
	maxOutputTokens = MAX_OUTPUT_TOKENS,
	transparentBackground = true,
	name,
	generationRequest,
}: GenerateShotlyxMGComponentOptions): Promise<ShotlyxRemotionComponentDocument> {
	const defaultBundle =
		model || generateSourceFn ? undefined : getDefaultModelBundle();
	const selectedModel = model ?? defaultBundle?.model;
	if (!selectedModel && !generateSourceFn) {
		throw new Error("configuration_error: missing LLM model");
	}
	const selectedProviderConfig = providerConfig ?? defaultBundle?.config;
	const request =
		generationRequest ??
		buildShotlyxMGGenerationRequest({
			prompt,
			duration: durationSeconds ?? "auto",
			aspectRatio,
			transparentBackground,
			styleGuide,
		});
	const requestedDuration = request.durationSeconds || DEFAULT_DURATION_SECONDS;
	const requestedSize = canvasSizeForAspectRatio({
		aspectRatio: request.aspectRatio,
	});
	const visualDNA = createShotlyxMGVisualDNA({
		request,
		avoidFingerprints: recentVisualFingerprints,
	});
	const motionSpec = createShotlyxMGMotionSpec({ request, visualDNA });
	const propsSchema = derivePropsSchema({
		prompt,
		styleGuide,
		transparentBackground: request.transparentBackground,
		visualDNA,
	});
	const skillContext = buildRemotionSkillContext({
		prompt,
		styleGuide,
	});
	let validationErrors: string[] | undefined;
	let previousSource: string | undefined;
	let lastError: unknown;
	let attempt = 0;

	while (attempt <= repairAttempts) {
		try {
			const system = buildCodeSystemPrompt({
				skillContext,
				propsSchema,
				providerConfig: selectedProviderConfig,
			});
			const generationPrompt = buildCodeUserPrompt({
				prompt,
				durationSeconds: requestedDuration,
				aspectRatio: request.aspectRatio,
				styleGuide,
				validationErrors,
				previousSource,
				transparentBackground: request.transparentBackground,
				propsSchema,
				designContract: formatShotlyxMGDesignContract({
					visualDNA,
					motionSpec,
				}),
			});
			const generatedText = generateSourceFn
				? await generateSourceFn({
						system,
						prompt: generationPrompt,
						maxOutputTokens,
						abortSignal,
					})
				: textFromGenerateTextResult(
						await generateTextFn({
							model: selectedModel!,
							system,
							prompt: generationPrompt,
							maxOutputTokens,
							abortSignal,
						}),
					);
			const source = extractComponentSourceFromText({
				text: generatedText,
			});
			if (source.length > MAX_SOURCE_CHARS) {
				throw new Error(
					`Generated Remotion component source is too long: ${source.length}`,
				);
			}
			previousSource = source;
			const durationInFrames = Math.max(
				1,
				Math.round(requestedDuration * DEFAULT_FPS),
			);
			const document = await createShotlyxRemotionComponentDocument({
				name:
					name?.trim() ||
					buildGeneratedComponentName({
						prompt,
						contentKind: request.contentKind,
					}),
				durationSeconds: requestedDuration,
				fps: DEFAULT_FPS,
				width: requestedSize.width,
				height: requestedSize.height,
				aspectRatio: request.aspectRatio,
				transparentBackground: request.transparentBackground,
				componentSource: source,
				propsSchema,
				sourcePrompt: prompt,
				thumbnailFrame: Math.floor(durationInFrames * 0.45),
				visualDNA,
				motionSpec,
			});
			recentVisualFingerprints.push(visualDNA.fingerprint);
			if (recentVisualFingerprints.length > 16)
				recentVisualFingerprints.shift();
			return document;
		} catch (error) {
			lastError = error;
			validationErrors = [
				error instanceof Error ? error.message : String(error),
			];
			attempt += 1;
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Shotlyx Remotion safe-code generation failed");
}
