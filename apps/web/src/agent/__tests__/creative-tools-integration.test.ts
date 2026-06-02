import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { wasmMock } from "@/test/wasm-mock";

const TICKS_PER_SECOND = wasmMock.TICKS_PER_SECOND;
const ZERO_MEDIA_TIME = wasmMock.ZERO_MEDIA_TIME;

mock.module("@/wasm", () => wasmMock);

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
		expect(names).toContain("vision_analyze_media");
	});
});
