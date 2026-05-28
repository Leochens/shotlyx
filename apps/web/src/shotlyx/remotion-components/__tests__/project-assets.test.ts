import { describe, expect, mock, test } from "bun:test";
import {
	SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
	buildShotlyxMGGraphicParams,
} from "../project-assets";
import { shotlyxBattleCardFixture } from "../fixtures/battle-card";
import { shotlyxMGGraphicDefinition } from "../graphic-definition";

describe("Shotlyx MG project assets", () => {
	test("adds editable background params for transparent MG timeline instances", () => {
		const params = buildShotlyxMGGraphicParams({
			asset: {
				id: "shotlyx-asset-1",
				document: {
					...shotlyxBattleCardFixture,
					transparentBackground: true,
				},
			},
		});

		expect(params[SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY]).toBe("#050505");
		expect(params[SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY]).toBe(0);
	});

	test("does not draw the blue Shotlyx MG placeholder when an asset is missing", async () => {
		const clearRect = mock(() => undefined);
		const fillRect = mock(() => undefined);
		const strokeRect = mock(() => undefined);
		const fillText = mock(() => undefined);

		await shotlyxMGGraphicDefinition.render({
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Minimal canvas context fixture for render contract.
			ctx: {
				clearRect,
				fillRect,
				strokeRect,
				fillText,
			} as unknown as OffscreenCanvasRenderingContext2D,
			params: { shotlyxMGAssetId: "missing-asset" },
			width: 512,
			height: 512,
		});

		expect(clearRect).toHaveBeenCalledTimes(1);
		expect(fillRect).not.toHaveBeenCalled();
		expect(strokeRect).not.toHaveBeenCalled();
		expect(fillText).not.toHaveBeenCalled();
	});
});
