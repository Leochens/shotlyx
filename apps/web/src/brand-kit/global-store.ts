import type { ProjectBrandKit } from "./types";

export interface GlobalBrandKitState {
	brandKits: ProjectBrandKit[];
	activeBrandKitId: string | null;
}

const GLOBAL_BRAND_KIT_STORAGE_KEY = "shotlyx-global-brand-kits-v1";

let memoryState: GlobalBrandKitState = {
	brandKits: [],
	activeBrandKitId: null,
};

function getStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function isProjectBrandKit(value: unknown): value is ProjectBrandKit {
	if (typeof value !== "object" || value === null) return false;
	const id = Reflect.get(value, "id");
	const name = Reflect.get(value, "name");
	const colors = Reflect.get(value, "colors");
	const fonts = Reflect.get(value, "fonts");
	const logos = Reflect.get(value, "logos");
	const images = Reflect.get(value, "images");
	const styleGuide = Reflect.get(value, "styleGuide");
	return (
		typeof id === "string" &&
		typeof name === "string" &&
		Array.isArray(colors) &&
		Array.isArray(fonts) &&
		Array.isArray(logos) &&
		Array.isArray(images) &&
		typeof styleGuide === "string"
	);
}

function normalizeState(value: unknown): GlobalBrandKitState {
	if (typeof value !== "object" || value === null) {
		return { brandKits: [], activeBrandKitId: null };
	}
	const rawBrandKits = Reflect.get(value, "brandKits");
	const rawActiveBrandKitId = Reflect.get(value, "activeBrandKitId");
	const brandKits = Array.isArray(rawBrandKits)
		? rawBrandKits.filter(isProjectBrandKit)
		: [];
	const activeBrandKitIdValue =
		typeof rawActiveBrandKitId === "string" ? rawActiveBrandKitId : null;
	const activeBrandKitId = brandKits.some(
		(kit) => kit.id === activeBrandKitIdValue,
	)
		? activeBrandKitIdValue
		: null;
	return { brandKits, activeBrandKitId };
}

function areStatesEqual({
	a,
	b,
}: {
	a: GlobalBrandKitState;
	b: GlobalBrandKitState;
}): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export function getGlobalBrandKitState(): GlobalBrandKitState {
	const storage = getStorage();
	if (!storage) return memoryState;
	try {
		const raw = storage.getItem(GLOBAL_BRAND_KIT_STORAGE_KEY);
		if (!raw) return memoryState;
		memoryState = normalizeState(JSON.parse(raw));
		return memoryState;
	} catch {
		return memoryState;
	}
}

function writeGlobalBrandKitState(
	state: GlobalBrandKitState,
): GlobalBrandKitState {
	const normalized = normalizeState(state);
	memoryState = normalized;
	const storage = getStorage();
	if (storage) {
		try {
			storage.setItem(GLOBAL_BRAND_KIT_STORAGE_KEY, JSON.stringify(normalized));
		} catch {
			// Keep the in-memory value so the current session still reflects edits.
		}
	}
	return normalized;
}

function updateGlobalBrandKitState(
	updater: (state: GlobalBrandKitState) => GlobalBrandKitState,
): GlobalBrandKitState {
	const current = getGlobalBrandKitState();
	const next = normalizeState(updater(current));
	if (areStatesEqual({ a: current, b: next })) return current;
	return writeGlobalBrandKitState(next);
}

export function getGlobalBrandKits(): ProjectBrandKit[] {
	return getGlobalBrandKitState().brandKits;
}

export function getGlobalActiveBrandKit(): ProjectBrandKit | null {
	const state = getGlobalBrandKitState();
	if (!state.activeBrandKitId) return null;
	return (
		state.brandKits.find((kit) => kit.id === state.activeBrandKitId) ?? null
	);
}

export function mergeGlobalBrandKits({
	brandKits,
	activeBrandKitId,
}: {
	brandKits: ProjectBrandKit[];
	activeBrandKitId?: string | null;
}): GlobalBrandKitState {
	if (brandKits.length === 0 && !activeBrandKitId) {
		return getGlobalBrandKitState();
	}
	return updateGlobalBrandKitState((state) => {
		const nextBrandKits = [...state.brandKits];
		for (const kit of brandKits) {
			if (!nextBrandKits.some((item) => item.id === kit.id)) {
				nextBrandKits.push(kit);
			}
		}
		const nextActiveBrandKitId =
			state.activeBrandKitId ??
			(activeBrandKitId &&
			nextBrandKits.some((kit) => kit.id === activeBrandKitId)
				? activeBrandKitId
				: null);
		return {
			brandKits: nextBrandKits,
			activeBrandKitId: nextActiveBrandKitId,
		};
	});
}

export function upsertGlobalBrandKit({
	kit,
}: {
	kit: ProjectBrandKit;
}): GlobalBrandKitState {
	const now = new Date().toISOString();
	const nextKit: ProjectBrandKit = {
		...kit,
		createdAt: kit.createdAt || now,
		updatedAt: kit.updatedAt || now,
	};
	return updateGlobalBrandKitState((state) => {
		const hasExisting = state.brandKits.some((item) => item.id === kit.id);
		const brandKits = hasExisting
			? state.brandKits.map((item) => (item.id === kit.id ? nextKit : item))
			: [...state.brandKits, nextKit];
		return {
			brandKits,
			activeBrandKitId: state.activeBrandKitId ?? nextKit.id,
		};
	});
}

export function removeGlobalBrandKit({
	id,
}: {
	id: string;
}): GlobalBrandKitState {
	return updateGlobalBrandKitState((state) => {
		const brandKits = state.brandKits.filter((kit) => kit.id !== id);
		return {
			brandKits,
			activeBrandKitId:
				state.activeBrandKitId === id ? null : state.activeBrandKitId,
		};
	});
}

export function setGlobalActiveBrandKit({
	id,
}: {
	id: string | null;
}): GlobalBrandKitState {
	return updateGlobalBrandKitState((state) => ({
		brandKits: state.brandKits,
		activeBrandKitId:
			id && state.brandKits.some((kit) => kit.id === id) ? id : null,
	}));
}

export function clearGlobalBrandKitStateForTests(): void {
	memoryState = {
		brandKits: [],
		activeBrandKitId: null,
	};
	const storage = getStorage();
	storage?.removeItem(GLOBAL_BRAND_KIT_STORAGE_KEY);
}
