import { describe, expect, test } from "bun:test";
import { compactBrandKit } from "@/brand-kit/compact";
import type { ProjectBrandKit } from "@/brand-kit/types";

describe("compactBrandKit", () => {
	test("returns model-safe brand kit metadata", () => {
		const kit: ProjectBrandKit = {
			id: "brand_1",
			name: "未命名套件",
			colors: [{ id: "color_1", value: "#111111" }],
			fonts: [{ id: "font_1", family: "Inter", role: "heading" }],
			logos: [{ id: "logo_1", mediaAssetId: "media_logo", name: "logo.png" }],
			images: [{ id: "image_1", mediaAssetId: "media_ref", name: "ref.png" }],
			styleGuide: "现代、技术、克制",
			createdAt: "2026-05-16T00:00:00.000Z",
			updatedAt: "2026-05-16T00:00:00.000Z",
		};

		expect(compactBrandKit({ kit })).toEqual({
			id: "brand_1",
			name: "未命名套件",
			colors: ["#111111"],
			fonts: ["Inter"],
			logoMediaAssetIds: ["media_logo"],
			imageMediaAssetIds: ["media_ref"],
			styleGuide: "现代、技术、克制",
		});
	});
});
