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
});
