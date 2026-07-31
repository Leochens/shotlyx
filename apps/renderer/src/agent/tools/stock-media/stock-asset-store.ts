import type { StockAsset, StockAssetInput } from "./types";

function createStockAssetId(): string {
	return `stock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createStockAssetStore() {
	const stockAssets = new Map<string, StockAsset>();

	return {
		registerStockAsset(input: StockAssetInput): StockAsset {
			const asset: StockAsset = {
				...input,
				id: createStockAssetId(),
			};
			stockAssets.set(asset.id, asset);
			return asset;
		},

		getStockAsset({ id }: { id: string }): StockAsset | null {
			return stockAssets.get(id) ?? null;
		},

		clearStockAssets(): void {
			stockAssets.clear();
		},
	};
}

export const defaultStockAssetStore = createStockAssetStore();

export function registerStockAsset(input: StockAssetInput): StockAsset {
	return defaultStockAssetStore.registerStockAsset(input);
}

export function getStockAsset({ id }: { id: string }): StockAsset | null {
	return defaultStockAssetStore.getStockAsset({ id });
}

export function clearStockAssets(): void {
	defaultStockAssetStore.clearStockAssets();
}
