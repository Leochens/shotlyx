import type {
	TProject,
	TProjectAssetSummary,
	TProjectMetadata,
	TProjectStage,
} from "@/project/types";
import { getProjectDurationFromScenes } from "@/timeline/scenes";
import type { MediaAsset } from "@/media/types";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { OPFSAdapter } from "./opfs-adapter";
import { DesktopMediaFilesAdapter } from "./desktop-media-files-adapter";
import {
	type StorageCapacityCheckResult,
	StorageQuotaExceededError,
	evaluateStorageCapacity,
	isStorageQuotaExceededError,
	readStorageQuotaStatus,
} from "./quota";
import type {
	AnimatedStickerAsset,
	AnimatedStickerAssetData,
	MediaAssetData,
	StorageAdapter,
	StorageConfig,
	SerializedProject,
	SerializedScene,
} from "./types";
import type {
	SavedSoundsData,
	SavedSound,
	SoundEffect,
	UploadedSoundAsset,
	UploadedSoundAssetData,
} from "@/sounds/types";
import {
	migrations,
	runStorageMigrations,
} from "@/services/storage/migrations";
import type { Bookmark, SceneTracks, TScene } from "@/timeline";
import { generateUUID } from "@/utils/id";
import { MAIN_TRACK_NAME } from "@/timeline/placement/main-track";
import { roundMediaTime } from "@/wasm";
import {
	deleteCloudProjects,
	getCloudAssetReadUrl,
	getCloudProject,
	hasStoredAuthSession,
	listCloudProjects,
	upsertCloudProject,
	type CloudProjectRecord,
} from "@/auth/client";

const LOCAL_MEDIA_CACHE_LIMIT_BYTES = 20 * 1024 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isOverlayTracks(value: unknown): value is SceneTracks["overlay"] {
	return Array.isArray(value);
}

function isAudioTracks(value: unknown): value is SceneTracks["audio"] {
	return Array.isArray(value);
}

function isMainTrack(value: unknown): value is SceneTracks["main"] {
	return (
		isRecord(value) &&
		value.type === "video" &&
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		Array.isArray(value.elements)
	);
}

function normalizeBookmarks({ raw }: { raw: unknown }): Bookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item): Bookmark | null => {
			if (typeof item === "number") {
				return { time: roundMediaTime({ time: item }) };
			}
			if (!isRecord(item) || typeof item.time !== "number") {
				return null;
			}
			return {
				time: roundMediaTime({ time: item.time }),
				...(typeof item.note === "string" && { note: item.note }),
				...(typeof item.color === "string" && { color: item.color }),
				...(typeof item.duration === "number" && {
					duration: roundMediaTime({ time: item.duration }),
				}),
			};
		})
		.filter((b): b is Bookmark => b !== null);
}

function isProjectStage(value: unknown): value is TProjectStage {
	return (
		value === "topic" ||
		value === "production" ||
		value === "review" ||
		value === "published"
	);
}

function normalizeProjectStage({
	value,
}: {
	value: unknown;
}): TProjectStage | undefined {
	return isProjectStage(value) ? value : undefined;
}

function normalizeProjectNote({
	value,
}: {
	value: unknown;
}): string | undefined {
	if (typeof value !== "string") return undefined;
	const note = value.trim();
	return note.length > 0 ? note : undefined;
}

function normalizeProjectTags({
	value,
}: {
	value: unknown;
}): string[] | undefined {
	if (!Array.isArray(value)) return undefined;

	const tags = Array.from(
		new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	).slice(0, 8);

	return tags.length > 0 ? tags : undefined;
}

function normalizeMediaAssetType({
	value,
}: {
	value: string;
}): MediaAssetData["type"] {
	if (
		value === "image" ||
		value === "video" ||
		value === "audio" ||
		value === "subtitle" ||
		value === "text"
	) {
		return value;
	}
	return "video";
}

function normalizeProjectAssetSummary({
	value,
}: {
	value: unknown;
}): TProjectAssetSummary | undefined {
	if (!isRecord(value)) return undefined;

	return {
		videoCount:
			typeof value.videoCount === "number"
				? Math.max(0, Math.floor(value.videoCount))
				: 0,
		imageCount:
			typeof value.imageCount === "number"
				? Math.max(0, Math.floor(value.imageCount))
				: 0,
		subtitleCount:
			typeof value.subtitleCount === "number"
				? Math.max(0, Math.floor(value.subtitleCount))
				: 0,
	};
}

function getProjectSubtitleLayerCount({
	scenes,
}: {
	scenes: TScene[];
}): number {
	return scenes.reduce((count, scene) => {
		const tracks = [
			...scene.tracks.overlay,
			scene.tracks.main,
			...scene.tracks.audio,
		];

		return (
			count +
			tracks.reduce(
				(trackCount, track) =>
					trackCount +
					track.elements.filter((element) => element.type === "subtitle")
						.length,
				0,
			)
		);
	}, 0);
}

