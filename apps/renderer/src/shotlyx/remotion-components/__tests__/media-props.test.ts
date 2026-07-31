import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import {
	buildShotlyxMediaAssetRef,
	resolveShotlyxMGPlayerBackground,
	resolveShotlyxImagePropValue,
	resolveShotlyxMGInputProps,
} from "../media-props";
import type { ShotlyxMGAsset } from "../types";
import { shotlyxBattleCardFixture } from "../fixtures/battle-card";

function imageAsset({
	id,
	name = "cover.png",
	url = "blob:cover",
}: {
	id: string;
	name?: string;
	url?: string;
}): MediaAsset {
	return {
		id,
		name,
		type: "image",
		file: new File(["image"], name, { type: "image/png" }),
		url,
	};
}

describe("Shotlyx MG media props", () => {
	test("resolves media image references to media object URLs", () => {
		const resolved = resolveShotlyxImagePropValue({
			value: buildShotlyxMediaAssetRef({ mediaAssetId: "media-1" }),
			mediaAssets: [imageAsset({ id: "media-1", url: "blob:media-1" })],
		});

		expect(resolved).toBe("blob:media-1");
	});

	test("does not pass unresolved relative image paths through to Remotion", () => {
		const resolved = resolveShotlyxImagePropValue({
			value: "4-3.png",
			mediaAssets: [],
		});

		expect(resolved).toStartWith("data:image/svg+xml");
		expect(resolved).not.toContain("/editor/4-3.png");
	});

	test("resolves image props while preserving normal editable props", () => {
		const asset: ShotlyxMGAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component",
			name: "Image MG",
			runtime: "shotlyx-remotion-component-v1",
			document: {
				...shotlyxBattleCardFixture,
				propsSchema: [
					...shotlyxBattleCardFixture.propsSchema,
					{
						key: "heroImage",
						label: "Hero Image",
						type: "image",
						role: "asset",
						default: "",
					},
				],
				defaultProps: {
					...shotlyxBattleCardFixture.defaultProps,
					heroImage: "",
				},
			},
			sourcePrompt: "image mg",
			createdAt: "",
			updatedAt: "",
		};

		const inputProps = resolveShotlyxMGInputProps({
			asset,
			params: {
				title: "Custom title",
				heroImage: buildShotlyxMediaAssetRef({ mediaAssetId: "media-1" }),
			},
			mediaAssets: [imageAsset({ id: "media-1", url: "blob:hero" })],
		});

		expect(inputProps.title).toBe("Custom title");
		expect(inputProps.heroImage).toBe("blob:hero");
	});

	test("defaults transparent MG background props and player backing to transparent", () => {
		const asset: ShotlyxMGAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component",
			name: "Transparent MG",
			runtime: "shotlyx-remotion-component-v1",
			document: {
				...shotlyxBattleCardFixture,
				transparentBackground: true,
			},
			sourcePrompt: "transparent mg",
			createdAt: "",
			updatedAt: "",
		};

		const inputProps = resolveShotlyxMGInputProps({
			asset,
			mediaAssets: [],
		});

		expect(inputProps.backgroundColor).toBe("transparent");
		expect(resolveShotlyxMGPlayerBackground({ asset })).toBe("transparent");
	});

	test("uses timeline background opacity params for MG props and player backing", () => {
		const asset: ShotlyxMGAsset = {
			id: "shotlyx-asset-1",
			type: "shotlyx-remotion-component",
			name: "Transparent MG",
			runtime: "shotlyx-remotion-component-v1",
			document: {
				...shotlyxBattleCardFixture,
				transparentBackground: true,
			},
			sourcePrompt: "transparent mg",
			createdAt: "",
			updatedAt: "",
		};

		const params = {
			shotlyxMGBackgroundColor: "#102030",
			shotlyxMGBackgroundOpacity: 0.5,
		};
		const inputProps = resolveShotlyxMGInputProps({
			asset,
			params,
			mediaAssets: [],
		});

		expect(inputProps.backgroundColor).toBe("#10203080");
		expect(resolveShotlyxMGPlayerBackground({ asset, params })).toBe(
			"#10203080",
		);
	});
});
