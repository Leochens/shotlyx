import type { FrameRate } from "opencut-wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { MediaAsset } from "@/media/types";
import type { TCanvasSize } from "@/project/types";
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
import { getShotlyxMGExportSourceSize } from "./nodes/graphic-node";

export type ShotlyxMGExportRenderMap = Map<string, MediaAsset>;

interface ShotlyxMGExportPrerenderJob {
	asset: ShotlyxRemotionMGAsset;
	durationSeconds: number;
	element: GraphicElement;
	sourceSize: number;
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
}): MediaAsset | null {
	return (
		renderMap?.get(buildShotlyxMGExportRenderKey({ elementId, trackId })) ??
		null
	);
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
	canvasSize,
	shotlyxMGAssets,
	tracks,
}: {
	canvasSize: TCanvasSize;
	shotlyxMGAssets: ShotlyxMGAsset[];
	tracks: SceneTracks;
}): ShotlyxMGExportPrerenderJob[] {
	const assetById = new Map(shotlyxMGAssets.map((asset) => [asset.id, asset]));
	const visibleTracks = [
		...tracks.overlay.filter((track) => !isTrackHidden(track)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	const sourceSize = getShotlyxMGExportSourceSize(canvasSize);
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
			jobs.push({
				asset,
				durationSeconds: shotlyxMediaTimeToSeconds({ time: element.duration }),
				element,
				sourceSize,
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
}): Promise<MediaAsset> {
	const startedAt = Date.now();
	console.info(
		`[shotlyx-mg-export] request ${index + 1}/${total} ${job.asset.name} ` +
			`duration=${job.durationSeconds.toFixed(2)}s source=${job.sourceSize}`,
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
			sourceSize: job.sourceSize,
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

	const blob = await response.blob();
	const mediaId = `shotlyx-mg-render-${job.trackId}-${job.element.id}`;
	const file = new File([blob], `${mediaId}.webm`, {
		type: "video/webm",
		lastModified: Date.now(),
	});
	console.info(
		`[shotlyx-mg-export] received ${index + 1}/${total} ${job.asset.name} ` +
			`bytes=${blob.size} elapsedMs=${Date.now() - startedAt}`,
	);
	return {
		id: mediaId,
		name: `${job.asset.name} · export render`,
		type: "video",
		file,
		url: URL.createObjectURL(file),
		width: job.sourceSize,
		height: job.sourceSize,
		duration: job.durationSeconds,
		fps: frameRateToFloat(fps),
		hasAudio: false,
		ephemeral: true,
	};
}

export async function prerenderShotlyxMGExportSegments({
	canvasSize,
	fps,
	mediaAssets,
	onProgress,
	shotlyxMGAssets,
	signal,
	tracks,
}: {
	canvasSize: TCanvasSize;
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
		canvasSize,
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
			`source=${jobs[0]?.sourceSize ?? 0}`,
	);
	onProgress?.(0.05);
	const renderedAssets: MediaAsset[] = [];
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
		mediaAssets: [...mediaAssets, ...renderedAssets],
		renderMap,
	};
}
