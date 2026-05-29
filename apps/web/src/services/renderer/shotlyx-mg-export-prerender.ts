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

async function renderShotlyxMGSegment({
	fps,
	index,
	job,
	signal,
	total,
}: {
	fps: FrameRate;
	index: number;
	job: ShotlyxMGExportPrerenderJob;
	signal?: AbortSignal;
	total: number;
}): Promise<ShotlyxMGFrameSequenceRender> {
	const startedAt = Date.now();
	console.info(
		`[shotlyx-mg-export] request ${index + 1}/${total} ${job.asset.name} ` +
			`duration=${job.durationSeconds.toFixed(2)}s source=${job.sourceWidth}x${job.sourceHeight}`,
	);
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

	const payload: unknown = await response.json();
	if (!isShotlyxMGRenderFrameSequenceResponse(payload)) {
		throw new Error("Remotion MG prerender returned an unsupported payload");
	}
	const mediaId = `shotlyx-mg-render-${job.trackId}-${job.element.id}`;
	const frames = payload.frames.map((frame) => {
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
	console.info(
		`[shotlyx-mg-export] received ${index + 1}/${total} ${job.asset.name} ` +
			`frames=${payload.frameCount} elapsedMs=${Date.now() - startedAt}`,
	);
	return {
		id: mediaId,
		name: `${job.asset.name} · export render`,
		type: "shotlyx-mg-frame-sequence",
		frames,
		width: payload.width,
		height: payload.height,
		duration: job.durationSeconds,
		ephemeral: true,
	};
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
	onProgress?: (progress: number) => void;
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
			`source=${jobs[0]?.sourceWidth ?? 0}x${jobs[0]?.sourceHeight ?? 0}`,
	);
	onProgress?.(0.05);
	const renderedAssets: ShotlyxMGFrameSequenceRender[] = [];
	for (let index = 0; index < jobs.length; index += 1) {
		const job = jobs[index];
		if (!job) continue;
		onProgress?.((index + 0.1) / jobs.length);
		const asset = await renderShotlyxMGSegment({
			fps,
			index,
			job,
			signal,
			total: jobs.length,
		});
		renderedAssets.push(asset);
		renderMap.set(
			buildShotlyxMGExportRenderKey({
				elementId: job.element.id,
				trackId: job.trackId,
			}),
			asset,
		);
		onProgress?.((index + 1) / jobs.length);
	}
	console.info(
		`[shotlyx-mg-export] prerender done segments=${renderedAssets.length}`,
	);

	return {
		mediaAssets,
		renderMap,
	};
}
