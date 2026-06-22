import type { FrameRate } from "opencut-wasm";
import { frameRateToFloat } from "@/fps/utils";
import type { TCanvasSize } from "@/project/types";
import type { MediaTime } from "@/wasm";
import { mediaTimeToSeconds } from "@/wasm";
import type { ExportFastPathAnalysis } from "./export-fast-path";
import type { SceneExporterProfile } from "./scene-exporter";

export type ExportPhaseTiming = {
	name: string;
	durationMs: number;
};

export function nowMs(): number {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export async function measureExportPhase<T>({
	fn,
	name,
	onMeasure,
}: {
	fn: () => Promise<T>;
	name: string;
	onMeasure: (timing: ExportPhaseTiming) => void;
}): Promise<T> {
	const startedAt = nowMs();
	try {
		return await fn();
	} finally {
		onMeasure({ name, durationMs: nowMs() - startedAt });
	}
}

export function measureExportPhaseSync<T>({
	fn,
	name,
	onMeasure,
}: {
	fn: () => T;
	name: string;
	onMeasure: (timing: ExportPhaseTiming) => void;
}): T {
	const startedAt = nowMs();
	try {
		return fn();
	} finally {
		onMeasure({ name, durationMs: nowMs() - startedAt });
	}
}

export function logExportPerformanceSummary({
	canvasSize,
	duration,
	fastPath,
	fps,
	includeAudio,
	phaseTimings,
	sceneExporterProfile,
	startedAt,
}: {
	canvasSize: TCanvasSize;
	duration: MediaTime;
	fastPath: ExportFastPathAnalysis;
	fps: FrameRate;
	includeAudio: boolean;
	phaseTimings: ExportPhaseTiming[];
	sceneExporterProfile?: SceneExporterProfile | null;
	startedAt: number;
}): void {
	const totalMs = nowMs() - startedAt;
	const durationSeconds = mediaTimeToSeconds({ time: duration });
	const fpsFloat = frameRateToFloat(fps);
	const phaseSummary = Object.fromEntries(
		phaseTimings.map((timing) => [timing.name, roundMs(timing.durationMs)]),
	);
	const summary = {
		totalMs: roundMs(totalMs),
		durationSeconds: roundMs(durationSeconds),
		fps: roundMs(fpsFloat),
		canvas: `${canvasSize.width}x${canvasSize.height}`,
		includeAudio,
		fastPath: fastPath.eligible
			? {
					eligible: true,
					kind: fastPath.kind,
					audioMode: fastPath.audioMode,
					mediaId: fastPath.mediaId,
				}
			: {
					eligible: false,
					reasons: fastPath.reasons,
				},
		phases: phaseSummary,
		sceneExporter: sceneExporterProfile
			? {
					frames: sceneExporterProfile.frameCount,
					totalMs: roundMs(sceneExporterProfile.totalMs),
					renderMs: roundMs(sceneExporterProfile.renderMs),
					encodeAddMs: roundMs(sceneExporterProfile.encodeAddMs),
					finalizeMs: roundMs(sceneExporterProfile.finalizeMs),
					avgRenderMs: roundMs(
						averageMs({
							count: sceneExporterProfile.frameCount,
							total: sceneExporterProfile.renderMs,
						}),
					),
					avgEncodeAddMs: roundMs(
						averageMs({
							count: sceneExporterProfile.frameCount,
							total: sceneExporterProfile.encodeAddMs,
						}),
					),
				}
			: null,
	};
	console.info("[shotlyx-export-perf]", summary);
}

function averageMs({ count, total }: { count: number; total: number }): number {
	return count > 0 ? total / count : 0;
}

function roundMs(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.round(value * 100) / 100;
}
