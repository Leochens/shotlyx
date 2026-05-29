import fs from "node:fs/promises";
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
		"};",
		asset.document.compiledModule,
	].join("\n");
}

function buildEntryModule({
	durationInFrames,
	fps,
	sourceHeight,
	sourceWidth,
}: {
	durationInFrames: number;
	fps: number;
	sourceHeight: number;
	sourceWidth: number;
}): string {
	return [
		'import React from "react";',
		'import { AbsoluteFill, Composition, registerRoot, useCurrentFrame } from "remotion";',
		'import ShotlyxComponent from "./ShotlyxComponent.mjs";',
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
		`    durationInFrames: ${durationInFrames},`,
		`    fps: ${fps},`,
		`    width: ${sourceWidth},`,
		`    height: ${sourceHeight},`,
		"    defaultProps: { frameProps: [], frameBackgrounds: [] },",
		"  });",
		"}",
		"",
		"registerRoot(RemotionRoot);",
	].join("\n");
}

function buildFramePayload({
	asset,
	durationInFrames,
	element,
	fps,
}: {
	asset: ShotlyxRemotionMGAsset;
	durationInFrames: number;
	element: z.infer<typeof requestSchema>["element"];
	fps: number;
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

	return { frameProps, frameBackgrounds };
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
	const keys =
		typeof channel === "object" &&
		channel !== null &&
		"keys" in channel &&
		Array.isArray(Reflect.get(channel, "keys"))
			? Reflect.get(channel, "keys")
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
	run: (send: (event: ShotlyxMGRenderStreamEvent) => void) => Promise<void>;
}) {
	const encoder = new TextEncoder();
	let isClosed = false;
	const body = new ReadableStream({
		start(controller) {
			const send = (event: ShotlyxMGRenderStreamEvent) => {
				if (isClosed) return;
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			void run(send)
				.catch((error) => {
					const message = error instanceof Error ? error.message : String(error);
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
		run: async (send) => {
			const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shotlyx-mg-"));
			const entryPoint = path.join(tempDir, "entry.mjs");

			try {
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
				await fs.writeFile(
					path.join(tempDir, "ShotlyxComponent.mjs"),
					buildComponentModule({ asset }),
					"utf8",
				);
				await fs.writeFile(
					entryPoint,
					buildEntryModule({
						durationInFrames,
						fps,
						sourceHeight: parsed.data.sourceHeight,
						sourceWidth: parsed.data.sourceWidth,
					}),
					"utf8",
				);

				const [{ bundle }, { renderFrames, selectComposition }] =
					await Promise.all([
						import("@remotion/bundler"),
						import("@remotion/renderer"),
					]);
				const serveUrl = await bundle({
					entryPoint,
					ignoreRegisterRootWarning: true,
				});
				const composition = await selectComposition({
					serveUrl,
					id: "ShotlyxMGSegment",
					inputProps,
					logLevel: "warn",
				});

				const logFrameProgress = createRenderProgressLogger({
					assetName: asset.name,
					durationInFrames,
				});

				await renderFrames({
					serveUrl,
					composition,
					inputProps,
					imageFormat: "png",
					outputDir: null,
					muted: true,
					logLevel: "warn",
					concurrency: 1,
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
			} finally {
				await fs.rm(tempDir, { force: true, recursive: true }).catch(() => {});
			}
		},
	});
}
