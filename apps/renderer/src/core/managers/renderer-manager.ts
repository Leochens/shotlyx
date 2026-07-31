import type { EditorCore } from "@/core";
import type { RootNode } from "@/services/renderer/nodes/root-node";
import type {
	ExportOptions,
	ExportOutputTarget,
	ExportProgressUpdate,
	ExportResult,
} from "@/export";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { SceneExporter } from "@/services/renderer/scene-exporter";
import { buildScene } from "@/services/renderer/scene-builder";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { MediaTime } from "@/wasm";
import { formatTimecode } from "opencut-wasm";
import { downloadBlob } from "@/utils/browser";
import type { MediaAsset } from "@/media/types";
import { renderThumbnailDataUrl } from "@/media/thumbnail";
import { buildStillFrameAsset } from "@/media/still-frame";
import {
	prerenderShotlyxMGExportSegments,
	type ShotlyxMGExportRenderMap,
} from "@/services/renderer/shotlyx-mg-export-prerender";
import { buildProjectCoverExportPlan } from "@/project/cover";
import { analyzeExportFastPath } from "@/services/renderer/export-fast-path";
import {
	logExportPerformanceSummary,
	measureExportPhase,
	measureExportPhaseSync,
	nowMs,
	type ExportPhaseTiming,
} from "@/services/renderer/export-performance";
import type { SceneExporterProfile } from "@/services/renderer/scene-exporter";

type SnapshotResult =
	| {
			success: true;
			blob: Blob;
			filename: string;
			width: number;
			height: number;
			thumbnailUrl: string;
	  }
	| { success: false; error: string };

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

export class RendererManager {
	private renderTree: RootNode | null = null;
	private _isDegraded = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	get isDegraded(): boolean {
		return this._isDegraded;
	}

	setDegraded(degraded: boolean): void {
		if (this._isDegraded === degraded) return;
		this._isDegraded = degraded;
		this.notify();
	}

	setRenderTree({ renderTree }: { renderTree: RootNode | null }): void {
		this.renderTree = renderTree;
		this.notify();
	}

	getRenderTree(): RootNode | null {
		return this.renderTree;
	}

	async saveSnapshot(): Promise<{ success: boolean; error?: string }> {
		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		downloadBlob({ blob: snapshot.blob, filename: snapshot.filename });
		return { success: true };
	}

	async copySnapshot(): Promise<{ success: boolean; error?: string }> {
		if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
			return {
				success: false,
				error: "Clipboard image copy is not supported in this browser",
			};
		}

