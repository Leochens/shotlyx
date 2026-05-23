import { generateUUID } from "@/utils/id";
import {
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	type ShotlyxMGAsset,
	type ShotlyxMGPropValue,
	type ShotlyxRemotionComponentDocument,
} from "./types";
import { assertValidShotlyxRemotionComponentAssetDocument } from "./validator";

export type { ShotlyxMGAsset } from "./types";

export interface RegisterShotlyxMGAssetInput {
	id?: string;
	document: ShotlyxRemotionComponentDocument;
	sourcePrompt: string;
}

export interface ShotlyxMGAssetStore {
	register(input: RegisterShotlyxMGAssetInput): ShotlyxMGAsset;
	upsert(asset: ShotlyxMGAsset): ShotlyxMGAsset;
	get({ id }: { id: string }): ShotlyxMGAsset | null;
	updateProps({
		id,
		props,
	}: {
		id: string;
		props: Record<string, ShotlyxMGPropValue>;
	}): ShotlyxMGAsset;
	clear(): void;
}

export function buildShotlyxMGAssetWithProps({
	asset,
	props,
}: {
	asset: ShotlyxMGAsset;
	props: Record<string, ShotlyxMGPropValue>;
}): ShotlyxMGAsset {
	const allowedProps = new Set(asset.document.propsSchema.map((prop) => prop.key));
	for (const key of Object.keys(props)) {
		if (!allowedProps.has(key)) {
			throw new Error(`参数不存在：Shotlyx MG 不包含属性 "${key}"`);
		}
	}

	const updatedAt = new Date().toISOString();
	return {
		...asset,
		document: {
			...asset.document,
			defaultProps: {
				...asset.document.defaultProps,
				...props,
			},
		},
		updatedAt,
	};
}

export function createShotlyxMGAssetStore(): ShotlyxMGAssetStore {
	const assets = new Map<string, ShotlyxMGAsset>();

	return {
		register({ id, document, sourcePrompt }) {
			assertValidShotlyxRemotionComponentAssetDocument(document);
			const now = new Date().toISOString();
			const asset: ShotlyxMGAsset = {
				id: id ?? generateUUID(),
				type: "shotlyx-remotion-component",
				name: document.name,
				runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
				document,
				sourcePrompt,
				createdAt: now,
				updatedAt: now,
			};
			assets.set(asset.id, asset);
			return asset;
		},
		upsert(asset) {
			assertValidShotlyxRemotionComponentAssetDocument(asset.document);
			assets.set(asset.id, asset);
			return asset;
		},
		get({ id }) {
			return assets.get(id) ?? null;
		},
		updateProps({ id, props }) {
			const asset = assets.get(id);
			if (!asset) {
				throw new Error(`资源不存在：找不到 Shotlyx MG 资源 "${id}"`);
			}
			const nextAsset = buildShotlyxMGAssetWithProps({ asset, props });
			assets.set(id, nextAsset);
			return nextAsset;
		},
		clear() {
			assets.clear();
		},
	};
}

export const defaultShotlyxMGAssetStore = createShotlyxMGAssetStore();

export function registerShotlyxMGAsset(
	input: RegisterShotlyxMGAssetInput,
): ShotlyxMGAsset {
	return defaultShotlyxMGAssetStore.register(input);
}

export function getShotlyxMGAsset({
	id,
}: {
	id: string;
}): ShotlyxMGAsset | null {
	return defaultShotlyxMGAssetStore.get({ id });
}

export function hydrateShotlyxMGAsset({
	asset,
}: {
	asset: ShotlyxMGAsset;
}): ShotlyxMGAsset {
	return defaultShotlyxMGAssetStore.upsert(asset);
}

export function hydrateShotlyxMGAssets({
	assets,
}: {
	assets: ShotlyxMGAsset[];
}): void {
	for (const asset of assets) {
		defaultShotlyxMGAssetStore.upsert(asset);
	}
}

export function updateShotlyxMGAssetProps({
	id,
	props,
}: {
	id: string;
	props: Record<string, ShotlyxMGPropValue>;
}): ShotlyxMGAsset {
	return defaultShotlyxMGAssetStore.updateProps({ id, props });
}

export function clearShotlyxMGAssets(): void {
	defaultShotlyxMGAssetStore.clear();
}
