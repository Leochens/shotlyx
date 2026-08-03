import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { isDesktopMode } from "@/desktop/config/server";
import {
	SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
} from "@/shotlyx/remotion-components/project-assets";
import {
	resolveShotlyxMGInputProps,
	resolveShotlyxMGPlayerBackground,
} from "@/shotlyx/remotion-components/media-props";
import { isShotlyxRemotionMGAsset } from "@/shotlyx/remotion-components/types";
import type { ShotlyxRemotionMGAsset } from "@/shotlyx/remotion-components/types";
import { SHOTLYX_MOTION_RUNTIME_SOURCE } from "@/shotlyx/remotion-components/motion-primitives";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const frameRateSchema = z.object({
	numerator: z.number().positive(),
	denominator: z.number().positive(),
});

const requestSchema = z.object({
	asset: z.unknown(),
	element: z.object({
		animations: z.unknown().optional(),
		definitionId: z.string(),
		duration: z.number().positive(),
		motionGraphicBaseParams: z.record(z.string(), z.unknown()).optional(),
		params: z.record(z.string(), z.unknown()),
	}),
	fps: frameRateSchema,
	sourceHeight: z.number().int().positive().max(4096),
	sourceWidth: z.number().int().positive().max(4096),
});

const SHOTLYX_MG_RENDER_ENTRY_VERSION = "shotlyx-mg-render-entry-v2";
const MAX_BUNDLE_CACHE_ENTRIES = 24;
const DEFAULT_FRAME_RENDER_CONCURRENCY = 2;
const MAX_FRAME_RENDER_CONCURRENCY = 4;

type RemotionBundlerModule = typeof import("@remotion/bundler");
type RemotionRendererModule = typeof import("@remotion/renderer");
type HeadlessBrowser = Awaited<
	ReturnType<RemotionRendererModule["openBrowser"]>
>;

interface ShotlyxMGBundleCacheEntry {
	serveUrl: string;
}

let bundlerModulePromise: Promise<RemotionBundlerModule> | null = null;
let rendererModulePromise: Promise<RemotionRendererModule> | null = null;
let reusableBrowserPromise: Promise<HeadlessBrowser> | null = null;
const bundleCache = new Map<string, Promise<ShotlyxMGBundleCacheEntry>>();

function disabledResponse() {
	return Response.json(
		{
			error: "desktop_remotion_renderer_disabled",
			message:
				"Remotion MG prerendering is only available in Shotlyx desktop mode.",
		},
		{ status: 403 },
	);
}

