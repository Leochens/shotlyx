import { describe, expect, test } from "bun:test";
import { generateShotlyxHyperFramesDocument } from "@/shotlyx/hyperframes/generator";
import {
	buildShotlyxMGAssetWithProps,
	createShotlyxMGAssetStore,
	defaultShotlyxMGAssetStore,
	getShotlyxMGAsset,
	hydrateShotlyxMGAsset,
} from "../asset-store";
import type { ShotlyxMGAsset } from "../types";

function buildAsset(): ShotlyxMGAsset {
	const now = new Date().toISOString();
	return {
		id: "asset-1",
		type: "shotlyx-remotion-component",
		name: "Typewriter Title",
		runtime: "shotlyx-remotion-component-v1",
		sourcePrompt: "做一个打字机标题",
		createdAt: now,
		updatedAt: now,
		document: {
			version: 1,
			runtime: "shotlyx-remotion-component-v1",
			name: "Typewriter Title",
			durationSeconds: 5,
			fps: 30,
			width: 1920,
			height: 1080,
			aspectRatio: "16:9",
			componentSource:
				"export default function ShotlyxComponent(){ const frame = useCurrentFrame(); return <div>{frame}</div>; }",
			compiledModule:
				"export default function ShotlyxComponent(){ const frame = useCurrentFrame(); return frame; }",
			propsSchema: [
				{
					key: "title",
					label: "Title",
					type: "text",
					role: "content",
					default: "Hello",
				},
			],
			defaultProps: {
				title: "Hello",
			},
			sourcePrompt: "做一个打字机标题",
		},
	};
}

describe("Shotlyx Remotion component asset store", () => {
	test("keeps the default store on globalThis for Vite module variants", () => {
		defaultShotlyxMGAssetStore.clear();
		const asset = buildAsset();

		hydrateShotlyxMGAsset({ asset });

		expect(globalThis.__SHOTLYX_MG_ASSET_STORE__).toBe(
			defaultShotlyxMGAssetStore,
		);
		expect(getShotlyxMGAsset({ id: asset.id })?.name).toBe("Typewriter Title");

		defaultShotlyxMGAssetStore.clear();
	});

	test("registers and isolates Remotion component assets", () => {
		const first = createShotlyxMGAssetStore();
		const second = createShotlyxMGAssetStore();
		const asset = first.register({
			document: buildAsset().document,
			sourcePrompt: "做一个打字机标题",
		});

		expect(first.get({ id: asset.id })?.runtime).toBe(
			"shotlyx-remotion-component-v1",
		);
		expect(second.get({ id: asset.id })).toBeNull();
	});

	test("updates only declared editable props", () => {
		const asset = buildAsset();
		const updated = buildShotlyxMGAssetWithProps({
			asset,
			props: {
				title: "Updated",
			},
		});

		expect(updated.document.defaultProps.title).toBe("Updated");
		expect(() =>
			buildShotlyxMGAssetWithProps({
				asset,
				props: {
					missing: "Nope",
				},
			}),
		).toThrow('属性 "missing"');
	});

	test("registers and rebuilds HyperFrames overlay assets", async () => {
		const store = createShotlyxMGAssetStore();
		const document = await generateShotlyxHyperFramesDocument({
			prompt: "做一个箭头标注：这里是关键步骤",
			templateId: "swiss-pulse-explainer",
		});
		const asset = store.register({
			document,
			sourcePrompt: document.sourcePrompt,
		});

		expect(asset.type).toBe("shotlyx-hyperframes-overlay");
		expect(asset.runtime).toBe("shotlyx-hyperframes-overlay-v1");

		const updated = buildShotlyxMGAssetWithProps({
			asset,
			props: {
				title: "关键步骤",
				callout: "点击这里",
			},
		});
		if (updated.runtime !== "shotlyx-hyperframes-overlay-v1") {
			throw new Error("Expected HyperFrames asset");
		}
		expect(updated.document.defaultProps.title).toBe("关键步骤");
		expect(updated.document.htmlSource).toContain("点击这里");
	});
});