		const snapshot = await this.createSnapshot();
		if (!snapshot.success) {
			return snapshot;
		}

		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					[snapshot.blob.type || "image/png"]: snapshot.blob,
				}),
			]);
			return { success: true };
		} catch (error) {
			console.error("Copy snapshot failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async createStillFrameAsset({
		name,
		time,
	}: {
		name?: string;
		time?: MediaTime;
	} = {}): Promise<
		| { success: true; asset: Omit<MediaAsset, "id"> }
		| { success: false; error: string }
	> {
		const snapshot = await this.createSnapshot({ time });
		if (!snapshot.success) {
			return snapshot;
		}

		return {
			success: true,
			asset: buildStillFrameAsset({
				blob: snapshot.blob,
				filename: snapshot.filename,
				width: snapshot.width,
				height: snapshot.height,
				thumbnailUrl: snapshot.thumbnailUrl,
				name,
			}),
		};
	}

	private async createSnapshot({
		time,
	}: {
		time?: MediaTime;
	} = {}): Promise<SnapshotResult> {
		try {
			const renderTree = this.getRenderTree();
			const activeProject = this.editor.project.getActive();

			if (!renderTree || !activeProject) {
				return { success: false, error: "No project or scene to capture" };
			}

			const duration = this.editor.timeline.getTotalDuration();
			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const { canvasSize, fps } = activeProject.settings;
			const renderTime = Math.min(
				time ?? this.editor.playback.getCurrentTime(),
				this.editor.timeline.getLastFrameTime(),
			);

			const renderer = new CanvasRenderer({
				width: canvasSize.width,
				height: canvasSize.height,
				fps,
				renderShotlyxMG: true,
			});

			const tempCanvas = document.createElement("canvas");
			tempCanvas.width = canvasSize.width;
			tempCanvas.height = canvasSize.height;

			await renderer.renderToCanvas({
				node: renderTree,
				time: renderTime,
				targetCanvas: tempCanvas,
			});
			const thumbnailUrl = renderThumbnailDataUrl({
				width: canvasSize.width,
				height: canvasSize.height,
				draw: ({ context, width, height }) => {
					context.drawImage(tempCanvas, 0, 0, width, height);
				},
			});

			const blob = await new Promise<Blob | null>((resolve) => {
				tempCanvas.toBlob((result) => resolve(result), "image/png");
			});

			if (!blob) {
				return { success: false, error: "Failed to create image" };
			}

			const timecode = formatTimecode({ time: renderTime, rate: fps })!.replace(
				/:/g,
				"-",
			);
			const safeName =
				activeProject.metadata.name.replace(/[<>:"/\\|?*]/g, "-").trim() ||
				"snapshot";
			const filename = `${safeName}-${timecode}.png`;

			return {
				success: true,
				blob,
				filename,
				width: canvasSize.width,
				height: canvasSize.height,
				thumbnailUrl,
			};
		} catch (error) {
			console.error("Snapshot capture failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async exportProject({
		options,
		outputTarget,
		onProgress,
		onCancel,
	}: {
		options: ExportOptions;
		outputTarget?: ExportOutputTarget;
		onProgress?: (update: ExportProgressUpdate) => void;
		onCancel?: () => boolean;
	}): Promise<ExportResult> {
		const { format, quality, fps, includeAudio } = options;
		const exportStartedAt = nowMs();
		const phaseTimings: ExportPhaseTiming[] = [];
		const recordPhase = (timing: ExportPhaseTiming) => {
			phaseTimings.push(timing);
		};
		let sceneExporterProfile: SceneExporterProfile | null = null;

		try {
			const tracks = this.editor.scenes.getActiveScene().tracks;
			const mediaAssets = this.editor.media.getAssets();
			const activeProject = this.editor.project.getActive();

			if (!activeProject) {
				return { success: false, error: "No active project" };
			}

			const exportFps = fps ?? activeProject.settings.fps;
			const canvasSize = activeProject.settings.canvasSize;
			const coverPlan = buildProjectCoverExportPlan({
				canvasSize,
				cover: activeProject.settings.cover,
				mediaAssets,
				timelineDuration: this.editor.timeline.getTotalDuration(),
				tracks,
			});
			const duration = coverPlan.duration;
			const exportTracks = coverPlan.tracks;
			const fastPath = analyzeExportFastPath({
				includeAudio: !!includeAudio,
				tracks: exportTracks,
			});

			if (duration === 0) {
				return { success: false, error: "Project is empty" };
			}

			const abortController = new AbortController();
			const checkCancel = () => {
				if (onCancel?.()) {
					abortController.abort();
					return true;
				}
				return false;
			};

			if (checkCancel()) {
				return { success: false, cancelled: true };
			}

			onProgress?.({ progress: 0.01, stage: "preparing" });
			let cancelled = false;
			const checkPrerenderCancel = () => {
				if (checkCancel()) {
					cancelled = true;
				}
			};
			const prerenderCancelInterval = setInterval(checkPrerenderCancel, 100);
			let exportMediaAssets = mediaAssets;
			let shotlyxMGRenderMap: ShotlyxMGExportRenderMap = new Map();
			try {
				const prerenderResult = await measureExportPhase({
					name: "mgPrerender",
					onMeasure: recordPhase,
					fn: () =>
						prerenderShotlyxMGExportSegments({
							fps: exportFps,
							mediaAssets,
							onProgress: (event) => {
								const segmentProgress =
									event.frameProgress ??
									Math.min(
										1,
										Math.max(
											0,
											event.progress * event.segmentCount -
												event.segmentIndex,
										),
									);
								onProgress?.({
									progress: event.progress * 0.15,
									stage: "prerendering-mg",
									subProgress: {
										current: event.frameIndex,
										estimatedRemainingSeconds:
											event.estimatedRemainingSeconds ?? null,
										label: event.segmentName,
										progress: segmentProgress,
										stepCount: event.segmentCount,
										stepIndex: event.segmentIndex,
										total: event.frameCount,
									},
								});
							},
							shotlyxMGAssets: activeProject.shotlyxMGAssets ?? [],
							signal: abortController.signal,
							tracks: exportTracks,
						}),
				});
				exportMediaAssets = prerenderResult.mediaAssets;
				shotlyxMGRenderMap = prerenderResult.renderMap;
			} catch (error) {
				if (cancelled || isAbortError(error)) {
					return { success: false, cancelled: true };
				}
				throw error;
			} finally {
				clearInterval(prerenderCancelInterval);
			}

			if (cancelled || checkCancel()) {
				return { success: false, cancelled: true };
			}

			let audioBuffer: AudioBuffer | null = null;
			if (includeAudio) {
				onProgress?.({
					progress: 0.2,
					stage: "mixing-audio",
					subProgress: null,
				});
				audioBuffer = await measureExportPhase({
					name: "audioMix",
					onMeasure: recordPhase,
					fn: () =>
						createTimelineAudioBuffer({
							tracks: exportTracks,
							mediaAssets: exportMediaAssets,
							duration,
						}),
				});
			}

			const scene = measureExportPhaseSync({
				name: "sceneBuild",
				onMeasure: recordPhase,
				fn: () =>
					buildScene({
						tracks: exportTracks,
						mediaAssets: exportMediaAssets,
						duration,
						canvasSize,
						background: activeProject.settings.background,
						watermark: activeProject.settings.watermark,
						subtitles: activeProject.settings.subtitles,
						shotlyxMGRenderMap,
					}),
			});

			const exporter = new SceneExporter({
				width: canvasSize.width,
				height: canvasSize.height,
				fps: exportFps,
				format,
				quality,
				shouldIncludeAudio: !!includeAudio,
				audioBuffer: audioBuffer || undefined,
			});

			exporter.on("progress", (progress) => {
				const prerenderWeight = shotlyxMGRenderMap.size > 0 ? 0.15 : 0;
				const audioWeight = includeAudio ? 0.05 : 0;
				const adjustedProgress =
					prerenderWeight +
					audioWeight +
					progress * (1 - prerenderWeight - audioWeight);
				onProgress?.({
					progress: adjustedProgress,
					stage: "encoding",
					subProgress: null,
				});
			});
			exporter.on("profile", (profile) => {
				sceneExporterProfile = profile;
			});

			const checkExporterCancel = () => {
				if (checkCancel()) {
					cancelled = true;
					exporter.cancel();
				}
			};

			onProgress?.({
				progress:
					(shotlyxMGRenderMap.size > 0 ? 0.15 : 0.01) +
					(includeAudio ? 0.05 : 0),
				stage: "encoding",
				subProgress: null,
			});
			const cancelInterval = setInterval(checkExporterCancel, 100);

			try {
				const buffer = await measureExportPhase({
					name: "canvasEncode",
					onMeasure: recordPhase,
					fn: () =>
						exporter.export({
							rootNode: scene,
							target: outputTarget?.target,
						}),
				});
				clearInterval(cancelInterval);

				if (cancelled) {
					return { success: false, cancelled: true };
				}

				if (!outputTarget && !buffer) {
					return { success: false, error: "Export failed to produce buffer" };
				}

				return {
					success: true,
					...(buffer ? { buffer } : {}),
				};
			} finally {
				clearInterval(cancelInterval);
				logExportPerformanceSummary({
					canvasSize,
					duration,
					fastPath,
					fps: exportFps,
					includeAudio: !!includeAudio,
					phaseTimings,
					sceneExporterProfile,
					startedAt: exportStartedAt,
				});
			}
		} catch (error) {
			console.error("Export failed:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown export error",
			};
		}
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((fn) => {
			fn();
		});
	}
}
