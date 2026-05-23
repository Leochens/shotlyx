import { describe, expect, test } from "bun:test";
import {
	buildShotlyxMGAssetWithProps,
	createShotlyxMGAssetStore,
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
});
