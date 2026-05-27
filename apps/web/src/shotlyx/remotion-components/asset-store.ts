import { generateUUID } from "@/utils/id";
import { rebuildShotlyxHyperFramesDocument } from "@/shotlyx/hyperframes/generator";
import { assertValidShotlyxHyperFramesDocument } from "@/shotlyx/hyperframes/validator";
import {
	SHOTLYX_HYPERFRAMES_RUNTIME,
	SHOTLYX_REMOTION_COMPONENT_RUNTIME,
	type ShotlyxMGAsset,
	type ShotlyxMGDocument,
	type ShotlyxMGPropValue,
	type ShotlyxHyperFramesDocument,
	type ShotlyxRemotionComponentDocument,
} from "./types";
import { assertValidShotlyxRemotionComponentAssetDocument } from "./validator";

export type { ShotlyxMGAsset } from "./types";

export interface RegisterShotlyxMGAssetInput {
	id?: string;
	document: ShotlyxMGDocument;
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
	const allowedProps = new Set(
		asset.document.propsSchema.map((prop) => prop.key),
	);
	for (const key of Object.keys(props)) {
		if (!allowedProps.has(key)) {
			throw new Error(`参数不存在：Shotlyx MG 不包含属性 "${key}"`);
		}
	}

	const updatedAt = new Date().toISOString();
	if (asset.runtime === SHOTLYX_HYPERFRAMES_RUNTIME) {
		return {
			...asset,
			document: rebuildShotlyxHyperFramesDocument({
				document: asset.document,
				props,
			}),
			updatedAt,
		};
	}
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

function assertValidShotlyxMGDocument(
	document: ShotlyxMGDocument,
): asserts document is ShotlyxMGDocument {
	if (document.runtime === SHOTLYX_HYPERFRAMES_RUNTIME) {
		assertValidShotlyxHyperFramesDocument(document);
		return;
	}
	assertValidShotlyxRemotionComponentAssetDocument(document);
}

export function createShotlyxMGAssetStore(): ShotlyxMGAssetStore {
	const assets = new Map<string, ShotlyxMGAsset>();

	return {
		register({ id, document, sourcePrompt }) {
			assertValidShotlyxMGDocument(document);
			const now = new Date().toISOString();
			const asset: ShotlyxMGAsset =
				document.runtime === SHOTLYX_HYPERFRAMES_RUNTIME
					? {
							id: id ?? generateUUID(),
							type: "shotlyx-hyperframes-overlay",
							name: document.name,
							runtime: SHOTLYX_HYPERFRAMES_RUNTIME,
							document: document as ShotlyxHyperFramesDocument,
							sourcePrompt,
							createdAt: now,
							updatedAt: now,
						}
					: {
							id: id ?? generateUUID(),
							type: "shotlyx-remotion-component",
							name: document.name,
							runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
							document: document as ShotlyxRemotionComponentDocument,
							sourcePrompt,
							createdAt: now,
							updatedAt: now,
						};
			assets.set(asset.id, asset);
			return asset;
		},
		upsert(asset) {
			assertValidShotlyxMGDocument(asset.document);
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
