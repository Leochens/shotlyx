/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test fixture constructs a branded timeline element. */
import { describe, expect, test } from "bun:test";
import type { GraphicElement, SceneTracks } from "@/timeline/types";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import {
	getShotlyxMGTrackZIndexMap,
	resolveShotlyxMGPreviewOpacity,
} from "../preview-overlay-helpers";
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

	test("resolves preview opacity from element params and keyframes", () => {
		const element = {
			id: "mg-element-1",
			name: "MG",
			type: "graphic",
			definitionId: "shotlyx-mg",
			startTime: 0,
			duration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			trimEnd: 0,
			params: { opacity: 1 },
			animations: {
				opacity: {
					keys: [
						{
							id: "opacity-0",
							time: 0,
							value: 1,
							segmentToNext: "linear",
							tangentMode: "auto",
						},
						{
							id: "opacity-1",
							time: MEDIA_TIME_TICKS_PER_SECOND,
							value: 0.25,
							segmentToNext: "linear",
							tangentMode: "auto",
						},
					],
				},
			},
		} as unknown as GraphicElement;

		expect(
			resolveShotlyxMGPreviewOpacity({
				element,
				currentTime: MEDIA_TIME_TICKS_PER_SECOND,
			}),
		).toBeCloseTo(0.25);
	});
});
