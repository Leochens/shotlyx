import * as ReactRuntime from "react";
import type { CSSProperties, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Easing, interpolate, spring } from "remotion";
import {
	resolveShotlyxMGInputProps,
	resolveShotlyxMGPlayerBackground,
} from "./media-props";
import { isShotlyxRemotionMGAsset, type ShotlyxRemotionMGAsset } from "./types";
import {
	createShotlyxMotionPrimitives,
	type ShotlyxMotionPrimitives,
} from "./motion-primitives";

interface RemotionCanvasModuleCacheEntry {
	component: ReactRuntime.ComponentType<Record<string, unknown>>;
	frameState: {
		frame: number;
		asset: ShotlyxRemotionMGAsset;
	};
	moduleUrl: string;
}

const moduleCache = new Map<string, Promise<RemotionCanvasModuleCacheEntry>>();
const RemotionFrameContext = ReactRuntime.createContext(0);

function escapeHtmlAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function getHtmlAttribute({
	tag,
	name,
}: {
	tag: string;
	name: string;
}): string | null {
	const match = tag.match(
		new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
	);
	return match?.[1] ?? match?.[2] ?? null;
}

function buildSvgImageTag({ svgMarkup }: { svgMarkup: string }): string {
	const openingTag = svgMarkup.match(/^<svg\b[^>]*>/i)?.[0] ?? "";
	const attrs: string[] = ['alt=""'];
	const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
		svgMarkup,
	)}`;
	attrs.push(`src="${escapeHtmlAttribute(src)}"`);

	for (const name of ["class", "style", "width", "height"] as const) {
		const value = getHtmlAttribute({ tag: openingTag, name });
		if (value !== null) {
			attrs.push(`${name}="${escapeHtmlAttribute(value)}"`);
		}
	}

	return `<img ${attrs.join(" ")} />`;
}

function findClosingSvgIndex({
	markup,
	startIndex,
}: {
	markup: string;
	startIndex: number;
}): number {
	const tagPattern = /<\/?svg\b[^>]*>/gi;
	tagPattern.lastIndex = startIndex;
	let depth = 0;
	for (const match of markup.matchAll(tagPattern)) {
		const tag = match[0];
		if (tag.startsWith("</")) {
			depth -= 1;
			if (depth === 0) {
				return match.index + tag.length;
			}
			continue;
		}
		depth += tag.endsWith("/>") ? 0 : 1;
	}
	return -1;
}

export function inlineSvgMarkupToImageTags({ markup }: { markup: string }) {
	let result = "";
	let cursor = 0;
	const openPattern = /<svg\b[^>]*>/gi;
	while (true) {
		openPattern.lastIndex = cursor;
		const match = openPattern.exec(markup);
		if (!match) {
			result += markup.slice(cursor);
			break;
		}

		const startIndex = match.index;
		const endIndex = findClosingSvgIndex({ markup, startIndex });
		if (endIndex < 0) {
			result += markup.slice(cursor);
			break;
		}

		result += markup.slice(cursor, startIndex);
		result += buildSvgImageTag({
			svgMarkup: markup.slice(startIndex, endIndex),
		});
		cursor = endIndex;
	}
	return result;
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function getNumberParam({
	params,
	key,
	fallback,
}: {
	params: Record<string, unknown>;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function withRemotionBareBindings({ moduleSource }: { moduleSource: string }) {
	const prelude: string[] = [];
	if (!/\b(?:const|let|var)\s+React\b/.test(moduleSource)) {
		prelude.push(
			"const React = globalThis.__SHOTLYX_REMOTION_RUNTIME__.React;",
		);
	}
	if (!/\b(?:const|let|var)\s+Remotion\b/.test(moduleSource)) {
		prelude.push(
			"const Remotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.Remotion;",
		);
	}
	if (!/\b(?:const|let|var)\s+ShotlyxMotion\b/.test(moduleSource)) {
		prelude.push(
			"const ShotlyxMotion = globalThis.__SHOTLYX_REMOTION_RUNTIME__.ShotlyxMotion;",
		);
	}
	if (!/\b(?:const|let|var)\s*\{[^}]*\}\s*=\s*Remotion\b/.test(moduleSource)) {
		prelude.push(
			"const { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easing, Img, Video } = Remotion;",
		);
	}
	return [...prelude, moduleSource].join("\n");
}

function StubAbsoluteFill({
	children,
	className,
	style,
	...other
}: {
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	[key: string]: unknown;
}) {
	return ReactRuntime.createElement(
		"div",
		{
			...other,
			className,
			style: {
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				...style,
			},
		},
		children,
	);
}

function useCanvasCurrentFrame(): number {
	return ReactRuntime.useContext(RemotionFrameContext);
}

function StubSequence({
	children,
	className,
	durationInFrames,
	from = 0,
	height,
	hidden,
	layout = "absolute-fill",
	style,
	width,
}: {
	children?: ReactNode;
	className?: string;
	durationInFrames?: number;
	from?: number;
	height?: number;
	hidden?: boolean;
	layout?: "absolute-fill" | "none";
	style?: CSSProperties;
	width?: number;
}) {
	const parentFrame = useCanvasCurrentFrame();
	const sequenceStart = Number.isFinite(from) ? from : 0;
	const localFrame = parentFrame - sequenceStart;
	if (hidden || localFrame < 0) return null;
	if (
		typeof durationInFrames === "number" &&
		Number.isFinite(durationInFrames) &&
		localFrame >= durationInFrames
	) {
		return null;
	}
	const content =
		layout === "none"
			? children
			: ReactRuntime.createElement(
					StubAbsoluteFill,
					{
						className,
						style: {
							...(width === undefined ? {} : { width }),
							...(height === undefined ? {} : { height }),
							...style,
						},
					},
					children,
				);
	return ReactRuntime.createElement(
		RemotionFrameContext.Provider,
		{ value: localFrame },
		content,
	);
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

type RemotionCanvasRuntime = {
	React: typeof ReactRuntime;
	ShotlyxMotion: ShotlyxMotionPrimitives;
	Remotion: {
		AbsoluteFill: typeof StubAbsoluteFill;
		Sequence: typeof StubSequence;
		useCurrentFrame: () => number;
		useVideoConfig: () => {
			id: string;
			width: number;
			height: number;
			fps: number;
			durationInFrames: number;
			defaultProps: Record<string, unknown>;
			props: Record<string, unknown>;
		};
		interpolate: typeof interpolate;
		spring: typeof spring;
		Easing: typeof Easing;
		Img: typeof StubImg;
		Video: typeof StubVideo;
	};
};

function isRemotionCanvasComponent(
	value: unknown,
): value is ReactRuntime.ComponentType<Record<string, unknown>> {
	return typeof value === "function";
}

function buildRemotionCanvasRuntime({
	frameState,
}: {
	frameState: RemotionCanvasModuleCacheEntry["frameState"];
}): RemotionCanvasRuntime {
	return {
		React: ReactRuntime,
		ShotlyxMotion: createShotlyxMotionPrimitives(),
		Remotion: {
			AbsoluteFill: StubAbsoluteFill,
			Sequence: StubSequence,
			useCurrentFrame: useCanvasCurrentFrame,
			useVideoConfig: () => ({
				id: frameState.asset.name,
				width: frameState.asset.document.width,
				height: frameState.asset.document.height,
				fps: frameState.asset.document.fps,
				durationInFrames: Math.round(
					frameState.asset.document.durationSeconds *
						frameState.asset.document.fps,
				),
				defaultProps: frameState.asset.document.defaultProps,
				props: frameState.asset.document.defaultProps,
			}),
			interpolate,
			spring,
			Easing,
			Img: StubImg,
			Video: StubVideo,
		},
	};
}

async function withRemotionCanvasRuntime<T>({
	runtime,
	fn,
}: {
	runtime: RemotionCanvasRuntime;
	fn: () => T | Promise<T>;
}): Promise<T> {
	const previousRuntime = Reflect.get(
		globalThis,
		"__SHOTLYX_REMOTION_RUNTIME__",
	);
	Reflect.set(globalThis, "__SHOTLYX_REMOTION_RUNTIME__", runtime);
	try {
		return await fn();
	} finally {
		if (previousRuntime === undefined) {
			Reflect.deleteProperty(globalThis, "__SHOTLYX_REMOTION_RUNTIME__");
		} else {
			Reflect.set(globalThis, "__SHOTLYX_REMOTION_RUNTIME__", previousRuntime);
		}
	}
}

async function loadRemotionCanvasModule({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): Promise<RemotionCanvasModuleCacheEntry> {
	const cacheKey = `${asset.id}:${asset.updatedAt}:${asset.document.manifest?.id ?? ""}`;
	const cached = moduleCache.get(cacheKey);
	if (cached) return cached;

	const promise = (async () => {
		const frameState = { frame: 0, asset };
		return await withRemotionCanvasRuntime({
			runtime: buildRemotionCanvasRuntime({ frameState }),
			fn: async () => {
				const blob = new Blob(
					[
						withRemotionBareBindings({
							moduleSource: asset.document.compiledModule,
						}),
					],
					{ type: "text/javascript" },
				);
				const moduleUrl = URL.createObjectURL(blob);
				const mod: unknown = await import(
					/* @vite-ignore */ /* webpackIgnore: true */ moduleUrl
				);
				const component =
					typeof mod === "object" && mod !== null
						? Reflect.get(mod, "default")
						: null;
				if (!isRemotionCanvasComponent(component)) {
					URL.revokeObjectURL(moduleUrl);
					throw new Error("Shotlyx MG compiled module has no component export");
				}
				return {
					component,
					frameState,
					moduleUrl,
				};
			},
		});
	})();

	moduleCache.set(
		cacheKey,
		promise.catch((error: unknown) => {
			moduleCache.delete(cacheKey);
			throw error;
		}),
	);
	return promise;
}

async function loadSvgImageSource({
	svg,
}: {
	svg: string;
}): Promise<ImageBitmap | HTMLImageElement> {
	const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	if (typeof Image !== "undefined") {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.crossOrigin = "anonymous";
			image.onload = () => resolve(image);
			image.onerror = () =>
				reject(new Error("Failed to decode Shotlyx MG SVG"));
			image.src = dataUrl;
		});
	}
	if (typeof createImageBitmap === "function") {
		const response = await fetch(dataUrl);
		return await createImageBitmap(await response.blob());
	}
	throw new Error(
		"No browser image decoder is available for Shotlyx MG export",
	);
}

function buildForeignObjectSvg({
	asset,
	markup,
	background,
}: {
	asset: ShotlyxRemotionMGAsset;
	markup: string;
	background: string;
}): string {
	const { width, height } = asset.document;
	const backgroundStyle =
		background && background !== "transparent"
			? `background:${background};`
			: "";
	return [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
		`<foreignObject x="0" y="0" width="${width}" height="${height}">`,
		`<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${width}px;height:${height}px;overflow:hidden;${backgroundStyle}">`,
		inlineSvgMarkupToImageTags({ markup }),
		"</div>",
		"</foreignObject>",
		"</svg>",
	].join("");
}

