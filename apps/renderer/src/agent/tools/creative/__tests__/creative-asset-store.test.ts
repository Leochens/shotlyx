import { describe, expect, test } from "bun:test";
import {
	clearCreativeAssets,
	createCreativeAssetStore,
	getCreativeAsset,
	registerCreativeAsset,
} from "@/agent/tools/creative/creative-asset-store";

describe("creative asset store", () => {
	test("registers and reads an image asset", () => {
		clearCreativeAssets();
		const asset = registerCreativeAsset({
			type: "image",
			provider: "openai-compatible",
			title: "Generated cover",
			url: "https://example.com/generated.png",
			previewUrl: "https://example.com/generated.png",
			prompt: "cinematic AI editing dashboard",
			model: "gpt-image-1",
			width: 1536,
			height: 1024,
		});

		expect(asset.id).toStartWith("creative_");
		expect(getCreativeAsset({ id: asset.id })).toEqual(asset);
	});

	test("returns null for unknown asset id", () => {
		clearCreativeAssets();
		expect(getCreativeAsset({ id: "creative_missing" })).toBeNull();
	});

	test("isolates assets between store instances", () => {
		const storeA = createCreativeAssetStore();
		const storeB = createCreativeAssetStore();
		const asset = storeA.registerCreativeAsset({
			type: "image",
			provider: "openai-compatible",
			title: "Generated cover",
			url: "https://example.com/generated.png",
			previewUrl: "https://example.com/generated.png",
		});

		expect(storeA.getCreativeAsset({ id: asset.id })).toEqual(asset);
		expect(storeB.getCreativeAsset({ id: asset.id })).toBeNull();
	});
});
