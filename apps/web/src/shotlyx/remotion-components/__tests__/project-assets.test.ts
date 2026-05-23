import { describe, expect, test } from "bun:test";
import {
	SHOTLYX_MG_BACKGROUND_COLOR_PARAM_KEY,
	SHOTLYX_MG_BACKGROUND_OPACITY_PARAM_KEY,
	buildShotlyxMGGraphicParams,
} from "../project-assets";
import { shotlyxBattleCardFixture } from "../fixtures/battle-card";

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
});