function sanitizeJsString(value: unknown): string {
	return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

function hashString(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function readPositiveIntegerEnv(name: string): number | null {
	const raw = process.env[name];
	if (!raw) return null;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getFrameRenderConcurrency(): number {
	const configured =
		readPositiveIntegerEnv("SHOTLYX_MG_RENDER_FRAME_CONCURRENCY") ??
		readPositiveIntegerEnv("VITE_SHOTLYX_MG_RENDER_FRAME_CONCURRENCY") ??
		DEFAULT_FRAME_RENDER_CONCURRENCY;
	return Math.max(1, Math.min(MAX_FRAME_RENDER_CONCURRENCY, configured));
}

function getBundlerModule(): Promise<RemotionBundlerModule> {
	bundlerModulePromise ??= import("@remotion/bundler");
	return bundlerModulePromise;
}

function getRendererModule(): Promise<RemotionRendererModule> {
	rendererModulePromise ??= import("@remotion/renderer");
	return rendererModulePromise;
}

function getReusableBrowser({
	openBrowser,
}: {
	openBrowser: RemotionRendererModule["openBrowser"];
}): Promise<HeadlessBrowser> {
	reusableBrowserPromise ??= openBrowser("chrome", {
		logLevel: "warn",
	}).catch((error: unknown) => {
		reusableBrowserPromise = null;
		throw error;
	});
	return reusableBrowserPromise;
}

function buildBundleCacheKey({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): string {
	return [
		SHOTLYX_MG_RENDER_ENTRY_VERSION,
		hashString(asset.document.compiledModule),
	].join(":");
}

function rememberBundleCacheEntry({
	key,
	value,
}: {
	key: string;
	value: Promise<ShotlyxMGBundleCacheEntry>;
}) {
	bundleCache.set(key, value);
	while (bundleCache.size > MAX_BUNDLE_CACHE_ENTRIES) {
		const oldestKey = bundleCache.keys().next().value;
		if (!oldestKey) break;
		bundleCache.delete(oldestKey);
	}
}

function buildComponentModule({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): string {
	return [
		'import * as ReactRuntime from "react";',
		'import * as RemotionRuntime from "remotion";',
		"globalThis.__SHOTLYX_REMOTION_RUNTIME__ = {",
		"  React: ReactRuntime,",
		"  Remotion: RemotionRuntime,",
		`  ShotlyxMotion: ${SHOTLYX_MOTION_RUNTIME_SOURCE},`,
		"};",
		asset.document.compiledModule,
	].join("\n");
}

function buildEntryModule(): string {
	return [
		'import React from "react";',
		'import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "remotion";',
		'import ShotlyxComponent from "./ShotlyxComponent.mjs";',
		"",
		"const DEFAULT_RENDER_META = {",
		"  durationInFrames: 1,",
		"  fps: 30,",
		"  width: 16,",
		"  height: 16,",
		"};",
		"",
		"function readPositiveNumber(value, fallback) {",
		"  const parsed = Number(value);",
		"  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;",
		"}",
		"",
		"function getRenderMeta(props) {",
		"  const meta = props?.shotlyxMGRender ?? {};",
		"  return {",
		"    durationInFrames: Math.max(1, Math.floor(readPositiveNumber(meta.durationInFrames, DEFAULT_RENDER_META.durationInFrames))),",
		"    fps: readPositiveNumber(meta.fps, DEFAULT_RENDER_META.fps),",
		"    width: Math.max(1, Math.floor(readPositiveNumber(meta.width, DEFAULT_RENDER_META.width))),",
		"    height: Math.max(1, Math.floor(readPositiveNumber(meta.height, DEFAULT_RENDER_META.height))),",
		"  };",
		"}",
		"",
		"function ShotlyxMGSegment({ frameProps, frameBackgrounds }) {",
		"  const frame = useCurrentFrame();",
		"  const index = Math.max(0, Math.min((frameProps?.length ?? 1) - 1, Math.floor(frame)));",
		"  const props = frameProps?.[index] ?? {};",
		'  const background = frameBackgrounds?.[index] ?? "transparent";',
		"  return React.createElement(",
		"    AbsoluteFill,",
		"    { style: { background, overflow: 'hidden' } },",
		"    React.createElement(ShotlyxComponent, props),",
		"  );",
		"}",
		"",
		"function RemotionRoot() {",
		"  return React.createElement(Composition, {",
		'    id: "ShotlyxMGSegment",',
		"    component: ShotlyxMGSegment,",
		"    calculateMetadata: ({ props }) => getRenderMeta(props),",
		"    defaultProps: {",
		"      frameProps: [],",
		"      frameBackgrounds: [],",
		"      shotlyxMGRender: DEFAULT_RENDER_META,",
		"    },",
		"  });",
		"}",
		"",
		"registerRoot(RemotionRoot);",
	].join("\n");
}

async function createBundledShotlyxMGComponent({
	asset,
	cacheKey,
}: {
	asset: ShotlyxRemotionMGAsset;
	cacheKey: string;
}): Promise<ShotlyxMGBundleCacheEntry> {
	const tempDir = await fs.mkdtemp(
		path.join(os.tmpdir(), "shotlyx-mg-bundle-"),
	);
	const entryPoint = path.join(tempDir, "entry.mjs");
	try {
		await Promise.all([
			fs.writeFile(
				path.join(tempDir, "ShotlyxComponent.mjs"),
				buildComponentModule({ asset }),
				"utf8",
			),
			fs.writeFile(entryPoint, buildEntryModule(), "utf8"),
		]);
		const { bundle } = await getBundlerModule();
		const serveUrl = await bundle({
			entryPoint,
			ignoreRegisterRootWarning: true,
		});
		console.info(
			`[shotlyx-mg-export] bundle ready key=${cacheKey.slice(0, 32)}`,
		);
		return { serveUrl };
	} finally {
		await fs.rm(tempDir, { force: true, recursive: true }).catch(() => {});
	}
}

function getBundledShotlyxMGComponent({
	asset,
}: {
	asset: ShotlyxRemotionMGAsset;
}): Promise<ShotlyxMGBundleCacheEntry> {
	const cacheKey = buildBundleCacheKey({ asset });
	const cached = bundleCache.get(cacheKey);
	if (cached) {
		console.info(
			`[shotlyx-mg-export] bundle cache hit key=${cacheKey.slice(0, 32)}`,
		);
		return cached;
	}
	const promise = createBundledShotlyxMGComponent({ asset, cacheKey }).catch(
		(error: unknown) => {
			bundleCache.delete(cacheKey);
			throw error;
		},
	);
	rememberBundleCacheEntry({ key: cacheKey, value: promise });
	return promise;
}

function buildFramePayload({
	asset,
	durationInFrames,
	element,
	fps,
	sourceHeight,
	sourceWidth,
}: {
	asset: ShotlyxRemotionMGAsset;
	durationInFrames: number;
	element: z.infer<typeof requestSchema>["element"];
	fps: number;
	sourceHeight: number;
	sourceWidth: number;
}) {
	const frameProps: Record<string, unknown>[] = [];
	const frameBackgrounds: string[] = [];

	for (let frame = 0; frame < durationInFrames; frame += 1) {
		const localTime = Math.round((frame / fps) * MEDIA_TIME_TICKS_PER_SECOND);
		const params = resolveRemotionMGParamsAtTime({
			asset,
			element,
			localTime,
		});
		frameProps.push(
			resolveShotlyxMGInputProps({
				asset,
				params,
				mediaAssets: [],
			}),
		);
		frameBackgrounds.push(resolveShotlyxMGPlayerBackground({ asset, params }));
	}

	return {
		frameProps,
		frameBackgrounds,
		shotlyxMGRender: {
			durationInFrames,
			fps,
			height: sourceHeight,
			width: sourceWidth,
		},
	};
}

function isAnimationKey(value: unknown): value is {
	time: number;
	value: string | number | boolean;
	segmentToNext?: string;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"time" in value &&
		typeof value.time === "number" &&
		"value" in value &&
		["string", "number", "boolean"].includes(typeof value.value)
	);
}

function resolveAnimatedParam({
	animations,
	fallback,
	key,
	localTime,
}: {
	animations: unknown;
	fallback: unknown;
	key: string;
	localTime: number;
}): unknown {
	if (typeof animations !== "object" || animations === null) return fallback;
	const channel = Reflect.get(animations, `params.${key}`);
	const rawKeys =
		typeof channel === "object" &&
		channel !== null &&
		"keys" in channel &&
		Array.isArray(Reflect.get(channel, "keys"))
			? Reflect.get(channel, "keys")
			: null;
	const keys = Array.isArray(rawKeys)
		? rawKeys
				.filter(isAnimationKey)
				.sort((left, right) => left.time - right.time)
		: [];
	if (keys.length === 0) return fallback;
	const first = keys[0];
	const last = keys[keys.length - 1];
	if (!first || !last) return fallback;
	if (localTime <= first.time) return first.value;
	if (localTime >= last.time) return last.value;

	for (let index = 0; index < keys.length - 1; index += 1) {
		const left = keys[index];
		const right = keys[index + 1];
		if (!left || !right) continue;
		if (localTime < left.time || localTime > right.time) continue;
		if (
			left.segmentToNext === "hold" ||
			right.time <= left.time ||
			typeof left.value !== "number" ||
			typeof right.value !== "number"
		) {
			return left.value;
		}
		const progress = (localTime - left.time) / (right.time - left.time);
		return left.value + (right.value - left.value) * progress;
	}

	return fallback;
}

function resolveRemotionMGParamsAtTime({
	asset,
	element,
	localTime,
}: {
	asset: ShotlyxRemotionMGAsset;
	element: z.infer<typeof requestSchema>["element"];
	localTime: number;
}): Record<string, unknown> {
	const params: Record<string, unknown> = {
		...(element.motionGraphicBaseParams ?? {}),
		...element.params,
	};
	const keys = new Set([
		...asset.document.propsSchema.map((prop) => prop.key),
		SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
		SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
		"progress",
	]);
	for (const key of keys) {
		const animated = resolveAnimatedParam({
			animations: element.animations,
			fallback: params[key],
			key,
			localTime,
		});
		if (
			typeof animated === "string" ||
			typeof animated === "number" ||
			typeof animated === "boolean"
		) {
			params[key] = animated;
		}
	}
	return params;
}

function createRenderProgressLogger({
	assetName,
	durationInFrames,
}: {
	assetName: string;
	durationInFrames: number;
}) {
	let lastLoggedPercent = -1;
	return (framesRendered: number) => {
		const percent = Math.max(
			0,
			Math.min(100, Math.floor((framesRendered / durationInFrames) * 100)),
		);
		if (
			percent < 100 &&
			lastLoggedPercent >= 0 &&
			percent < lastLoggedPercent + 10
		) {
			return;
		}
		lastLoggedPercent = percent;
		console.info(
			`[shotlyx-mg-export] render ${percent}% ${assetName} ` +
				`frames=${framesRendered}/${durationInFrames}`,
		);
	};
}

type ShotlyxMGRenderStreamEvent =
	| {
			type: "started";
			durationSeconds: number;
			fps: number;
			frameCount: number;
			height: number;
			width: number;
	  }
	| {
			type: "progress";
			frameCount: number;
			framesRendered: number;
			progress: number;
	  }
	| {
			type: "frame";
			data: string;
			frame: number;
			mimeType: "image/png";
	  }
	| {
			type: "completed";
			durationSeconds: number;
			fps: number;
			frameCount: number;
			height: number;
			width: number;
	  }
	| {
			type: "error";
			error: string;
	  };

function createRenderEventStream({
	headers,
	run,
}: {
	headers: HeadersInit;
	run: (
		send: (event: ShotlyxMGRenderStreamEvent) => void,
		signal: AbortSignal,
	) => Promise<void>;
}) {
	const abortController = new AbortController();
	const encoder = new TextEncoder();
	let isClosed = false;
	const body = new ReadableStream({
		start(controller) {
			const send = (event: ShotlyxMGRenderStreamEvent) => {
				if (isClosed) return;
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			void run(send, abortController.signal)
				.catch((error) => {
					const message =
						error instanceof Error ? error.message : String(error);
					console.error("[shotlyx-mg-export] render stream failed:", error);
					send({ type: "error", error: message });
				})
				.finally(() => {
					if (isClosed) return;
					isClosed = true;
					controller.close();
				});
		},
		cancel() {
			isClosed = true;
			abortController.abort();
		},
	});

	const responseHeaders = new Headers(headers);
	responseHeaders.set("Content-Type", "application/x-ndjson; charset=utf-8");
	return new Response(body, { headers: responseHeaders });
}

export async function POST(request: Request) {
	if (!isDesktopMode()) return disabledResponse();

	const parsed = requestSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json(
			{
				error: "invalid_remotion_mg_render_request",
				issues: parsed.error.issues,
			},
			{ status: 400 },
		);
	}
	if (!isShotlyxRemotionMGAsset(parsed.data.asset)) {
		return Response.json(
			{ error: "invalid_remotion_mg_asset" },
			{ status: 400 },
		);
	}

	const asset = parsed.data.asset;
	const fps = parsed.data.fps.numerator / parsed.data.fps.denominator;
	const ticksPerFrame = Math.round(
		(MEDIA_TIME_TICKS_PER_SECOND * parsed.data.fps.denominator) /
			parsed.data.fps.numerator,
	);
	const durationInFrames = Math.max(
		1,
		Math.floor(parsed.data.element.duration / ticksPerFrame),
	);
	const inputProps = buildFramePayload({
		asset,
		durationInFrames,
		element: parsed.data.element,
		fps,
		sourceHeight: parsed.data.sourceHeight,
		sourceWidth: parsed.data.sourceWidth,
	});
	const startedAt = Date.now();

	return createRenderEventStream({
		headers: {
			"X-Shotlyx-MG-Frames": String(durationInFrames),
			"X-Shotlyx-MG-Source-Height": String(parsed.data.sourceHeight),
			"X-Shotlyx-MG-Source-Width": String(parsed.data.sourceWidth),
			"X-Shotlyx-MG-Render-Input-Bytes": String(
				sanitizeJsString(inputProps).length,
			),
		},
		run: async (send, signal) => {
			console.info(
				`[shotlyx-mg-export] render start ${asset.name} ` +
					`frames=${durationInFrames} fps=${fps} source=${parsed.data.sourceWidth}x${parsed.data.sourceHeight}`,
			);
			send({
				type: "started",
				durationSeconds: durationInFrames / fps,
				fps,
				frameCount: durationInFrames,
				height: parsed.data.sourceHeight,
				width: parsed.data.sourceWidth,
			});

			const [
				{ serveUrl },
				{ makeCancelSignal, openBrowser, renderFrames, selectComposition },
			] = await Promise.all([
				getBundledShotlyxMGComponent({ asset }),
				getRendererModule(),
			]);
			const puppeteerInstance = await getReusableBrowser({ openBrowser });
			const composition = await selectComposition({
				serveUrl,
				id: "ShotlyxMGSegment",
				inputProps,
				logLevel: "warn",
				puppeteerInstance,
			});

			const logFrameProgress = createRenderProgressLogger({
				assetName: asset.name,
				durationInFrames,
			});
			const remotionCancel = makeCancelSignal();
			const cancelRemotionRender = () => remotionCancel.cancel();
			if (signal.aborted) {
				cancelRemotionRender();
			}
			signal.addEventListener("abort", cancelRemotionRender, { once: true });

			try {
				await renderFrames({
					serveUrl,
					composition,
					inputProps,
					imageFormat: "png",
					outputDir: null,
					muted: true,
					logLevel: "warn",
					concurrency: getFrameRenderConcurrency(),
					cancelSignal: remotionCancel.cancelSignal,
					puppeteerInstance,
					onFrameBuffer: (buffer, frame) => {
						send({
							type: "frame",
							data: buffer.toString("base64"),
							frame,
							mimeType: "image/png",
						});
					},
					onFrameUpdate: (framesRendered) => {
						logFrameProgress(framesRendered);
						send({
							type: "progress",
							frameCount: durationInFrames,
							framesRendered,
							progress: Math.min(
								1,
								Math.max(0, framesRendered / durationInFrames),
							),
						});
					},
					onStart: () => undefined,
				});
			} finally {
				signal.removeEventListener("abort", cancelRemotionRender);
			}

			console.info(
				`[shotlyx-mg-export] render done ${asset.name} ` +
					`frames=${durationInFrames} elapsedMs=${Date.now() - startedAt}`,
			);
			send({
				type: "completed",
				durationSeconds: durationInFrames / fps,
				fps,
				frameCount: durationInFrames,
				height: parsed.data.sourceHeight,
				width: parsed.data.sourceWidth,
			});
		},
	});
}
