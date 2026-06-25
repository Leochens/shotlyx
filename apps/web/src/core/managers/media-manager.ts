import type { EditorCore } from "@/core";
import { toast } from "sonner";
import type { MediaAsset } from "@/media/types";
import { storageService } from "@/services/storage/service";
import { generateUUID } from "@/utils/id";
import { videoCache } from "@/services/video-cache/service";
import { waveformCache } from "@/services/waveform-cache/service";
import { BatchCommand, RemoveMediaAssetCommand } from "@/commands";
import { uploadMediaAssetToCloud } from "@/media/cloud-upload";

export class MediaManager {
	private assets: MediaAsset[] = [];
	private isLoading = false;
	private listeners = new Set<() => void>();

	constructor(private editor: EditorCore) {}

	async addMediaAsset({
		projectId,
		asset,
	}: {
		projectId: string;
		asset: Omit<MediaAsset, "id">;
	}): Promise<MediaAsset | null> {
		const newAsset: MediaAsset = {
			...asset,
			id: generateUUID(),
		};

		this.assets = [...this.assets, newAsset];
		this.notify();

		try {
			await storageService.saveMediaAsset({ projectId, mediaAsset: newAsset });
			this.editor.project.ratchetFpsForImportedMedia({
				importedAssets: [newAsset],
			});
			this.syncMediaAssetToCloud({ projectId, asset: newAsset });
			return newAsset;
		} catch (error) {
			console.error("Failed to save media asset:", error);
			this.assets = this.assets.filter((asset) => asset.id !== newAsset.id);
			this.notify();

			if (storageService.isQuotaExceededError({ error })) {
				toast.error("Not enough browser storage", {
					description: error instanceof Error ? error.message : undefined,
				});
			}

			return null;
		}
	}

	private syncMediaAssetToCloud({
		projectId,
		asset,
	}: {
		projectId: string;
		asset: MediaAsset;
	}): void {
		uploadMediaAssetToCloud({ projectId, asset })
			.then(async (cloudState) => {
				await storageService.updateMediaAssetCloudState({
					projectId,
					id: asset.id,
					updates: cloudState,
				});
				this.assets = this.assets.map((item) =>
					item.id === asset.id ? { ...item, ...cloudState } : item,
				);
				this.notify();
			})
			.catch((error) => {
				console.warn("Failed to sync media asset to cloud:", error);
			});
	}

	removeMediaAsset({ projectId, id }: { projectId: string; id: string }): void {
		this.removeMediaAssets({ projectId, ids: [id] });
	}

	removeMediaAssets({
		projectId,
		ids,
	}: {
		projectId: string;
		ids: string[];
	}): void {
		const uniqueIds = [...new Set(ids)];
		if (uniqueIds.length === 0) {
			return;
		}

		const command =
			uniqueIds.length === 1
				? new RemoveMediaAssetCommand({
						projectId,
						assetId: uniqueIds[0],
					})
				: new BatchCommand(
						uniqueIds.map(
							(id) =>
								new RemoveMediaAssetCommand({
									projectId,
									assetId: id,
								}),
						),
					);

		this.editor.command.execute({ command });
	}

	async loadProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		this.isLoading = true;
		this.notify();

		try {
			const mediaAssets = await storageService.loadAllMediaAssets({
				projectId,
			});
			this.assets = mediaAssets;
			this.notify();
		} catch (error) {
			console.error("Failed to load media assets:", error);
		} finally {
			this.isLoading = false;
			this.notify();
		}
	}

	async clearProjectMedia({ projectId }: { projectId: string }): Promise<void> {
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		const mediaIds = this.assets.map((asset) => asset.id);
		this.assets = [];
		this.notify();

		try {
			await Promise.all(
				mediaIds.map((id) =>
					storageService.deleteMediaAsset({ projectId, id }),
				),
			);
		} catch (error) {
			console.error("Failed to clear media assets from storage:", error);
		}
	}

	clearAllAssets(): void {
		videoCache.clearAll();
		waveformCache.clearAll();

		this.assets.forEach((asset) => {
			if (asset.url) {
				URL.revokeObjectURL(asset.url);
			}
			if (asset.thumbnailUrl) {
				URL.revokeObjectURL(asset.thumbnailUrl);
			}
		});

		this.assets = [];
		this.notify();
	}

	getAssets(): MediaAsset[] {
		return this.assets;
	}

	async updateMediaAsset({
		projectId,
		id,
		updates,
	}: {
		projectId: string;
		id: string;
		updates: Partial<Pick<MediaAsset, "name" | "file" | "url">>;
	}): Promise<MediaAsset | null> {
		const previousAsset = this.assets.find((asset) => asset.id === id);
		if (!previousAsset) return null;

		const nextName = updates.name?.trim();
		const fileChanged = updates.file !== undefined;
		const nextUrl =
			updates.url ??
			(fileChanged &&
			previousAsset.url &&
			typeof URL !== "undefined" &&
			"createObjectURL" in URL
				? URL.createObjectURL(updates.file)
				: previousAsset.url);
		const nextAsset: MediaAsset = {
			...previousAsset,
			...updates,
			name: nextName || previousAsset.name,
			url: nextUrl,
		};

		this.assets = this.assets.map((asset) =>
			asset.id === id ? nextAsset : asset,
		);
		this.notify();

		try {
			await storageService.saveMediaAsset({ projectId, mediaAsset: nextAsset });
			if (fileChanged && previousAsset.url && previousAsset.url !== nextUrl) {
				URL.revokeObjectURL(previousAsset.url);
			}
			return nextAsset;
		} catch (error) {
			console.error("Failed to update media asset:", error);
			if (fileChanged && nextUrl && nextUrl !== previousAsset.url) {
				URL.revokeObjectURL(nextUrl);
			}
			this.assets = this.assets.map((asset) =>
				asset.id === id ? previousAsset : asset,
			);
			this.notify();
			toast.error("Failed to update media asset");
			return null;
		}
	}

	setAssets({ assets }: { assets: MediaAsset[] }): void {
		this.assets = assets;
		this.notify();
	}

	isLoadingMedia(): boolean {
		return this.isLoading;
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
