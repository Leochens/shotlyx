import type { FrameRate } from "opencut-wasm";
import type { MediaAsset } from "@/media/types";
import {
	SHOTLYX_MG_GRAPHIC_DEFINITION_ID,
	shotlyxMediaTimeToSeconds,
} from "@/shotlyx/remotion-components/project-assets";
import type {
	ShotlyxMGAsset,
	ShotlyxRemotionMGAsset,
} from "@/shotlyx/remotion-components/types";
import { isShotlyxRemotionMGAsset } from "@/shotlyx/remotion-components/types";
import type {
	GraphicElement,
	SceneTracks,
	TimelineTrack,
} from "@/timeline/types";
import { estimateExportRemainingSeconds } from "@/export/progress";
import { getShotlyxMGExportSourceRect } from "./nodes/graphic-node";
import type { ImageSequenceFrame } from "./nodes/image-sequence-node";

export interface ShotlyxMGFrameSequenceRender {
	id: string;
	name: string;
	type: "shotlyx-mg-frame-sequence";
	frames: ImageSequenceFrame[];
	width: number;
	height: number;
	duration: number;
	ephemeral: true;
}

export type ShotlyxMGExportRender = MediaAsset | ShotlyxMGFrameSequenceRender;
export type ShotlyxMGExportRenderMap = Map<string, ShotlyxMGExportRender>;

const DEFAULT_PRERENDER_CONCURRENCY = 2;
const MAX_PRERENDER_CONCURRENCY = 3;