export async function renderShotlyxMGAssetToCanvas({
	asset,
	ctx,
	width,
	height,
	params,
}: {
	asset: unknown;
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	width: number;
	height: number;
	params: Record<string, unknown>;
}): Promise<void> {
	ctx.clearRect(0, 0, width, height);
	if (!isShotlyxRemotionMGAsset(asset)) return;
	const markup = await renderShotlyxMGAssetToStaticMarkup({ asset, params });
	const svg = buildForeignObjectSvg({
		asset,
		markup,
		background: resolveShotlyxMGPlayerBackground({ asset, params }),
	});
	const image = await loadSvgImageSource({ svg });
	try {
		ctx.drawImage(image, 0, 0, width, height);
	} finally {
		if ("close" in image && typeof image.close === "function") {
			image.close();
		}
	}
}

export async function renderShotlyxMGAssetToStaticMarkup({
	asset,
	params,
}: {
	asset: ShotlyxRemotionMGAsset;
	params: Record<string, unknown>;
}): Promise<string> {
	const durationInFrames = Math.max(
		1,
		Math.round(asset.document.durationSeconds * asset.document.fps),
	);
	const progress = clamp01(
		getNumberParam({ params, key: "progress", fallback: 1 }),
	);
	const currentFrame = Math.round(progress * (durationInFrames - 1));
	const entry = await loadRemotionCanvasModule({ asset });
	entry.frameState.frame = currentFrame;

	const inputProps = resolveShotlyxMGInputProps({
		asset,
		params,
		mediaAssets: [],
	});
	const markup = await withRemotionCanvasRuntime({
		runtime: buildRemotionCanvasRuntime({ frameState: entry.frameState }),
		fn: () =>
			renderToStaticMarkup(
				ReactRuntime.createElement(
					RemotionFrameContext.Provider,
					{ value: currentFrame },
					ReactRuntime.createElement(entry.component, inputProps),
				),
			),
	});
	return markup;
}
