import { describe, expect, test } from "bun:test";
import type { SceneTracks } from "@/timeline";
import { getShotlyxMGTrackZIndexMap } from "../components/preview-overlay";
import { getShotlyxMGThumbnailFrame } from "../preview";
import { shotlyxBattleCardFixture } from "../fixtures/battle-card";
import type { ShotlyxMGAsset } from "../types";

function buildTracks(): SceneTracks {
	return {
		overlay: [
			{
				id: "top-track",
				name: "Top",
				type: "graphic",
				elements: [],
				hidden: false,
			},
			{
				id: "bottom-track",
				name: "Bottom",
				type: "graphic",
				elements: [],
				hidden: false,
			},
		],
		main: {
			id: "main-track",
			name: "Main",
			type: "video",
			elements: [],
			muted: false,
			hidden: false,
		},
		audio: [],
	};
}

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
	test("assigns higher canvas z-index to visually higher tracks", () => {
		const zIndexByTrackId = getShotlyxMGTrackZIndexMap({
			tracks: buildTracks(),
		});

		expect(zIndexByTrackId.get("top-track")).toBeGreaterThan(
			zIndexByTrackId.get("bottom-track") ?? 0,
		);
		expect(zIndexByTrackId.get("bottom-track")).toBeGreaterThan(
			zIndexByTrackId.get("main-track") ?? 0,
		);
	});

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