interface ShotlyxMGRenderFrameSequenceResponse {
	type: "shotlyx-mg-frame-sequence";
	durationSeconds: number;
	fps: number;
	frameCount: number;
	frames: Array<{
		data: string;
		frame: number;
		mimeType: "image/png";
	}>;
	height: number;
	width: number;
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

export interface ShotlyxMGExportPrerenderProgress {
	estimatedRemainingSeconds?: number | null;
	frameCount?: number;
	frameIndex?: number;
	frameProgress?: number;
	progress: number;
	segmentCount: number;
	segmentIndex: number;
	segmentName: string;
}

function isShotlyxMGRenderFrameSequenceResponse(
	value: unknown,
): value is ShotlyxMGRenderFrameSequenceResponse {
	if (typeof value !== "object" || value === null) return false;
	const frames = Reflect.get(value, "frames");
	return (
		Reflect.get(value, "type") === "shotlyx-mg-frame-sequence" &&
		typeof Reflect.get(value, "durationSeconds") === "number" &&
		typeof Reflect.get(value, "fps") === "number" &&
		typeof Reflect.get(value, "frameCount") === "number" &&
		Array.isArray(frames) &&
		typeof Reflect.get(value, "height") === "number" &&
		typeof Reflect.get(value, "width") === "number"
	);
}

function isShotlyxMGRenderStreamEvent(
	value: unknown,
): value is ShotlyxMGRenderStreamEvent {
	if (typeof value !== "object" || value === null) return false;
	const type = Reflect.get(value, "type");
	return (
		type === "started" ||
		type === "progress" ||
		type === "frame" ||
		type === "completed" ||
		type === "error"
	);
}

interface ShotlyxMGExportPrerenderJob {
	asset: ShotlyxRemotionMGAsset;
	durationSeconds: number;
	element: GraphicElement;
	sourceHeight: number;
	sourceWidth: number;
	trackId: string;
}

export function buildShotlyxMGExportRenderKey({
	elementId,
	trackId,
}: {
	elementId: string;
	trackId: string;
}): string {
	return `${trackId}:${elementId}`;
}

export function getShotlyxMGExportRender({
	elementId,
	renderMap,
	trackId,
}: {
	elementId: string;
	renderMap?: ShotlyxMGExportRenderMap;
	trackId: string;
}): ShotlyxMGExportRender | null {
	return (
		renderMap?.get(buildShotlyxMGExportRenderKey({ elementId, trackId })) ??
		null
	);
}

export function isShotlyxMGFrameSequenceRender(
	value: ShotlyxMGExportRender | null,
): value is ShotlyxMGFrameSequenceRender {
	return value?.type === "shotlyx-mg-frame-sequence";
}

function isTrackHidden(track: TimelineTrack): boolean {
	return "hidden" in track && track.hidden === true;
}

function getGraphicAssetId({
	element,
}: {
	element: GraphicElement;
}): string | null {
	const value =
		element.motionGraphicAssetId ??
		element.motionGraphicBaseParams?.shotlyxMGAssetId ??
		element.params.shotlyxMGAssetId;
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function collectShotlyxMGExportPrerenderJobs({
	shotlyxMGAssets,
	tracks,
}: {
	shotlyxMGAssets: ShotlyxMGAsset[];
	tracks: SceneTracks;
}): ShotlyxMGExportPrerenderJob[] {
	const assetById = new Map(shotlyxMGAssets.map((asset) => [asset.id, asset]));
	const visibleTracks = [
		...tracks.overlay.filter((track) => !isTrackHidden(track)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	const jobs: ShotlyxMGExportPrerenderJob[] = [];

	for (const track of visibleTracks) {
		for (const element of track.elements) {
			if (
				element.type !== "graphic" ||
				element.definitionId !== SHOTLYX_MG_GRAPHIC_DEFINITION_ID ||
				("hidden" in element && element.hidden)
			) {
				continue;
			}
			const assetId = getGraphicAssetId({ element });
			const asset = assetId ? assetById.get(assetId) : null;
			if (!asset || !isShotlyxRemotionMGAsset(asset)) {
				continue;
			}
			const sourceRect = getShotlyxMGExportSourceRect({
				height: asset.document.height,
				width: asset.document.width,
			});
			jobs.push({
				asset,
				durationSeconds: shotlyxMediaTimeToSeconds({ time: element.duration }),
				element,
				sourceHeight: sourceRect.height,
				sourceWidth: sourceRect.width,
				trackId: track.id,
			});
		}
	}

	return jobs;
}

function clampProgress(progress: number): number {
	if (!Number.isFinite(progress)) return 0;
	return Math.min(1, Math.max(0, progress));
}

function readPositiveIntegerEnv(name: string): number | null {
	const raw = process.env[name];
	if (!raw) return null;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getShotlyxMGExportPrerenderConcurrency({
	jobCount,
}: {
	jobCount: number;
}): number {
	if (jobCount <= 0) return 0;
	const configured =
		readPositiveIntegerEnv("VITE_SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY") ??
		readPositiveIntegerEnv("SHOTLYX_MG_EXPORT_PRERENDER_CONCURRENCY") ??
		DEFAULT_PRERENDER_CONCURRENCY;
	return Math.max(1, Math.min(jobCount, MAX_PRERENDER_CONCURRENCY, configured));
}

function createAbortError(): Error {
	if (typeof DOMException !== "undefined") {
		return new DOMException("The operation was aborted.", "AbortError");
	}
	const error = new Error("The operation was aborted.");
	error.name = "AbortError";
	return error;
}

function createForwardedAbortController(signal?: AbortSignal): {
	controller: AbortController;
	cleanup: () => void;
} {
	const controller = new AbortController();
	if (!signal) {
		return { controller, cleanup: () => undefined };
	}
	const abort = () => controller.abort();
	if (signal.aborted) {
		abort();
		return { controller, cleanup: () => undefined };
	}
	signal.addEventListener("abort", abort, { once: true });
	return {
		controller,
		cleanup: () => signal.removeEventListener("abort", abort),
	};
}

function getFrameRateNumber(fps: FrameRate): number {
	if (typeof fps === "number") return fps;
	const numerator = Reflect.get(fps, "numerator");
	const denominator = Reflect.get(fps, "denominator");
	if (
		typeof numerator === "number" &&
		typeof denominator === "number" &&
		denominator > 0
	) {
		return numerator / denominator;
	}
	return 30;
}

function createFrameSequenceFromPayload({
	mediaId,
	payload,
}: {
	mediaId: string;
	payload: ShotlyxMGRenderFrameSequenceResponse;
}): ShotlyxMGFrameSequenceRender {
	const frames = payload.frames
		.slice()
		.sort((left, right) => left.frame - right.frame)
		.map((frame) => {
			const binary = Uint8Array.from(atob(frame.data), (char) =>
				char.charCodeAt(0),
			);
			const file = new File([binary], `${mediaId}-${frame.frame}.png`, {
				type: frame.mimeType,
				lastModified: Date.now(),
			});
			return {
				file,
				url: URL.createObjectURL(file),
			};
		});

	return {
		id: mediaId,
		name: mediaId,
		type: "shotlyx-mg-frame-sequence",
		frames,
		width: payload.width,
		height: payload.height,
		duration: payload.durationSeconds,
		ephemeral: true,
	};
}

async function readShotlyxMGRenderFrameSequence({
	mediaId,
	onProgress,
	response,
}: {
	mediaId: string;
	onProgress?: (event: {
		frameCount?: number;
		frameIndex?: number;
		frameProgress?: number;
	}) => void;
	response: Response;
}): Promise<ShotlyxMGFrameSequenceRender> {
	const contentType = response.headers.get("Content-Type") ?? "";
	if (!contentType.includes("application/x-ndjson") || !response.body) {
		const payload: unknown = await response.json();
		if (!isShotlyxMGRenderFrameSequenceResponse(payload)) {
			throw new Error("Remotion MG prerender returned an unsupported payload");
		}
		return createFrameSequenceFromPayload({ mediaId, payload });
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const frames: ShotlyxMGRenderFrameSequenceResponse["frames"] = [];
	let summary: Omit<ShotlyxMGRenderFrameSequenceResponse, "frames"> | null = null;

	const handleLine = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed) return;
		const parsed: unknown = JSON.parse(trimmed);
		if (!isShotlyxMGRenderStreamEvent(parsed)) {
			throw new Error("Remotion MG prerender returned an invalid stream event");
		}
		if (parsed.type === "error") {
			throw new Error(parsed.error);
		}
		if (parsed.type === "started") {
			summary = {
				type: "shotlyx-mg-frame-sequence",
				durationSeconds: parsed.durationSeconds,
				fps: parsed.fps,
				frameCount: parsed.frameCount,
				height: parsed.height,
				width: parsed.width,
			};
			onProgress?.({
				frameCount: parsed.frameCount,
				frameIndex: 0,
				frameProgress: 0,
			});
			return;
		}
		if (parsed.type === "progress") {
			const frameProgress = clampProgress(parsed.progress);
			onProgress?.({
				frameCount: parsed.frameCount,
				frameIndex: parsed.framesRendered,
				frameProgress,
			});
			return;
		}
		if (parsed.type === "frame") {
			frames.push({
				data: parsed.data,
				frame: parsed.frame,
				mimeType: parsed.mimeType,
			});
			return;
		}
		summary = {
			type: "shotlyx-mg-frame-sequence",
			durationSeconds: parsed.durationSeconds,
			fps: parsed.fps,
			frameCount: parsed.frameCount,
			height: parsed.height,
			width: parsed.width,
		};
		onProgress?.({
			frameCount: parsed.frameCount,
			frameIndex: parsed.frameCount,
			frameProgress: 1,
		});
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let newlineIndex = buffer.indexOf("\n");
		while (newlineIndex >= 0) {
			handleLine(buffer.slice(0, newlineIndex));
			buffer = buffer.slice(newlineIndex + 1);
			newlineIndex = buffer.indexOf("\n");
		}
	}
	buffer += decoder.decode();
	handleLine(buffer);

	const finalSummary =
		summary as Omit<ShotlyxMGRenderFrameSequenceResponse, "frames"> | null;
	if (!finalSummary) {
		throw new Error("Remotion MG prerender finished without a summary event");
	}

	return createFrameSequenceFromPayload({
		mediaId,
		payload: {
			...finalSummary,
			frames,
		},
	});
}

async function renderShotlyxMGSegment({
	fps,
	index,
	job,
	onProgress,
	signal,
	total,
}: {
	fps: FrameRate;
	index: number;
	job: ShotlyxMGExportPrerenderJob;
	onProgress?: (event: ShotlyxMGExportPrerenderProgress) => void;
	signal?: AbortSignal;
	total: number;
}): Promise<ShotlyxMGFrameSequenceRender> {
	const startedAt = Date.now();
	const mediaId = `shotlyx-mg-render-${job.trackId}-${job.element.id}`;
	const estimatedFrameCount = Math.max(
		1,
		Math.ceil(job.durationSeconds * getFrameRateNumber(fps)),
	);
	const estimatedRenderMs = Math.max(2500, job.durationSeconds * 2500);
	let lastFrameProgress = 0;
	let hasRealFrameProgress = false;
	const emitProgress = ({
		frameCount,
		frameIndex,
		frameProgress,
	}: {
		frameCount?: number;
		frameIndex?: number;
		frameProgress?: number;
	}) => {
		const safeFrameProgress = Math.max(
			lastFrameProgress,
			clampProgress(frameProgress ?? 0),
		);
		lastFrameProgress = safeFrameProgress;
		onProgress?.({
			estimatedRemainingSeconds: estimateExportRemainingSeconds({
				elapsedMs: Date.now() - startedAt,
				progress: safeFrameProgress,
			}),
			frameCount,
			frameIndex,
			frameProgress: safeFrameProgress,
			progress: (index + safeFrameProgress) / total,
			segmentCount: total,
			segmentIndex: index,
			segmentName: job.asset.name,
		});
	};
	console.info(
		`[shotlyx-mg-export] request ${index + 1}/${total} ${job.asset.name} ` +
			`duration=${job.durationSeconds.toFixed(2)}s source=${job.sourceWidth}x${job.sourceHeight}`,
	);
	emitProgress({ frameProgress: 0 });
	const syntheticProgressInterval = setInterval(() => {
		if (hasRealFrameProgress || signal?.aborted) return;
		const elapsedMs = Date.now() - startedAt;
		const frameProgress = Math.min(0.92, elapsedMs / estimatedRenderMs);
		emitProgress({
			frameCount: estimatedFrameCount,
			frameIndex: Math.max(1, Math.floor(frameProgress * estimatedFrameCount)),
			frameProgress,
		});
	}, 500);

	try {
		const response = await fetch("/api/desktop/remotion/mg-render", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				asset: job.asset,
				element: {
					animations: job.element.animations,
					definitionId: job.element.definitionId,
					duration: job.element.duration,
					motionGraphicBaseParams: job.element.motionGraphicBaseParams,
					params: job.element.params,
				},
				fps,
				sourceHeight: job.sourceHeight,
				sourceWidth: job.sourceWidth,
			}),
			signal,
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`Remotion MG prerender failed (${response.status}): ${
					body || response.statusText
				}`,
			);
		}

		const render = await readShotlyxMGRenderFrameSequence({
			mediaId,
			onProgress: (event) => {
				if ((event.frameProgress ?? 0) > 0) {
					hasRealFrameProgress = true;
				}
				emitProgress(event);
			},
			response,
		});
		console.info(
			`[shotlyx-mg-export] received ${index + 1}/${total} ${job.asset.name} ` +
				`frames=${render.frames.length} elapsedMs=${Date.now() - startedAt}`,
		);
		return {
			...render,
			name: `${job.asset.name} · export render`,
			duration: job.durationSeconds,
		};
	} finally {
		clearInterval(syntheticProgressInterval);
	}
}

export async function prerenderShotlyxMGExportSegments({
	fps,
	mediaAssets,
	onProgress,
	shotlyxMGAssets,
	signal,
	tracks,
}: {
	fps: FrameRate;
	mediaAssets: MediaAsset[];
	onProgress?: (event: ShotlyxMGExportPrerenderProgress) => void;
	shotlyxMGAssets: ShotlyxMGAsset[];
	signal?: AbortSignal;
	tracks: SceneTracks;
}): Promise<{
	mediaAssets: MediaAsset[];
	renderMap: ShotlyxMGExportRenderMap;
}> {
	if (process.env.VITE_SHOTLYX_DESKTOP !== "1") {
		return { mediaAssets, renderMap: new Map() };
	}

	const jobs = collectShotlyxMGExportPrerenderJobs({
		shotlyxMGAssets,
		tracks,
	});
	const renderMap: ShotlyxMGExportRenderMap = new Map();
	if (jobs.length === 0) {
		console.info("[shotlyx-mg-export] no Remotion MG segments to prerender");
		return { mediaAssets, renderMap };
	}

	console.info(
		`[shotlyx-mg-export] prerender start segments=${jobs.length} ` +
			`concurrency=${getShotlyxMGExportPrerenderConcurrency({ jobCount: jobs.length })} ` +
			`source=${jobs[0]?.sourceWidth ?? 0}x${jobs[0]?.sourceHeight ?? 0}`,
	);
	onProgress?.({
		frameProgress: 0,
		progress: 0,
		segmentCount: jobs.length,
		segmentIndex: 0,
		segmentName: jobs[0]?.asset.name ?? "",
	});
	const progressByJob = Array.from({ length: jobs.length }, () => 0);
	const { cleanup, controller } = createForwardedAbortController(signal);
	const renderSignal = controller.signal;
	let completedCount = 0;
	let nextJobIndex = 0;

	const emitAggregatedProgress = (
		event: ShotlyxMGExportPrerenderProgress,
	) => {
		progressByJob[event.segmentIndex] = Math.max(
			progressByJob[event.segmentIndex] ?? 0,
			clampProgress(event.frameProgress ?? event.progress),
		);
		const totalProgress =
			progressByJob.reduce((sum, progress) => sum + progress, 0) / jobs.length;
		onProgress?.({
			...event,
			progress: totalProgress,
		});
	};

	const renderNextJob = async () => {
		while (nextJobIndex < jobs.length) {
			if (renderSignal.aborted) {
				throw createAbortError();
			}
			const index = nextJobIndex;
			nextJobIndex += 1;
			const job = jobs[index];
			if (!job) continue;
			const asset = await renderShotlyxMGSegment({
				fps,
				index,
				job,
				onProgress: emitAggregatedProgress,
				signal: renderSignal,
				total: jobs.length,
			});
			renderMap.set(
				buildShotlyxMGExportRenderKey({
					elementId: job.element.id,
					trackId: job.trackId,
				}),
				asset,
			);
			completedCount += 1;
			emitAggregatedProgress({
				estimatedRemainingSeconds: null,
				frameCount: asset.frames.length,
				frameIndex: asset.frames.length,
				frameProgress: 1,
				progress: 1,
				segmentCount: jobs.length,
				segmentIndex: index,
				segmentName: job.asset.name,
			});
		}
	};

	try {
		await Promise.all(
			Array.from(
				{
					length: getShotlyxMGExportPrerenderConcurrency({
						jobCount: jobs.length,
					}),
				},
				() => renderNextJob(),
			),
		);
	} catch (error) {
		controller.abort();
		throw error;
	} finally {
		cleanup();
	}
	console.info(
		`[shotlyx-mg-export] prerender done segments=${completedCount}`,
	);

	return {
		mediaAssets,
		renderMap,
	};
}
