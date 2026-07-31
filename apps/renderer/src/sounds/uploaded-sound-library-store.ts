import { create } from "zustand";
import type { ProcessedMediaAsset } from "@/media/processing";
import { storageService } from "@/services/storage/service";
import type { UploadedSoundAsset } from "@/sounds/types";
import { generateUUID } from "@/utils/id";

interface UploadedSoundLibraryStore {
	items: UploadedSoundAsset[];
	isLoaded: boolean;
	isLoading: boolean;
	error: string | null;
	loadItems: () => Promise<void>;
	addProcessedAssets: ({
		assets,
	}: {
		assets: ProcessedMediaAsset[];
	}) => Promise<UploadedSoundAsset[]>;
	renameItem: ({
		id,
		name,
	}: {
		id: string;
		name: string;
	}) => Promise<UploadedSoundAsset | null>;
	removeItem: ({ id }: { id: string }) => Promise<void>;
}

function isAudioProcessedAsset(
	asset: ProcessedMediaAsset,
): asset is ProcessedMediaAsset & { type: "audio" } {
	return asset.type === "audio";
}

export const useUploadedSoundLibraryStore = create<UploadedSoundLibraryStore>(
	(set, get) => ({
		items: [],
		isLoaded: false,
		isLoading: false,
		error: null,

		loadItems: async () => {
			if (get().isLoaded || get().isLoading) return;
			set({ isLoading: true, error: null });
			try {
				const items = await storageService.loadUploadedSoundAssets();
				set({ items, isLoaded: true, isLoading: false });
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load uploaded sounds";
				set({ error: message, isLoading: false });
				console.error("Failed to load uploaded sounds:", error);
			}
		},

		addProcessedAssets: async ({ assets }) => {
			const now = new Date().toISOString();
			const items: UploadedSoundAsset[] = assets
				.filter(isAudioProcessedAsset)
				.map((asset) => ({
					id: generateUUID(),
					name: asset.name,
					file: asset.file,
					url: asset.url,
					duration: asset.duration,
					mimeType: asset.file.type,
					createdAt: now,
					updatedAt: now,
				}));

			for (const item of items) {
				await storageService.saveUploadedSoundAsset({ asset: item });
			}

			if (items.length > 0) {
				set((state) => ({
					items: [...items, ...state.items],
					isLoaded: true,
					error: null,
				}));
			}

			return items;
		},

		renameItem: async ({ id, name }) => {
			const trimmedName = name.trim();
			if (!trimmedName) return null;

			const previous = get().items.find((item) => item.id === id) ?? null;
			const optimistic = previous
				? {
						...previous,
						name: trimmedName,
						updatedAt: new Date().toISOString(),
					}
				: null;
			if (optimistic) {
				set((state) => ({
					items: state.items.map((item) =>
						item.id === id ? optimistic : item,
					),
				}));
			}

			try {
				const updated = await storageService.updateUploadedSoundAsset({
					id,
					updates: { name: trimmedName },
				});
				if (!updated) return null;
				set((state) => ({
					items: state.items.map((item) => (item.id === id ? updated : item)),
					error: null,
				}));
				return updated;
			} catch (error) {
				if (previous) {
					set((state) => ({
						items: state.items.map((item) =>
							item.id === id ? previous : item,
						),
					}));
				}
				const message =
					error instanceof Error ? error.message : "Failed to rename sound";
				set({ error: message });
				console.error("Failed to rename uploaded sound:", error);
				return null;
			}
		},

		removeItem: async ({ id }) => {
			const previousItems = get().items;
			set({ items: previousItems.filter((item) => item.id !== id) });
			try {
				await storageService.deleteUploadedSoundAsset({ id });
			} catch (error) {
				set({ items: previousItems });
				const message =
					error instanceof Error ? error.message : "Failed to remove sound";
				set({ error: message });
				console.error("Failed to remove uploaded sound:", error);
			}
		},
	}),
);
