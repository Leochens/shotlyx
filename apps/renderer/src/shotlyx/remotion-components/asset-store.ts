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

function hashAssetId(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function getShotlyxMGShortId({ id }: { id: string }): string {
	return `MG-${hashAssetId(id).toString(36).toUpperCase().padStart(5, "0").slice(-5)}`;
}

function documentsDiffer({
	first,
	second,
}: {
	first: ShotlyxRemotionComponentDocument;
	second: ShotlyxRemotionComponentDocument;
}): boolean {
	const { quality: _firstQuality, ...firstContent } = first;
	const { quality: _secondQuality, ...secondContent } = second;
	return JSON.stringify(firstContent) !== JSON.stringify(secondContent);
}

export function normalizeShotlyxMGAsset({
	asset,
	previous,
}: {
	asset: ShotlyxMGAsset;
	previous?: ShotlyxMGAsset | null;
}): ShotlyxMGAsset {
	if (asset.runtime === SHOTLYX_HYPERFRAMES_RUNTIME) return asset;
	const previousRemotion =
		previous?.runtime === SHOTLYX_REMOTION_COMPONENT_RUNTIME ? previous : null;
	const currentRevision = previousRemotion?.revision ?? asset.revision ?? 1;
	const documentChanged = previousRemotion
		? documentsDiffer({
				first: previousRemotion.document,
				second: asset.document,
			})
		: false;
	const revisions = previousRemotion?.revisions ?? asset.revisions ?? [];
	return {
		...asset,
		shortId:
			previousRemotion?.shortId ??
			asset.shortId ??
			getShotlyxMGShortId({ id: asset.id }),
		revision: documentChanged ? currentRevision + 1 : currentRevision,
		status:
			asset.document.quality?.status === "needs-attention"
				? "needs-attention"
				: "ready",
		revisions:
			documentChanged && previousRemotion
				? [
						...revisions,
						{
							revision: currentRevision,
							name: previousRemotion.name,
							document: previousRemotion.document,
							createdAt: previousRemotion.updatedAt,
						},
					].slice(-8)
				: revisions,
	};
}

declare global {
	var __SHOTLYX_MG_ASSET_STORE__: ShotlyxMGAssetStore | undefined;
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
			const assetId = id ?? generateUUID();
			const asset: ShotlyxMGAsset =
				document.runtime === SHOTLYX_HYPERFRAMES_RUNTIME
					? {
							id: assetId,
							type: "shotlyx-hyperframes-overlay",
							name: document.name,
							runtime: SHOTLYX_HYPERFRAMES_RUNTIME,
							document: document as ShotlyxHyperFramesDocument,
							sourcePrompt,
							createdAt: now,
							updatedAt: now,
						}
					: {
							id: assetId,
							type: "shotlyx-remotion-component",
							name: document.name,
							runtime: SHOTLYX_REMOTION_COMPONENT_RUNTIME,
							document: document as ShotlyxRemotionComponentDocument,
							sourcePrompt,
							createdAt: now,
							updatedAt: now,
						};
			const normalized = normalizeShotlyxMGAsset({ asset });
			assets.set(normalized.id, normalized);
			return normalized;
		},
		upsert(asset) {
			assertValidShotlyxMGDocument(asset.document);
			const normalized = normalizeShotlyxMGAsset({
				asset,
				previous: assets.get(asset.id),
			});
			assets.set(asset.id, normalized);
			return normalized;
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

export const defaultShotlyxMGAssetStore =
	globalThis.__SHOTLYX_MG_ASSET_STORE__ ??
	(globalThis.__SHOTLYX_MG_ASSET_STORE__ = createShotlyxMGAssetStore());

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
