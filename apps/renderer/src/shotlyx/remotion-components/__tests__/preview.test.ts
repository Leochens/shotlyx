import { describe, expect, test } from "bun:test";
import { getShotlyxMGThumbnailFrame } from "../preview";
import { shotlyxBattleCardFixture } from "../fixtures/battle-card";
import {
	inlineSvgMarkupToImageTags,
	renderShotlyxMGAssetToStaticMarkup,
} from "../canvas-renderer";
import type { ShotlyxMGAsset, ShotlyxRemotionMGAsset } from "../types";

function buildAsset({
	thumbnailFrame,
}: {
	thumbnailFrame?: number;
}): ShotlyxMGAsset {
	return {
		id: "shotlyx-mg-1",
		type: "shotlyx-remotion-component",
		name: "Battle Card",
		runtime: "shotlyx-remotion-component-v1",
		document: {
			...shotlyxBattleCardFixture,
			durationSeconds: 4,
			fps: 30,
			thumbnailFrame,
		},
		sourcePrompt: "battle card",
		createdAt: "",
		updatedAt: "",
	};
}

describe("Shotlyx MG preview helpers", () => {
	test("uses model-selected thumbnail frame and clamps it to the asset duration", () => {
		expect(
			getShotlyxMGThumbnailFrame({
				asset: buildAsset({ thumbnailFrame: 12 }),
			}),
		).toBe(12);
		expect(
			getShotlyxMGThumbnailFrame({
				asset: buildAsset({ thumbnailFrame: 999 }),
			}),
		).toBe(119);
	});
});

describe("Shotlyx MG canvas rendering helpers", () => {
	test("converts nested inline svg markup to image tags for canvas export", () => {
		const result = inlineSvgMarkupToImageTags({
			markup:
				'<div><svg width="24" height="24" style="position:absolute;left:4px;top:8px"><circle cx="12" cy="12" r="8" stroke="#f59e0b" fill="none"></circle></svg></div>',
		});
		const src = result.match(
			/src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/,
		)?.[1];

		expect(result).toStartWith("<div><img ");
		expect(result).toContain('width="24"');
		expect(result).toContain('height="24"');
		expect(result).toContain('style="position:absolute;left:4px;top:8px"');
		expect(src).toBeString();
		expect(decodeURIComponent(src ?? "")).toContain("<circle");
		expect(result).not.toContain("<svg");
	});

	test("mirrors Remotion AbsoluteFill and Sequence layout in canvas markup", async () => {
		const asset: ShotlyxRemotionMGAsset = {
			id: "shotlyx-mg-layout",
			type: "shotlyx-remotion-component",
			name: "Layout MG",
			runtime: "shotlyx-remotion-component-v1",
			document: {
				...shotlyxBattleCardFixture,
				compiledModule: [
					"export default function LayoutMG() {",
					"  return React.createElement(AbsoluteFill, {",
					"    style: { alignItems: 'center', justifyContent: 'center' },",
					"  }, React.createElement(Sequence, {",
					"    from: 0,",
					"    durationInFrames: 30,",
					"    style: { opacity: 0.5, transform: 'translateX(10px)' },",
					"  }, React.createElement('div', {",
					"    style: { width: 100, height: 100, borderRadius: '50%', background: '#dc2626' },",
					"  })));",
					"}",
				].join("\n"),
			},
			sourcePrompt: "layout mg",
			createdAt: "",
			updatedAt: "",
		};

		const markup = await renderShotlyxMGAssetToStaticMarkup({
			asset,
			params: { progress: 0.1 },
		});

		expect(markup).toContain("display:flex");
		expect(markup).toContain("align-items:center");
		expect(markup).toContain("justify-content:center");
		expect(markup).toContain("opacity:0.5");
		expect(markup).toContain("transform:translateX(10px)");
		expect(markup).toContain("background:#dc2626");
	});
});