function buildProjectAssetSummary({
	mediaMetadata,
	scenes,
}: {
	mediaMetadata: MediaAssetData[];
	scenes: TScene[];
}): TProjectAssetSummary {
	const timelineSubtitleCount = getProjectSubtitleLayerCount({ scenes });

	return {
		videoCount: mediaMetadata.filter((asset) => asset.type === "video").length,
		imageCount: mediaMetadata.filter((asset) => asset.type === "image").length,
		subtitleCount:
			mediaMetadata.filter((asset) => asset.type === "subtitle").length +
			timelineSubtitleCount,
	};
}

function normalizeTracks({ raw }: { raw: unknown }): SceneTracks {
	if (!isRecord(raw)) {
		return {
			overlay: [],
			main: {
				id: generateUUID(),
				name: MAIN_TRACK_NAME,
				type: "video",
				elements: [],
				muted: false,
				hidden: false,
			},
			audio: [],
		};
	}

	return {
		overlay: isOverlayTracks(raw.overlay) ? raw.overlay : [],
		main: isMainTrack(raw.main)
			? raw.main
			: {
					id: generateUUID(),
					name: MAIN_TRACK_NAME,
					type: "video",
					elements: [],
					muted: false,
					hidden: false,
				},
		audio: isAudioTracks(raw.audio) ? raw.audio : [],
	};
}

class StorageService {
	private projectsAdapter: IndexedDBAdapter<SerializedProject>;
	private savedSoundsAdapter: IndexedDBAdapter<SavedSoundsData>;
	private uploadedSoundMetadataAdapter: IndexedDBAdapter<UploadedSoundAssetData>;
	private uploadedSoundFilesAdapter: OPFSAdapter;
	private animatedStickerMetadataAdapter: IndexedDBAdapter<AnimatedStickerAssetData>;
	private animatedStickerFilesAdapter: OPFSAdapter;
	private config: StorageConfig;
	private migrationsPromise: Promise<void> | null = null;

	constructor() {
		this.config = {
			projectsDb: "video-editor-projects",
			mediaDb: "video-editor-media",
			savedSoundsDb: "video-editor-saved-sounds",
			uploadedSoundsDb: "video-editor-uploaded-sounds",
			animatedStickersDb: "video-editor-animated-stickers",
			version: 1,
		};

		this.projectsAdapter = new IndexedDBAdapter<SerializedProject>({
			dbName: this.config.projectsDb,
			storeName: "projects",
			version: this.config.version,
		});

		this.savedSoundsAdapter = new IndexedDBAdapter<SavedSoundsData>({
			dbName: this.config.savedSoundsDb,
			storeName: "saved-sounds",
			version: this.config.version,
		});

		this.uploadedSoundMetadataAdapter =
			new IndexedDBAdapter<UploadedSoundAssetData>({
				dbName: this.config.uploadedSoundsDb,
				storeName: "uploaded-sounds",
				version: this.config.version,
			});
		this.uploadedSoundFilesAdapter = new OPFSAdapter("uploaded-sound-files");

		this.animatedStickerMetadataAdapter =
			new IndexedDBAdapter<AnimatedStickerAssetData>({
				dbName: this.config.animatedStickersDb,
				storeName: "animated-stickers",
				version: this.config.version,
			});
		this.animatedStickerFilesAdapter = new OPFSAdapter(
			"animated-sticker-files",
		);
	}

	private async ensureMigrations(): Promise<void> {
		if (this.migrationsPromise) {
			await this.migrationsPromise;
			return;
		}

		this.migrationsPromise = runStorageMigrations({ migrations }).then(
			() => undefined,
		);
		await this.migrationsPromise;
	}

	private getProjectMediaAdapters({ projectId }: { projectId: string }) {
		const mediaMetadataAdapter = new IndexedDBAdapter<MediaAssetData>({
			dbName: `${this.config.mediaDb}-${projectId}`,
			storeName: "media-metadata",
			version: this.config.version,
		});

		const mediaAssetsAdapter = this.usesDesktopMediaLibrary()
			? new DesktopMediaFilesAdapter({ projectId })
			: new OPFSAdapter(`media-files-${projectId}`);

		return { mediaMetadataAdapter, mediaAssetsAdapter };
	}

	private getLegacyProjectMediaFilesAdapter({
		projectId,
	}: {
		projectId: string;
	}) {
		return new OPFSAdapter(`media-files-${projectId}`);
	}

	private async syncProjectToCloud({
		project,
	}: {
		project: SerializedProject;
	}): Promise<void> {
		if (!hasStoredAuthSession()) return;
		try {
			await upsertCloudProject({
				project: project as unknown as Record<string, unknown>,
			});
		} catch (error) {
			console.warn("Failed to sync project to cloud:", error);
		}
	}

