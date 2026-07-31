import { afterEach, describe, expect, test } from "bun:test";
import {
	clearGlobalBrandKitStateForTests,
	getGlobalActiveBrandKit,
	getGlobalBrandKits,
	mergeGlobalBrandKits,
	setGlobalActiveBrandKit,
	upsertGlobalBrandKit,
} from "../global-store";
import type { ProjectBrandKit } from "../types";

function createKit({
	id,
	name,
}: {
	id: string;
	name: string;
}): ProjectBrandKit {
	return {
		id,
		name,
		colors: [{ id: `${id}-color`, value: "#00ffff" }],
		fonts: [{ id: `${id}-font`, family: "Inter", role: "heading" }],
		logos: [],
		images: [],
		styleGuide: "Use crisp creator-workflow visuals.",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

function installLocalStorageMock(): () => void {
	const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
		globalThis,
		"window",
	);
	const data = new Map<string, string>();
	const localStorage = {
		get length() {
			return data.size;
		},
		clear() {
			data.clear();
		},
		getItem(key: string) {
			return data.get(key) ?? null;
		},
		key(index: number) {
			return Array.from(data.keys())[index] ?? null;
		},
		removeItem(key: string) {
			data.delete(key);
		},
		setItem(key: string, value: string) {
			data.set(key, value);
		},
	} satisfies Storage;

	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { localStorage },
	});

	return () => {
		if (originalWindowDescriptor) {
			Object.defineProperty(globalThis, "window", originalWindowDescriptor);
			return;
		}
		Reflect.deleteProperty(globalThis, "window");
	};
}

afterEach(() => {
	clearGlobalBrandKitStateForTests();
});

describe("global brand kit store", () => {
	test("keeps brand kits globally instead of per project", () => {
		const kit = createKit({ id: "kit-1", name: "GuanTou Lab" });

		upsertGlobalBrandKit({ kit });
		setGlobalActiveBrandKit({ id: kit.id });

		expect(getGlobalBrandKits()).toEqual([kit]);
		expect(getGlobalActiveBrandKit()?.name).toBe("GuanTou Lab");
	});

	test("migrates legacy project kits without overwriting existing global kits", () => {
		const existing = createKit({ id: "kit-existing", name: "Existing" });
		const legacy = createKit({
			id: "kit-legacy",
			name: "Legacy Project Brand",
		});

		upsertGlobalBrandKit({ kit: existing });
		mergeGlobalBrandKits({
			brandKits: [legacy],
			activeBrandKitId: legacy.id,
		});

		expect(getGlobalBrandKits().map((kit) => kit.id)).toEqual([
			"kit-existing",
			"kit-legacy",
		]);
		expect(getGlobalActiveBrandKit()?.id).toBe(existing.id);
	});

	test("keeps snapshot references stable while storage is unchanged", () => {
		const restoreWindow = installLocalStorageMock();
		const kit = createKit({ id: "kit-1", name: "GuanTou Lab" });

		try {
			upsertGlobalBrandKit({ kit });
			setGlobalActiveBrandKit({ id: kit.id });

			const firstKits = getGlobalBrandKits();
			const secondKits = getGlobalBrandKits();
			const firstActiveKit = getGlobalActiveBrandKit();
			const secondActiveKit = getGlobalActiveBrandKit();

			expect(secondKits).toBe(firstKits);
			expect(secondActiveKit).toBe(firstActiveKit);
		} finally {
			restoreWindow();
		}
	});
});
