import type {
	CreativeAsset,
	RegisterCreativeAssetInput,
} from "./types";

function createCreativeAssetId(): string {
	return `creative_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCreativeAssetStore() {
	const creativeAssets = new Map<string, CreativeAsset>();

	return {
		registerCreativeAsset(input: RegisterCreativeAssetInput): CreativeAsset {
			const asset: CreativeAsset = {
				...input,
				id: createCreativeAssetId(),
			};
			creativeAssets.set(asset.id, asset);
			return asset;
		},

		getCreativeAsset({ id }: { id: string }): CreativeAsset | null {
			return creativeAssets.get(id) ?? null;
		},

		clearCreativeAssets(): void {
			creativeAssets.clear();
		},
	};
}

export const defaultCreativeAssetStore = createCreativeAssetStore();

export function registerCreativeAsset(
	input: RegisterCreativeAssetInput,
): CreativeAsset {
	return defaultCreativeAssetStore.registerCreativeAsset(input);
}

export function getCreativeAsset({
	id,
}: {
	id: string;
}): CreativeAsset | null {
	return defaultCreativeAssetStore.getCreativeAsset({ id });
}

export function clearCreativeAssets(): void {
	defaultCreativeAssetStore.clearCreativeAssets();
}