	private async loadCloudProject({
		id,
	}: {
		id: string;
	}): Promise<SerializedProject | null> {
		if (!hasStoredAuthSession()) return null;
		try {
			const cloudProject = await getCloudProject({ projectId: id });
			if (!cloudProject?.project.project) return null;
			const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
				projectId: id,
			});
			await Promise.all(
				cloudProject.assets.map((asset) =>
					mediaMetadataAdapter.set({
						key: asset.id,
						value: {
							id: asset.id,
							name: asset.name,
							type: normalizeMediaAssetType({ value: asset.mediaType }),
							size: asset.sizeBytes,
							lastModified: Date.parse(asset.updatedAt) || Date.now(),
							cloudAssetId: asset.id,
							uploadStatus: asset.uploadStatus,
							objectKey: asset.objectKey,
							uploadedAt: asset.uploadedAt,
						},
					}),
				),
			);
			return cloudProject.project.project as unknown as SerializedProject;
		} catch (error) {
			console.warn("Failed to load cloud project:", error);
			return null;
		}
	}

	private cloudProjectToMetadata({
		project,
	}: {
		project: CloudProjectRecord;
	}): TProjectMetadata | null {
		const metadata = project.metadata;
		if (!metadata || typeof metadata.id !== "string") return null;
		const createdAt = new Date(
			typeof metadata.createdAt === "string" ? metadata.createdAt : project.createdAt,
		);
		const updatedAt = new Date(
			typeof metadata.updatedAt === "string" ? metadata.updatedAt : project.updatedAt,
		);
		return {
			id: metadata.id,
			name: typeof metadata.name === "string" ? metadata.name : project.name,
			thumbnail:
				typeof metadata.thumbnail === "string" ? metadata.thumbnail : undefined,
			duration:
				typeof metadata.duration === "number"
					? roundMediaTime({ time: metadata.duration })
					: 0,
			createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
			updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
			stage: normalizeProjectStage({ value: metadata.stage }),
			note: normalizeProjectNote({ value: metadata.note }),
			tags: normalizeProjectTags({ value: metadata.tags }),
			assetSummary: normalizeProjectAssetSummary({
				value: metadata.assetSummary,
			}),
		};
	}

	private async loadCloudProjectMetadata(): Promise<TProjectMetadata[]> {
		if (!hasStoredAuthSession()) return [];
		try {
			const projects = await listCloudProjects();
			return projects
				.map((project) => this.cloudProjectToMetadata({ project }))
				.filter((project): project is TProjectMetadata => Boolean(project));
		} catch (error) {
			console.warn("Failed to list cloud projects:", error);
			return [];
		}
	}

	async canStoreFile({
		size,
	}: {
		size: number;
	}): Promise<StorageCapacityCheckResult> {
		if (this.usesDesktopMediaLibrary()) {
			return {
				canStore: true,
				reason: "estimate-unavailable",
				availableBytes: null,
			};
		}

		const quotaStatus = await readStorageQuotaStatus();
		return evaluateStorageCapacity({
			requiredBytes: size,
			quotaStatus,
		});
	}

	isQuotaExceededError({ error }: { error: unknown }): boolean {
		return isStorageQuotaExceededError({ error });
	}

	private stripAudioBuffers({ tracks }: { tracks: SceneTracks }): SceneTracks {
		return {
			...tracks,
			audio: tracks.audio.map((track) => ({
				...track,
				elements: track.elements.map((element) => {
					const { buffer: _buffer, ...rest } = element;
					return rest;
				}),
			})),
		};
	}

	async saveProject({ project }: { project: TProject }): Promise<void> {
		const duration = getProjectDurationFromScenes({ scenes: project.scenes });
		const serializedScenes: SerializedScene[] = project.scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
			tracks: this.stripAudioBuffers({ tracks: scene.tracks }),
			bookmarks: scene.bookmarks,
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		}));

		const serializedProject: SerializedProject = {
			metadata: {
				id: project.metadata.id,
				name: project.metadata.name,
				thumbnail: project.metadata.thumbnail,
				duration,
				createdAt: project.metadata.createdAt.toISOString(),
				updatedAt: project.metadata.updatedAt.toISOString(),
				stage: project.metadata.stage,
				note: project.metadata.note,
				tags: project.metadata.tags,
				assetSummary: project.metadata.assetSummary,
			},
			scenes: serializedScenes,
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			version: project.version,
			timelineViewState: project.timelineViewState,
			brandKits: project.brandKits,
			activeBrandKitId: project.activeBrandKitId ?? null,
			motionGraphicAssets: project.motionGraphicAssets ?? [],
			shotlyxMGAssets: project.shotlyxMGAssets ?? [],
		};

		await this.projectsAdapter.set({
			key: project.metadata.id,
			value: serializedProject,
		});
		void this.syncProjectToCloud({ project: serializedProject });
	}

	async loadProject({
		id,
	}: {
		id: string;
	}): Promise<{ project: TProject } | null> {
		await this.ensureMigrations();
		let serializedProject = await this.projectsAdapter.get(id);

		if (!serializedProject) {
			serializedProject = await this.loadCloudProject({ id });
			if (!serializedProject) return null;
			await this.projectsAdapter.set({ key: id, value: serializedProject });
		}

		if (
			typeof serializedProject !== "object" ||
			serializedProject === null ||
			typeof serializedProject.metadata !== "object" ||
			serializedProject.metadata === null
		) {
			console.warn(
				"[storage] Skipping malformed project entry (missing metadata):",
				{ id, entry: serializedProject },
			);
			return null;
		}

		const scenes =
			serializedProject.scenes?.map((scene) => ({
				id: scene.id,
				name: scene.name,
				isMain: scene.isMain,
				tracks: normalizeTracks({ raw: scene.tracks }),
				bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
				createdAt: new Date(scene.createdAt),
				updatedAt: new Date(scene.updatedAt),
			})) ?? [];

		const project: TProject = {
			metadata: {
				id: serializedProject.metadata.id,
				name: serializedProject.metadata.name,
				thumbnail: serializedProject.metadata.thumbnail,
				duration: roundMediaTime({
					time: getProjectDurationFromScenes({ scenes }),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
				stage: normalizeProjectStage({
					value: serializedProject.metadata.stage,
				}),
				note: normalizeProjectNote({
					value: serializedProject.metadata.note,
				}),
				tags: normalizeProjectTags({
					value: serializedProject.metadata.tags,
				}),
				assetSummary: normalizeProjectAssetSummary({
					value: serializedProject.metadata.assetSummary,
				}),
			},
			scenes,
			currentSceneId: serializedProject.currentSceneId || "",
			settings: serializedProject.settings,
			version: serializedProject.version,
			timelineViewState: serializedProject.timelineViewState,
			brandKits: serializedProject.brandKits ?? [],
			activeBrandKitId: serializedProject.activeBrandKitId ?? null,
			motionGraphicAssets: serializedProject.motionGraphicAssets ?? [],
			shotlyxMGAssets: serializedProject.shotlyxMGAssets ?? [],
		};

		return { project };
	}

	async loadAllProjects(): Promise<TProject[]> {
		const projectIds = await this.projectsAdapter.list();
		const projects: TProject[] = [];

		for (const id of projectIds) {
			const result = await this.loadProject({ id });
			if (result?.project) {
				projects.push(result.project);
			}
		}

		return projects.sort(
			(a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime(),
		);
	}

	async loadProjectAssetSummary({
		projectId,
		scenes,
		fallback,
	}: {
		projectId: string;
		scenes: TScene[];
		fallback?: TProjectAssetSummary;
	}): Promise<TProjectAssetSummary> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		try {
			const mediaMetadata = await mediaMetadataAdapter.getAll();
			return buildProjectAssetSummary({ mediaMetadata, scenes });
		} catch (error) {
			console.warn("Failed to load project media summary:", error);
			return {
				videoCount: fallback?.videoCount ?? 0,
				imageCount: fallback?.imageCount ?? 0,
				subtitleCount: Math.max(
					fallback?.subtitleCount ?? 0,
					getProjectSubtitleLayerCount({ scenes }),
				),
			};
		}
	}

	async loadAllProjectsMetadata(): Promise<TProjectMetadata[]> {
		await this.ensureMigrations();
		const serializedProjects = await this.projectsAdapter.getAll();

		const metadata: TProjectMetadata[] = [];
		for (const serializedProject of serializedProjects) {
			if (
				typeof serializedProject !== "object" ||
				serializedProject === null ||
				typeof serializedProject.metadata !== "object" ||
				serializedProject.metadata === null
			) {
				console.warn(
					"[storage] Skipping malformed project entry (missing metadata):",
					serializedProject,
				);
				continue;
			}

			const normalizedScenes: TScene[] =
				serializedProject.scenes?.map((scene) => ({
					id: scene.id,
					name: scene.name,
					isMain: scene.isMain,
					tracks: normalizeTracks({ raw: scene.tracks }),
					bookmarks: normalizeBookmarks({ raw: scene.bookmarks }),
					createdAt: new Date(scene.createdAt),
					updatedAt: new Date(scene.updatedAt),
				})) ?? [];

			metadata.push({
				id: serializedProject.metadata.id,
				name: serializedProject.metadata.name,
				thumbnail: serializedProject.metadata.thumbnail,
				duration: roundMediaTime({
					time: getProjectDurationFromScenes({ scenes: normalizedScenes }),
				}),
				createdAt: new Date(serializedProject.metadata.createdAt),
				updatedAt: new Date(serializedProject.metadata.updatedAt),
				stage: normalizeProjectStage({
					value: serializedProject.metadata.stage,
				}),
				note: normalizeProjectNote({
					value: serializedProject.metadata.note,
				}),
				tags: normalizeProjectTags({
					value: serializedProject.metadata.tags,
				}),
				assetSummary: await this.loadProjectAssetSummary({
					projectId: serializedProject.metadata.id,
					scenes: normalizedScenes,
					fallback: normalizeProjectAssetSummary({
						value: serializedProject.metadata.assetSummary,
					}),
				}),
			});
		}

		const cloudMetadata = await this.loadCloudProjectMetadata();
		const metadataById = new Map<string, TProjectMetadata>();
		for (const item of [...metadata, ...cloudMetadata]) {
			const existing = metadataById.get(item.id);
			if (!existing || item.updatedAt.getTime() > existing.updatedAt.getTime()) {
				metadataById.set(item.id, item);
			}
		}

		return Array.from(metadataById.values()).sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		);
	}

	async syncLocalProjectsToCloud(): Promise<number> {
		await this.ensureMigrations();
		if (!hasStoredAuthSession()) return 0;
		const serializedProjects = await this.projectsAdapter.getAll();
		let syncedCount = 0;
		for (const project of serializedProjects) {
			if (!project?.metadata?.id) continue;
			try {
				await upsertCloudProject({
					project: project as unknown as Record<string, unknown>,
				});
				syncedCount += 1;
			} catch (error) {
				console.warn("Failed to sync local project:", error);
			}
		}
		return syncedCount;
	}

	async deleteProject({ id }: { id: string }): Promise<void> {
		await this.projectsAdapter.remove(id);
		if (hasStoredAuthSession()) {
			deleteCloudProjects({ ids: [id] }).catch((error) => {
				console.warn("Failed to delete cloud project:", error);
			});
		}
	}

	private async restoreAssetFileFromCloud({
		projectId,
		metadata,
		mediaAssetsAdapter,
	}: {
		projectId: string;
		metadata: MediaAssetData;
		mediaAssetsAdapter: StorageAdapter<File>;
	}): Promise<File | null> {
		if (!metadata.objectKey && !metadata.cloudAssetId) return null;
		try {
			const readUrl =
				metadata.readUrl ??
				(
					await getCloudAssetReadUrl({
						projectId,
						assetId: metadata.cloudAssetId ?? metadata.id,
					})
				).readUrl;
			if (!readUrl) return null;
			const response = await fetch(readUrl);
			if (!response.ok) return null;
			const blob = await response.blob();
			const file = new File([blob], metadata.name, {
				type: blob.type || undefined,
				lastModified: metadata.lastModified || Date.now(),
			});
			await mediaAssetsAdapter.set({ key: metadata.id, value: file });
			const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
				projectId,
			});
			await mediaMetadataAdapter.set({
				key: metadata.id,
				value: {
					...metadata,
					readUrl,
					lastCacheAccessedAt: new Date().toISOString(),
				},
			});
			return file;
		} catch (error) {
			console.warn("Failed to restore media asset from cloud:", error);
			return null;
		}
	}

	private async enforceProjectMediaCacheLimit({
		projectId,
		protectedId,
	}: {
		projectId: string;
		protectedId: string;
	}): Promise<void> {
		if (this.usesDesktopMediaLibrary()) return;
		const { mediaAssetsAdapter } = this.getProjectMediaAdapters({ projectId });
		try {
			const keys = await mediaAssetsAdapter.list();
			const entries: Array<{ key: string; size: number; lastModified: number }> =
				[];
			let totalBytes = 0;
			for (const key of keys) {
				const file = await mediaAssetsAdapter.get(key);
				if (!file) continue;
				entries.push({
					key,
					size: file.size,
					lastModified: file.lastModified,
				});
				totalBytes += file.size;
			}
			if (totalBytes <= LOCAL_MEDIA_CACHE_LIMIT_BYTES) return;
			for (const entry of entries
				.filter((entry) => entry.key !== protectedId)
				.sort((a, b) => a.lastModified - b.lastModified)) {
				if (totalBytes <= LOCAL_MEDIA_CACHE_LIMIT_BYTES) return;
				await mediaAssetsAdapter.remove(entry.key);
				totalBytes -= entry.size;
			}
		} catch (error) {
			console.warn("Failed to enforce local media cache limit:", error);
		}
	}

	async updateMediaAssetCloudState({
		projectId,
		id,
		updates,
	}: {
		projectId: string;
		id: string;
		updates: Partial<
			Pick<
				MediaAssetData,
				| "cloudAssetId"
				| "uploadStatus"
				| "objectKey"
				| "readUrl"
				| "uploadedAt"
			>
		>;
	}): Promise<void> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({ projectId });
		const metadata = await mediaMetadataAdapter.get(id);
		if (!metadata) return;
		await mediaMetadataAdapter.set({
			key: id,
			value: {
				...metadata,
				...updates,
			},
		});
	}

	async saveMediaAsset({
		projectId,
		mediaAsset,
	}: {
		projectId: string;
		mediaAsset: MediaAsset;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const metadata: MediaAssetData = {
			id: mediaAsset.id,
			name: mediaAsset.name,
			type: mediaAsset.type,
			size: mediaAsset.file.size,
			lastModified: mediaAsset.file.lastModified,
			width: mediaAsset.width,
			height: mediaAsset.height,
			duration: mediaAsset.duration,
			fps: mediaAsset.fps,
			hasAudio: mediaAsset.hasAudio,
			thumbnailUrl: mediaAsset.thumbnailUrl,
			ephemeral: mediaAsset.ephemeral,
			externalSource: mediaAsset.externalSource,
			cloudAssetId: mediaAsset.cloudAssetId,
			uploadStatus: mediaAsset.uploadStatus,
			objectKey: mediaAsset.objectKey,
			readUrl: mediaAsset.readUrl,
			uploadedAt: mediaAsset.uploadedAt,
			lastCacheAccessedAt: new Date().toISOString(),
		};

		try {
			await mediaAssetsAdapter.set({
				key: mediaAsset.id,
				value: mediaAsset.file,
			});
			await mediaMetadataAdapter.set({
				key: mediaAsset.id,
				value: metadata,
			});
			await this.enforceProjectMediaCacheLimit({
				projectId,
				protectedId: mediaAsset.id,
			});
		} catch (error) {
			try {
				await mediaAssetsAdapter.remove(mediaAsset.id);
			} catch {
				// Ignore cleanup failures so the original storage error is preserved.
			}

			if (this.isQuotaExceededError({ error }) && hasStoredAuthSession()) {
				await mediaMetadataAdapter.set({
					key: mediaAsset.id,
					value: {
						...metadata,
						uploadStatus: mediaAsset.uploadStatus ?? "uploading",
					},
				});
				console.warn(
					"Local media cache is full; keeping metadata so cloud upload can restore later.",
				);
				return;
			}

			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: mediaAsset.file.size,
				});
			}

			throw error;
		}
	}

	async loadMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<MediaAsset | null> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		const metadata = await mediaMetadataAdapter.get(id);
		let file = await mediaAssetsAdapter.get(id);
		if (!file && metadata && this.usesDesktopMediaLibrary()) {
			const legacyAdapter = this.getLegacyProjectMediaFilesAdapter({
				projectId,
			});
			const legacyFile = await legacyAdapter.get(id).catch(() => null);
			if (legacyFile) {
				file = legacyFile;
				mediaAssetsAdapter
					.set({ key: id, value: legacyFile })
					.catch((error) => {
						console.warn(
							"Failed to copy legacy OPFS media into desktop media library:",
							error,
						);
					});
			}
		}
		if (!file && metadata?.uploadStatus === "uploaded") {
			file = await this.restoreAssetFileFromCloud({
				projectId,
				metadata,
				mediaAssetsAdapter,
			});
		}

		if (!file || !metadata) return null;

		let url: string;
		if (metadata.type === "image" && (!file.type || file.type === "")) {
			try {
				const text = await file.text();
				if (text.trim().startsWith("<svg")) {
					const svgBlob = new Blob([text], { type: "image/svg+xml" });
					url = URL.createObjectURL(svgBlob);
				} else {
					url = URL.createObjectURL(file);
				}
			} catch {
				url = URL.createObjectURL(file);
			}
		} else {
			url = URL.createObjectURL(file);
		}

		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file,
			url,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			fps: metadata.fps,
			hasAudio: metadata.hasAudio,
			thumbnailUrl: metadata.thumbnailUrl,
			ephemeral: metadata.ephemeral,
			externalSource: metadata.externalSource,
			cloudAssetId: metadata.cloudAssetId,
			uploadStatus: metadata.uploadStatus,
			objectKey: metadata.objectKey,
			readUrl: metadata.readUrl,
			uploadedAt: metadata.uploadedAt,
			lastCacheAccessedAt: new Date().toISOString(),
		};
	}

	async loadAllMediaAssets({
		projectId,
	}: {
		projectId: string;
	}): Promise<MediaAsset[]> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();
		const mediaItems: MediaAsset[] = [];

		for (const id of mediaIds) {
			const item = await this.loadMediaAsset({ projectId, id });
			if (item) {
				mediaItems.push(item);
			}
		}

		return mediaItems;
	}

	async deleteMediaAsset({
		projectId,
		id,
	}: {
		projectId: string;
		id: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaAssetsAdapter.remove(id),
			this.usesDesktopMediaLibrary()
				? this.getLegacyProjectMediaFilesAdapter({ projectId })
						.remove(id)
						.catch(() => {})
				: Promise.resolve(),
			mediaMetadataAdapter.remove(id),
		]);
	}

	async deleteProjectMedia({
		projectId,
	}: {
		projectId: string;
	}): Promise<void> {
		const { mediaMetadataAdapter, mediaAssetsAdapter } =
			this.getProjectMediaAdapters({ projectId });

		await Promise.all([
			mediaMetadataAdapter.clear(),
			mediaAssetsAdapter.clear(),
			this.usesDesktopMediaLibrary()
				? this.getLegacyProjectMediaFilesAdapter({ projectId })
						.clear()
						.catch(() => {})
				: Promise.resolve(),
		]);
	}

	async copyMediaAssetsToCurrentBackend({
		assets,
		projectId,
	}: {
		assets: MediaAsset[];
		projectId: string;
	}): Promise<void> {
		const { mediaAssetsAdapter } = this.getProjectMediaAdapters({ projectId });
		await Promise.all(
			assets.map((asset) =>
				mediaAssetsAdapter.set({ key: asset.id, value: asset.file }),
			),
		);
	}

	async clearAllData(): Promise<void> {
		await this.projectsAdapter.clear();
		// project-specific media and timelines cleaned up when projects are deleted
	}

	async getStorageInfo(): Promise<{
		projects: number;
		isOPFSSupported: boolean;
		isIndexedDBSupported: boolean;
	}> {
		const projectIds = await this.projectsAdapter.list();

		return {
			projects: projectIds.length,
			isOPFSSupported: this.isOPFSSupported(),
			isIndexedDBSupported: this.isIndexedDBSupported(),
		};
	}

	async getProjectStorageInfo({ projectId }: { projectId: string }): Promise<{
		mediaItems: number;
	}> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters({
			projectId,
		});

		const mediaIds = await mediaMetadataAdapter.list();

		return {
			mediaItems: mediaIds.length,
		};
	}

	async loadSavedSounds(): Promise<SavedSoundsData> {
		try {
			const savedSoundsData = await this.savedSoundsAdapter.get("user-sounds");
			return (
				savedSoundsData || {
					sounds: [],
					lastModified: new Date().toISOString(),
				}
			);
		} catch (error) {
			console.error("Failed to load saved sounds:", error);
			return { sounds: [], lastModified: new Date().toISOString() };
		}
	}

	async saveSoundEffect({
		soundEffect,
	}: {
		soundEffect: SoundEffect;
	}): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			if (currentData.sounds.some((sound) => sound.id === soundEffect.id)) {
				return; // Already saved
			}

			const savedSound: SavedSound = {
				id: soundEffect.id,
				name: soundEffect.name,
				username: soundEffect.username,
				previewUrl: soundEffect.previewUrl,
				downloadUrl: soundEffect.downloadUrl,
				duration: soundEffect.duration,
				tags: soundEffect.tags,
				license: soundEffect.license,
				savedAt: new Date().toISOString(),
			};

			const updatedData: SavedSoundsData = {
				sounds: [...currentData.sounds, savedSound],
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to save sound effect:", error);
			throw error;
		}
	}

	async removeSavedSound({ soundId }: { soundId: number }): Promise<void> {
		try {
			const currentData = await this.loadSavedSounds();

			const updatedData: SavedSoundsData = {
				sounds: currentData.sounds.filter((sound) => sound.id !== soundId),
				lastModified: new Date().toISOString(),
			};

			await this.savedSoundsAdapter.set({
				key: "user-sounds",
				value: updatedData,
			});
		} catch (error) {
			console.error("Failed to remove saved sound:", error);
			throw error;
		}
	}

	async isSoundSaved({ soundId }: { soundId: number }): Promise<boolean> {
		try {
			const currentData = await this.loadSavedSounds();
			return currentData.sounds.some((sound) => sound.id === soundId);
		} catch (error) {
			console.error("Failed to check if sound is saved:", error);
			return false;
		}
	}

	async clearSavedSounds(): Promise<void> {
		try {
			await this.savedSoundsAdapter.remove("user-sounds");
		} catch (error) {
			console.error("Failed to clear saved sounds:", error);
			throw error;
		}
	}

	async saveUploadedSoundAsset({
		asset,
	}: {
		asset: UploadedSoundAsset;
	}): Promise<void> {
		const metadata: UploadedSoundAssetData = {
			id: asset.id,
			name: asset.name,
			size: asset.file.size,
			lastModified: asset.file.lastModified,
			duration: asset.duration,
			mimeType: asset.mimeType ?? asset.file.type,
			createdAt: asset.createdAt,
			updatedAt: asset.updatedAt,
		};

		try {
			await this.uploadedSoundFilesAdapter.set({
				key: asset.id,
				value: asset.file,
			});
			await this.uploadedSoundMetadataAdapter.set({
				key: asset.id,
				value: metadata,
			});
		} catch (error) {
			try {
				await this.uploadedSoundFilesAdapter.remove(asset.id);
			} catch {
				// Keep the original storage error.
			}
			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: asset.file.size,
				});
			}
			throw error;
		}
	}

	async loadUploadedSoundAsset({
		id,
	}: {
		id: string;
	}): Promise<UploadedSoundAsset | null> {
		const [file, metadata] = await Promise.all([
			this.uploadedSoundFilesAdapter.get(id),
			this.uploadedSoundMetadataAdapter.get(id),
		]);
		if (!file || !metadata) return null;

		return {
			id: metadata.id,
			name: metadata.name,
			file,
			url: URL.createObjectURL(file),
			duration: metadata.duration,
			mimeType: metadata.mimeType,
			createdAt: metadata.createdAt,
			updatedAt: metadata.updatedAt,
		};
	}

	async loadUploadedSoundAssets(): Promise<UploadedSoundAsset[]> {
		const ids = await this.uploadedSoundMetadataAdapter.list();
		const items: UploadedSoundAsset[] = [];
		for (const id of ids) {
			const item = await this.loadUploadedSoundAsset({ id });
			if (item) items.push(item);
		}
		return items.sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
		);
	}

	async updateUploadedSoundAsset({
		id,
		updates,
	}: {
		id: string;
		updates: Partial<Pick<UploadedSoundAsset, "name">>;
	}): Promise<UploadedSoundAsset | null> {
		const current = await this.loadUploadedSoundAsset({ id });
		if (!current) return null;

		const nextName = updates.name?.trim();
		const updated: UploadedSoundAsset = {
			...current,
			name: nextName || current.name,
			updatedAt: new Date().toISOString(),
		};
		await this.saveUploadedSoundAsset({ asset: updated });
		return updated;
	}

	async deleteUploadedSoundAsset({ id }: { id: string }): Promise<void> {
		await Promise.all([
			this.uploadedSoundMetadataAdapter.remove(id),
			this.uploadedSoundFilesAdapter.remove(id),
		]);
	}

	async saveAnimatedStickerAsset({
		asset,
	}: {
		asset: AnimatedStickerAsset;
	}): Promise<void> {
		const metadata: AnimatedStickerAssetData = {
			id: asset.id,
			name: asset.name,
			type: asset.type,
			size: asset.file.size,
			lastModified: asset.file.lastModified,
			width: asset.width,
			height: asset.height,
			duration: asset.duration,
			fps: asset.fps,
			hasAudio: asset.hasAudio,
			thumbnailUrl: asset.thumbnailUrl,
			createdAt: asset.createdAt,
			updatedAt: asset.updatedAt,
		};

		try {
			await this.animatedStickerFilesAdapter.set({
				key: asset.id,
				value: asset.file,
			});
			await this.animatedStickerMetadataAdapter.set({
				key: asset.id,
				value: metadata,
			});
		} catch (error) {
			try {
				await this.animatedStickerFilesAdapter.remove(asset.id);
			} catch {
				// Keep the original storage error.
			}
			if (this.isQuotaExceededError({ error })) {
				throw new StorageQuotaExceededError({
					requiredBytes: asset.file.size,
				});
			}
			throw error;
		}
	}

	async loadAnimatedStickerAsset({
		id,
	}: {
		id: string;
	}): Promise<AnimatedStickerAsset | null> {
		const [file, metadata] = await Promise.all([
			this.animatedStickerFilesAdapter.get(id),
			this.animatedStickerMetadataAdapter.get(id),
		]);
		if (!file || !metadata) return null;

		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file,
			url: URL.createObjectURL(file),
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			fps: metadata.fps,
			hasAudio: metadata.hasAudio,
			thumbnailUrl: metadata.thumbnailUrl,
			createdAt: metadata.createdAt,
			updatedAt: metadata.updatedAt,
		};
	}

	async loadAnimatedStickerAssets(): Promise<AnimatedStickerAsset[]> {
		const ids = await this.animatedStickerMetadataAdapter.list();
		const items: AnimatedStickerAsset[] = [];
		for (const id of ids) {
			const item = await this.loadAnimatedStickerAsset({ id });
			if (item) items.push(item);
		}
		return items.sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
		);
	}

	async updateAnimatedStickerAsset({
		id,
		updates,
	}: {
		id: string;
		updates: Partial<Pick<AnimatedStickerAsset, "name">>;
	}): Promise<AnimatedStickerAsset | null> {
		const current = await this.loadAnimatedStickerAsset({ id });
		if (!current) return null;

		const nextName = updates.name?.trim();
		const updated: AnimatedStickerAsset = {
			...current,
			name: nextName || current.name,
			updatedAt: new Date().toISOString(),
		};
		await this.saveAnimatedStickerAsset({ asset: updated });
		return updated;
	}

	async deleteAnimatedStickerAsset({ id }: { id: string }): Promise<void> {
		await Promise.all([
			this.animatedStickerMetadataAdapter.remove(id),
			this.animatedStickerFilesAdapter.remove(id),
		]);
	}

	isOPFSSupported(): boolean {
		return OPFSAdapter.isSupported();
	}

	isIndexedDBSupported(): boolean {
		return "indexedDB" in window;
	}

	isFullySupported(): boolean {
		return (
			this.isIndexedDBSupported() &&
			(this.usesDesktopMediaLibrary() || this.isOPFSSupported())
		);
	}

	usesDesktopMediaLibrary(): boolean {
		return process.env.VITE_SHOTLYX_DESKTOP === "1";
	}
}

export const storageService = new StorageService();
export { StorageService };
