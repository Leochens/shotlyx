import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

const TICKS_PER_SECOND = MEDIA_TIME_TICKS_PER_SECOND;
const ZERO_MEDIA_TIME = 0;

function mediaTime({ ticks }: { ticks: number }) {
	return Math.round(ticks);
}

function roundMediaTime({ time }: { time: number }) {
	return Math.round(time);
}

function mediaTimeFromSeconds({ seconds }: { seconds: number }) {
	return roundMediaTime({ time: seconds * TICKS_PER_SECOND });
}

function mediaTimeToSeconds({ time }: { time: number }) {
	return time / TICKS_PER_SECOND;
}

function addMediaTime({ a, b }: { a: number; b: number }) {
	return mediaTime({ ticks: a + b });
}

function subMediaTime({ a, b }: { a: number; b: number }) {
	return mediaTime({ ticks: a - b });
}

function maxMediaTime({ a, b }: { a: number; b: number }) {
	return Math.max(a, b);
}

function minMediaTime({ a, b }: { a: number; b: number }) {
	return Math.min(a, b);
}

function clampMediaTime({
	time,
	min,
	max,
}: {
	time: number;
	min: number;
	max: number;
}) {
	return Math.min(Math.max(time, min), max);
}

function lastFrameMediaTime({ duration }: { duration: number }) {
	return Math.max(ZERO_MEDIA_TIME, duration - 1);
}

function roundFrameTime({ time }: { time: number }) {
	return roundMediaTime({ time });
}

function roundFrameTicks({ ticks }: { ticks: number }) {
	return Math.round(ticks);
}

function snapSeekMediaTime({ time }: { time: number }) {
	return roundMediaTime({ time });
}

function roundToFrame({ time }: { time: number }) {
	return roundMediaTime({ time });
}

function snappedSeekTime({ time }: { time: number }) {
	return roundMediaTime({ time });
}

function parseTimecode() {
	return ZERO_MEDIA_TIME;
}

function parseMediaTimecode() {
	return ZERO_MEDIA_TIME;
}

mock.module("@/wasm", () => ({
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
	mediaTime,
	roundMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	addMediaTime,
	subMediaTime,
	maxMediaTime,
	minMediaTime,
	clampMediaTime,
	lastFrameMediaTime,
	roundFrameTime,
	roundFrameTicks,
	snapSeekMediaTime,
	parseTimecode,
	parseMediaTimecode,
	roundToFrame,
	snappedSeekTime,
}));

function asEditorCore(value: unknown): EditorCore {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as EditorCore;
}

describe("creative tools integration", () => {
	test("MCPServer exposes creative tool schemas after init", async () => {
		const { MCPServer } = await import("@/agent/mcp/server");
		const server = new MCPServer();
		const editor = {
			media: {
				getAssets: () => [],
			},
			project: {
				getActiveOrNull: () => null,
			},
			selection: {
				setSelectedElements: () => {},
				clearSelection: () => {},
				getSelectedElements: () => [],
			},
			scenes: {
				getActiveSceneOrNull: () => null,
			},
			timeline: {
				addTrack: () => "track-1",
				deleteElements: () => {},
				updateElements: () => {},
				updateElementTrim: () => {},
				splitElements: () => [],
				insertElement: () => {},
				duplicateElements: () => [],
				removeTrack: () => {},
				getElementsWithTracks: () => [],
				moveElements: () => {},
				getTrackById: () => null,
				toggleTrackMute: () => {},
				toggleTrackVisibility: () => {},
				toggleElementsMuted: () => {},
				toggleElementsVisibility: () => {},
				getTotalDuration: () => 0,
				getLastFrameTime: () => 0,
			},
			playback: {
				play: () => {},
				pause: () => {},
				seek: () => {},
				getIsPlaying: () => false,
				getCurrentTime: () => ({ seconds: 0 }),
				toggle: () => {},
				setVolume: () => {},
				isMuted: () => false,
				toggleMute: () => {},
			},
		};

		server.init(asEditorCore(editor));
		const names = server.getToolSchemas().map((schema) => schema.name);

		expect(names).toContain("creative_search_video");
		expect(names).toContain("stock_search_media");
		expect(names).toContain("stock_import_media");
		expect(names).toContain("autocut_insert_broll");
		expect(names).toContain("creative_generate_image");
		expect(names).not.toContain("shotlyx_generate_mg_scene");
		expect(names).not.toContain("shotlyx_get_mg_scene_schema");
		expect(names).not.toContain("shotlyx_update_mg_props");
		expect(names).not.toContain("creative_generate_mg_animation");
		expect(names).toContain("shotlyx_generate_mg_component");
		expect(names).toContain("shotlyx_generate_mg_composition");
		expect(names).not.toContain("shotlyx_list_hyperframes_templates");
		expect(names).not.toContain("shotlyx_generate_hyperframes_overlay");
		expect(names).toContain("creative_update_mg_animation");
		expect(names).toContain("creative_update_mg_asset");
		expect(names).toContain("creative_get_mg_asset_schema");
		expect(names).toContain("creative_get_mg_animation_schema");
		expect(names).toContain("creative_import_asset");
		expect(names).toContain("agent_generate_voiceover");
	});
});
