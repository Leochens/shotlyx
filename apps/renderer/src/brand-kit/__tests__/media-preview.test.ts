import { describe, expect, test } from "bun:test";
import { resolveBrandKitMediaPreviewUrl } from "../media-preview";

describe("brand kit media preview", () => {
	test("uses the matching media thumbnail for uploaded brand assets", () => {
		expect(
			resolveBrandKitMediaPreviewUrl({
				item: {
					id: "brand-logo",
					mediaAssetId: "media-logo",
					name: "logo.png",
				},
				mediaAssets: [
					{
						id: "media-logo",
						thumbnailUrl: "data:image/png;base64,thumb",
						url: "blob:logo",
					},
				],
			}),
		).toBe("data:image/png;base64,thumb");
	});

	test("falls back to the media object URL when no thumbnail exists", () => {
		expect(
			resolveBrandKitMediaPreviewUrl({
				item: {
					id: "brand-image",
					mediaAssetId: "media-image",
					name: "image.png",
				},
				mediaAssets: [
					{
						id: "media-image",
						url: "blob:image",
					},
				],
			}),
		).toBe("blob:image");
	});

	test("returns null when the referenced media asset is unavailable", () => {
		expect(
			resolveBrandKitMediaPreviewUrl({
				item: {
					id: "brand-image",
					mediaAssetId: "missing",
					name: "image.png",
				},
				mediaAssets: [],
			}),
		).toBeNull();
	});
});
