import { create } from "zustand";
import type { ProcessedMediaAsset } from "@/media/processing";
import { storageService } from "@/services/storage/service";
import type { AnimatedStickerAsset } from "@/services/storage/types";
import { generateUUID } from "@/utils/id";

interface AnimatedStickerLibraryStore {
	items: AnimatedStickerAsset[];
	isLoaded: boolean;
	isLoading: boolean;
	error: string | null;
	loadItems: () => Promise<void>;
	addProcessedAssets: ({
		assets,
	}: {
		assets: ProcessedMediaAsset[];
	}) => Promise<AnimatedStickerAsset[]>;
	renameItem: ({
		id,
		name,
	}: {
		id: string;
		name: string;
	}) => Promise<AnimatedStickerAsset | null>;
	removeItem: ({ id }: { id: string }) => Promise<void>;
}

function isAnimatedStickerProcessedAsset(
	asset: ProcessedMediaAsset,
): asset is ProcessedMediaAsset & { type: "image" | "video" } {
	return asset.type === "image" || asset.type === "video";
}

export const useAnimatedStickerLibraryStore =
	create<AnimatedStickerLibraryStore>((set, get) => ({
		items: [],
		isLoaded: false,
		isLoading: false,
		error: null,

		loadItems: async () => {
			if (get().isLoaded || get().isLoading) return;
			set({ isLoading: true, error: null });
			try {
				const items = await storageService.loadAnimatedStickerAssets();
				set({ items, isLoaded: true, isLoading: false });
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load motion stickers";
				set({ error: message, isLoading: false });
				console.error("Failed to load motion stickers:", error);
			}
		},

		addProcessedAssets: async ({ assets }) => {
			const now = new Date().toISOString();
			const items: AnimatedStickerAsset[] = assets
				.filter(isAnimatedStickerProcessedAsset)
				.map((asset) => ({
					id: generateUUID(),
					name: asset.name,
					type: asset.type,
					file: asset.file,
					url: asset.url,
					thumbnailUrl: asset.thumbnailUrl,
					duration: asset.duration,
					width: asset.width,
					height: asset.height,
					fps: asset.fps,
					hasAudio: asset.hasAudio,
					createdAt: now,
					updatedAt: now,
				}));

			for (const item of items) {
				await storageService.saveAnimatedStickerAsset({ asset: item });
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
					items: state.items.map((item) => (item.id === id ? optimistic : item)),
				}));
			}

			try {
				const updated = await storageService.updateAnimatedStickerAsset({
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
						items: state.items.map((item) => (item.id === id ? previous : item)),
					}));
				}
				const message =
					error instanceof Error ? error.message : "Failed to rename sticker";
				set({ error: message });
				console.error("Failed to rename motion sticker:", error);
				return null;
			}
		},

		removeItem: async ({ id }) => {
			const previousItems = get().items;
			set({ items: previousItems.filter((item) => item.id !== id) });
			try {
				await storageService.deleteAnimatedStickerAsset({ id });
			} catch (error) {
				set({ items: previousItems });
				const message =
					error instanceof Error ? error.message : "Failed to remove sticker";
				set({ error: message });
				console.error("Failed to remove motion sticker:", error);
			}
		},
	}));
