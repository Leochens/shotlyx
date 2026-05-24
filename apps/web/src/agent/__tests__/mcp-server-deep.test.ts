import { describe, expect, test, mock } from "bun:test";
import { MCPServer } from "@/agent/mcp/server";
import { buildTimelineTools } from "@/agent/mcp/timeline-tools";
import { buildPlaybackTools } from "@/agent/mcp/playback-tools";
import { buildSelectionTools } from "@/agent/mcp/selection-tools";
import { buildMediaTools } from "@/agent/mcp/media-tools";
import { buildProjectTools } from "@/agent/mcp/project-tools";
import { buildEffectsTools } from "@/agent/mcp/effects-tools";
import { buildEditorTools } from "@/agent/mcp/editor-tools";
import type { EditorCore } from "@/core";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { TScene } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
}

function mockMediaTimeToSeconds({ time }: { time: MediaTime }): number {
	return (time as unknown as number) / MEDIA_TIME_TICKS_PER_SECOND;
}

interface MockEditorOverrides {
	timeline?: Partial<EditorCore["timeline"]>;
	playback?: Partial<EditorCore["playback"]>;
	scenes?: Partial<EditorCore["scenes"]>;
	project?: Partial<EditorCore["project"]>;
	media?: Partial<EditorCore["media"]>;
	selection?: Partial<EditorCore["selection"]>;
}

function createMockEditor(overrides: MockEditorOverrides = {}): EditorCore {
	const defaultTimeline: EditorCore["timeline"] = {
		addTrack: () => "track-1",
		updateElements: () => {},
		updateElementTrim: () => {},
		splitElements: () => [],
		deleteElements: () => {},
	} as unknown as EditorCore["timeline"];

	const defaultPlayback: EditorCore["playback"] = {
		play: () => {},
		pause: () => {},
		seek: () => {},
		getIsPlaying: () => false,
		getCurrentTime: () => mockMediaTimeFromSeconds({ seconds: 0 }),
	} as unknown as EditorCore["playback"];

	const defaultScenes: EditorCore["scenes"] = {
		getActiveSceneOrNull: () => null,
	} as unknown as EditorCore["scenes"];

	const defaultProject: EditorCore["project"] = {
		getActiveOrNull: () => null,
	} as unknown as EditorCore["project"];

	const defaultMedia: EditorCore["media"] = {
		getAssets: () => [],
	} as unknown as EditorCore["media"];

	const defaultSelection: EditorCore["selection"] = {
		setSelectedElements: () => {},
		clearSelection: () => {},
		getSelectedElements: () => [],
	} as unknown as EditorCore["selection"];

	return {
		timeline: { ...defaultTimeline, ...overrides.timeline },
		playback: { ...defaultPlayback, ...overrides.playback },
		scenes: { ...defaultScenes, ...overrides.scenes },
		project: { ...defaultProject, ...overrides.project },
		media: { ...defaultMedia, ...overrides.media },
		selection: { ...defaultSelection, ...overrides.selection },
	} as unknown as EditorCore;
}

/**
 * MCPServer.init() registers selection/media/project tools synchronously,
 * but timeline/playback tools are registered asynchronously after WASM import.
 * In tests the WASM import fails, so we manually register those tools.
 */
function initServerWithAllTools(editor: EditorCore): MCPServer {
	const server = new MCPServer();
	server.init(editor);
	for (const tool of buildTimelineTools({
		editor,
		deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
	})) {
		server.register(tool);
	}
	for (const tool of buildPlaybackTools({
		editor,
		deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
	})) {
		server.register(tool);
	}
	for (const tool of buildEditorTools({
		editor,
		deps: { mediaTimeToSeconds: mockMediaTimeToSeconds },
	})) {
		server.register(tool);
	}
	for (const tool of buildEffectsTools(editor)) {
		server.register(tool);
	}
	return server;
}

// ------------------------------------------------------------------
// MCPServer integration
// ------------------------------------------------------------------

describe("MCPServer integration", () => {
	test("init() registers all tools", () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const tools = server.getTools();
		const names = tools.map((t) => t.name);

		expect(names).toContain("timeline_add_track");
		expect(names).toContain("timeline_move_clip");
		expect(names).toContain("timeline_trim_clip");
		expect(names).toContain("timeline_split_clip");
		expect(names).toContain("timeline_delete_clip");
		expect(names).toContain("timeline_delete_elements");
		expect(names).toContain("timeline_get_summary");
		expect(names).toContain("playback_play");
		expect(names).toContain("playback_pause");
		expect(names).toContain("playback_seek");
		expect(names).toContain("playback_get_state");
		expect(names).toContain("selection_select_clip");
		expect(names).toContain("selection_select_elements");
		expect(names).toContain("selection_clear");
		expect(names).toContain("media_search");
		expect(names).toContain("project_get_summary");
		expect(names).toContain("editor_get_status");
	});

	test("execute() routes to correct tool", async () => {
		const server = new MCPServer();
		server.register({
			name: "test_add",
			description: "Add two numbers",
			parameters: {
				a: { type: "number", description: "First number" },
				b: { type: "number", description: "Second number" },
			},
			handler: (params) => {
				const a = Number(params.a);
				const b = Number(params.b);
				return { sum: a + b };
			},
		});

		const result = await server.execute({
			toolName: "test_add",
			params: { a: 2, b: 3 },
		});

		expect(result.status).toBe("success");
		expect(result.data).toEqual({ sum: 5 });
	});

	test("execute() returns error for unknown tool", async () => {
		const server = new MCPServer();
		const result = await server.execute({
			toolName: "nonexistent_tool",
			params: {},
		});

		expect(result.status).toBe("error");
		expect(result.error).toContain("nonexistent_tool");
	});

	test("execute() catches handler exceptions and returns error", async () => {
		const server = new MCPServer();
		server.register({
			name: "test_throw",
			description: "Throws an error",
			parameters: {},
			handler: () => {
				throw new Error("handler exploded");
			},
		});

		const result = await server.execute({
			toolName: "test_throw",
			params: {},
		});

		expect(result.status).toBe("error");
		expect(result.error).toBe("handler exploded");
	});

	test("getToolSchemas() generates required fields correctly", () => {
		const server = new MCPServer();
		server.register({
			name: "test_schema",
			description: "Schema test",
			parameters: {
				requiredField: { type: "string", description: "Required" },
				optionalField: {
					type: "number",
					description: "Optional",
					optional: true,
				},
			},
			handler: () => "ok",
		});

		const schemas = server.getToolSchemas();
		const schema = schemas.find((s) => s.name === "test_schema");

		expect(schema).toBeTruthy();
		expect(schema?.parameters.required).toContain("requiredField");
		expect(schema?.parameters.required).not.toContain("optionalField");
	});
});

// ------------------------------------------------------------------
// timeline_add_track
// ------------------------------------------------------------------

describe("timeline_add_track", () => {
	function setup() {
		const addTrack = mock(() => "track-new");
		const editor = createMockEditor({
			timeline: { addTrack },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_add_track");
		return { tool, addTrack };
	}

	test("positive path: adds track with valid type", () => {
		const { tool, addTrack } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ type: "video" });
		expect(result).toBe("track-new");
		expect(addTrack.mock.calls.length).toBe(1);
		expect(addTrack.mock.calls[0]?.[0]).toEqual({
			type: "video",
			index: undefined,
		});
	});

	test("positive path: adds track with optional index", () => {
		const { tool, addTrack } = setup();
		const result = tool?.handler({ type: "audio", index: 2 });
		expect(result).toBe("track-new");
		expect(addTrack.mock.calls.length).toBe(1);
		expect(addTrack.mock.calls[0]?.[0]).toEqual({ type: "audio", index: 2 });
	});

	test("parameter validation: missing type throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow("类型不匹配：无效的轨道类型");
	});

	test("parameter validation: invalid type throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ type: "invalid" })).toThrow(
			"类型不匹配：无效的轨道类型",
		);
	});

	test("parameter validation: empty string type throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ type: "" })).toThrow(
			"类型不匹配：无效的轨道类型",
		);
	});
});

// ------------------------------------------------------------------
// timeline_move_clip
// ------------------------------------------------------------------

describe("timeline_move_clip", () => {
	function setup() {
		const updateElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { updateElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_move_clip");
		return { tool, updateElements };
	}

	test("positive path: moves clip to new time", () => {
		const { tool, updateElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			newStartTimeSeconds: 5.5,
		});

		expect(result).toEqual({
			trackId: "t1",
			elementId: "e1",
			newStartTime: 5.5,
		});
		expect(updateElements.mock.calls.length).toBe(1);
	});

	test("parameter validation: missing trackId throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({ elementId: "e1", newStartTimeSeconds: 1 }),
		).toThrow('参数缺失："trackId" 为必填项，且必须为非空字符串');
	});

	test("parameter validation: NaN newStartTimeSeconds throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				trackId: "t1",
				elementId: "e1",
				newStartTimeSeconds: Number.NaN,
			}),
		).toThrow('参数缺失："newStartTimeSeconds" 为必填项，且必须为有效数字');
	});
});

// ------------------------------------------------------------------
// timeline_trim_clip
// ------------------------------------------------------------------

describe("timeline_trim_clip", () => {
	function setup() {
		const updateElementTrim = mock(() => {});
		const editor = createMockEditor({
			timeline: { updateElementTrim },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_trim_clip");
		return { tool, updateElementTrim };
	}

	test("positive path: trims clip with valid values", () => {
		const { tool, updateElementTrim } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			elementId: "e1",
			trimStartSeconds: 1.0,
			trimEndSeconds: 2.5,
		});

		expect(result).toEqual({
			elementId: "e1",
			trimStart: 1.0,
			trimEnd: 2.5,
		});
		expect(updateElementTrim.mock.calls.length).toBe(1);
	});

	test("parameter validation: NaN trimStartSeconds throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				elementId: "e1",
				trimStartSeconds: Number.NaN,
				trimEndSeconds: 2.0,
			}),
		).toThrow('参数缺失："trimStartSeconds" 为必填项，且必须为有效数字');
	});

	test("parameter validation: NaN trimEndSeconds throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				elementId: "e1",
				trimStartSeconds: 1.0,
				trimEndSeconds: Number.NaN,
			}),
		).toThrow('参数缺失："trimEndSeconds" 为必填项，且必须为有效数字');
	});

	test("parameter validation: both NaN throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				elementId: "e1",
				trimStartSeconds: Number.NaN,
				trimEndSeconds: Number.NaN,
			}),
		).toThrow('参数缺失："trimStartSeconds" 为必填项，且必须为有效数字');
	});
});

// ------------------------------------------------------------------
// timeline_split_clip
// ------------------------------------------------------------------

describe("timeline_split_clip", () => {
	function setup() {
		const splitElements = mock(() => [
			{ trackId: "t1", elementId: "e1-right" },
		]);
		const editor = createMockEditor({
			timeline: { splitElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_split_clip");
		return { tool, splitElements };
	}

	test("positive path: splits clip at given time", () => {
		const { tool, splitElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			splitTimeSeconds: 3.0,
		});

		expect(result).toEqual({
			trackId: "t1",
			elementId: "e1",
			splitTime: 3.0,
			newElements: [{ trackId: "t1", elementId: "e1-right" }],
		});
		expect(splitElements.mock.calls.length).toBe(1);
	});

	test("parameter validation: NaN splitTimeSeconds throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				trackId: "t1",
				elementId: "e1",
				splitTimeSeconds: Number.NaN,
			}),
		).toThrow('参数缺失："splitTimeSeconds" 为必填项，且必须为有效数字');
	});
});

// ------------------------------------------------------------------
// timeline_delete_clip
// ------------------------------------------------------------------

describe("timeline_delete_clip", () => {
	function setup() {
		const deleteElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { deleteElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_delete_clip");
		return { tool, deleteElements };
	}

	test("positive path: deletes single clip", () => {
		const { tool, deleteElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1", elementId: "e1" });

		expect(result).toEqual({ deleted: true, trackId: "t1", elementId: "e1" });
		expect(deleteElements.mock.calls.length).toBe(1);
		expect(deleteElements.mock.calls[0]?.[0]).toEqual({
			elements: [{ trackId: "t1", elementId: "e1" }],
		});
	});
});

// ------------------------------------------------------------------
// timeline_delete_elements
// ------------------------------------------------------------------

describe("timeline_delete_elements", () => {
	function setup() {
		const deleteElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { deleteElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_delete_elements");
		return { tool, deleteElements };
	}

	test("positive path: deletes multiple elements", () => {
		const { tool, deleteElements } = setup();
		expect(tool).toBeTruthy();

		const refs = [
			{ trackId: "t1", elementId: "e1" },
			{ trackId: "t2", elementId: "e2" },
		];
		const result = tool?.handler({ elementRefs: refs });

		expect(result).toEqual({ deleted: 2 });
		expect(deleteElements.mock.calls.length).toBe(1);
		expect(deleteElements.mock.calls[0]?.[0]).toEqual({ elements: refs });
	});

	test("parameter validation: missing elementRefs throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("parameter validation: empty array is valid", () => {
		const { tool, deleteElements } = setup();
		const result = tool?.handler({ elementRefs: [] });

		expect(result).toEqual({ deleted: 0 });
		expect(deleteElements.mock.calls.length).toBe(1);
		expect(deleteElements.mock.calls[0]?.[0]).toEqual({ elements: [] });
	});

	test("parameter validation: non-array elementRefs throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ elementRefs: "not-an-array" })).toThrow(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("parameter validation: array with invalid items throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				elementRefs: [{ trackId: "t1" }],
			}),
		).toThrow("参数格式错误：elementRefs 必须为 { trackId, elementId } 数组");
	});
});

// ------------------------------------------------------------------
// timeline_get_summary
// ------------------------------------------------------------------

describe("timeline_get_summary", () => {
	function setup(overrides: MockEditorOverrides = {}) {
		const editor = createMockEditor(overrides);
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_get_summary");
		return { tool };
	}

	test("positive path: returns empty when no active scene", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(result).toEqual({ tracks: [], selection: null });
	});

	test("positive path: returns tracks and selection from active scene", () => {
		const { tool } = setup({
			scenes: {
				getActiveSceneOrNull: () =>
					({
						tracks: {
							main: {
								id: "main-track",
								name: "Main",
								type: "video",
								elements: [{ id: "e1" }],
							},
							overlay: [],
							audio: [
								{
									id: "audio-track",
									name: "Audio",
									type: "audio",
									elements: [{ id: "e2" }, { id: "e3" }],
								},
							],
						},
					}) as unknown as TScene,
			},
			selection: {
				getSelectedElements: () => [{ trackId: "main-track", elementId: "e1" }],
			},
		});

		const result = tool?.handler({});
		expect(result.tracks).toEqual([
			{ id: "main-track", name: "Main", type: "video", elementCount: 1 },
			{ id: "audio-track", name: "Audio", type: "audio", elementCount: 2 },
		]);
		expect(result.selection).toEqual([
			{ trackId: "main-track", elementId: "e1" },
		]);
	});
});

// ------------------------------------------------------------------
// playback_play
// ------------------------------------------------------------------

describe("playback_play", () => {
	function setup() {
		const play = mock(() => {});
		const editor = createMockEditor({
			playback: { play },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_play");
		return { tool, play };
	}

	test("positive path: starts playback", () => {
		const { tool, play } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(play.mock.calls.length).toBe(1);
		expect(result).toEqual({ isPlaying: true });
	});
});

// ------------------------------------------------------------------
// playback_pause
// ------------------------------------------------------------------

describe("playback_pause", () => {
	function setup() {
		const pause = mock(() => {});
		const editor = createMockEditor({
			playback: { pause },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_pause");
		return { tool, pause };
	}

	test("positive path: pauses playback", () => {
		const { tool, pause } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(pause.mock.calls.length).toBe(1);
		expect(result).toEqual({ isPlaying: false });
	});
});

// ------------------------------------------------------------------
// playback_seek
// ------------------------------------------------------------------

describe("playback_seek", () => {
	function setup() {
		const seek = mock(() => {});
		const editor = createMockEditor({
			playback: { seek },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_seek");
		return { tool, seek };
	}

	test("positive path: seeks to given time", () => {
		const { tool, seek } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ time: 12.5 });
		expect(seek.mock.calls.length).toBe(1);
		expect(result).toEqual({ currentTime: 12.5 });
	});

	test("parameter validation: missing time throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow(
			'参数缺失："time" 为必填项，且必须为有效数字',
		);
	});
});

// ------------------------------------------------------------------
// playback_get_state
// ------------------------------------------------------------------

describe("playback_get_state", () => {
	function setup() {
		const editor = createMockEditor({
			playback: {
				getIsPlaying: () => true,
				getCurrentTime: () => mockMediaTimeFromSeconds({ seconds: 7.5 }),
			},
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_get_state");
		return { tool };
	}

	test("positive path: returns playback state", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(result).toEqual({
			isPlaying: true,
			currentTime: mockMediaTimeFromSeconds({ seconds: 7.5 }),
		});
	});
});

// ------------------------------------------------------------------
// selection_select_clip
// ------------------------------------------------------------------

describe("selection_select_clip", () => {
	function setup() {
		const setSelectedElements = mock(() => {});
		const editor = createMockEditor({
			selection: { setSelectedElements },
		});
		const tools = buildSelectionTools(editor);
		const tool = tools.find((t) => t.name === "selection_select_clip");
		return { tool, setSelectedElements };
	}

	test("positive path: selects a single clip", () => {
		const { tool, setSelectedElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1", elementId: "e1" });
		expect(setSelectedElements.mock.calls.length).toBe(1);
		expect(setSelectedElements.mock.calls[0]?.[0]).toEqual({
			elements: [{ trackId: "t1", elementId: "e1" }],
		});
		expect(result).toEqual({ selected: 1, trackId: "t1", elementId: "e1" });
	});
});

// ------------------------------------------------------------------
// selection_select_elements
// ------------------------------------------------------------------

describe("selection_select_elements", () => {
	function setup() {
		const setSelectedElements = mock(() => {});
		const editor = createMockEditor({
			selection: { setSelectedElements },
		});
		const tools = buildSelectionTools(editor);
		const tool = tools.find((t) => t.name === "selection_select_elements");
		return { tool, setSelectedElements };
	}

	test("positive path: selects multiple elements", () => {
		const { tool, setSelectedElements } = setup();
		expect(tool).toBeTruthy();

		const refs = [
			{ trackId: "t1", elementId: "e1" },
			{ trackId: "t2", elementId: "e2" },
		];
		const result = tool?.handler({ elementRefs: refs });
		expect(setSelectedElements.mock.calls.length).toBe(1);
		expect(setSelectedElements.mock.calls[0]?.[0]).toEqual({ elements: refs });
		expect(result).toEqual({ selected: 2 });
	});

	test("parameter validation: missing elementRefs throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("parameter validation: non-array elementRefs throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ elementRefs: "bad" })).toThrow(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("parameter validation: array with invalid items throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				elementRefs: [{ trackId: "t1", elementId: 123 }],
			}),
		).toThrow("参数格式错误：elementRefs 必须为 { trackId, elementId } 数组");
	});

	test("parameter validation: empty array is valid", () => {
		const { tool, setSelectedElements } = setup();
		const result = tool?.handler({ elementRefs: [] });
		expect(result).toEqual({ selected: 0 });
		expect(setSelectedElements.mock.calls.length).toBe(1);
		expect(setSelectedElements.mock.calls[0]?.[0]).toEqual({ elements: [] });
	});
});

// ------------------------------------------------------------------
// selection_clear
// ------------------------------------------------------------------

describe("selection_clear", () => {
	function setup() {
		const clearSelection = mock(() => {});
		const editor = createMockEditor({
			selection: { clearSelection },
		});
		const tools = buildSelectionTools(editor);
		const tool = tools.find((t) => t.name === "selection_clear");
		return { tool, clearSelection };
	}

	test("positive path: clears selection", () => {
		const { tool, clearSelection } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(clearSelection.mock.calls.length).toBe(1);
		expect(result).toEqual({ cleared: true });
	});
});

// ------------------------------------------------------------------
// media_search
// ------------------------------------------------------------------

describe("media_search", () => {
	function setup(assets: MediaAsset[] = []) {
		const editor = createMockEditor({
			media: {
				getAssets: () => assets,
			},
		});
		const tools = buildMediaTools(editor);
		const tool = tools.find((t) => t.name === "media_search");
		return { tool };
	}

	test("positive path: returns all assets when query is empty", () => {
		const assets: MediaAsset[] = [
			{
				id: "1",
				name: "Beach sunset",
				type: "video",
				duration: 10,
				width: 1920,
				height: 1080,
				fps: 30,
				url: "",
				thumbnailUrl: null,
				createdAt: new Date(),
			},
		];
		const { tool } = setup(assets);
		expect(tool).toBeTruthy();

		const result = tool?.handler({ query: "" });
		expect(result.count).toBe(1);
		expect(result.results[0]?.name).toBe("Beach sunset");
	});

	test("positive path: filters by query case-insensitively", () => {
		const assets: MediaAsset[] = [
			{ id: "1", name: "Beach sunset", type: "video", duration: 10 },
			{ id: "2", name: "Ocean waves", type: "audio", duration: 15 },
			{ id: "3", name: "Mountain peak", type: "image", duration: 0 },
		] as MediaAsset[];
		const { tool } = setup(assets);

		const result = tool?.handler({ query: "BEACH" });
		expect(result.count).toBe(1);
		expect(result.results[0]?.name).toBe("Beach sunset");
	});

	test("positive path: filters by type", () => {
		const assets: MediaAsset[] = [
			{ id: "1", name: "Clip A", type: "video", duration: 10 },
			{ id: "2", name: "Clip B", type: "audio", duration: 15 },
			{ id: "3", name: "Clip C", type: "video", duration: 20 },
		] as MediaAsset[];
		const { tool } = setup(assets);

		const result = tool?.handler({ query: "clip", type: "video" });
		expect(result.count).toBe(2);
		expect(
			result.results.every((a: { type: string }) => a.type === "video"),
		).toBe(true);
	});

	test("parameter validation: missing query returns all assets", () => {
		const assets: MediaAsset[] = [
			{ id: "1", name: "Test", type: "video", duration: 5 },
		] as MediaAsset[];
		const { tool } = setup(assets);

		const result = tool?.handler({});
		expect(result.count).toBe(1);
	});

	test("parameter validation: empty string query returns all assets", () => {
		const assets: MediaAsset[] = [
			{ id: "1", name: "Test", type: "video", duration: 5 },
		] as MediaAsset[];
		const { tool } = setup(assets);

		const result = tool?.handler({ query: "" });
		expect(result.count).toBe(1);
	});

	test("returns empty results when no matches", () => {
		const assets: MediaAsset[] = [
			{ id: "1", name: "Test", type: "video", duration: 5 },
		] as MediaAsset[];
		const { tool } = setup(assets);

		const result = tool?.handler({ query: "nonexistent" });
		expect(result.count).toBe(0);
		expect(result.results).toEqual([]);
	});
});

// ------------------------------------------------------------------
// project_get_summary
// ------------------------------------------------------------------

describe("project_get_summary", () => {
	function setup(project: TProject | null = null) {
		const editor = createMockEditor({
			project: {
				getActiveOrNull: () => project,
			},
		});
		const tools = buildProjectTools(editor);
		const tool = tools.find((t) => t.name === "project_get_summary");
		return { tool };
	}

	test("positive path: returns project metadata", () => {
		const project: TProject = {
			metadata: {
				id: "proj-1",
				name: "My Project",
				duration: 120,
				createdAt: new Date("2024-01-01"),
				updatedAt: new Date("2024-01-02"),
			},
			scenes: [],
			currentSceneId: null,
			settings: {
				fps: { num: 30, den: 1 },
				canvasSize: { width: 1920, height: 1080 },
				canvasSizeMode: "preset",
				lastCustomCanvasSize: null,
				originalCanvasSize: null,
				background: { type: "color", color: "#000000" },
			},
			version: 1,
		};
		const { tool } = setup(project);
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(result).toEqual({
			name: "My Project",
			id: "proj-1",
			hasActiveProject: true,
			motionGraphicAssets: [],
		});
	});

	test("positive path: returns fallback when no project", () => {
		const { tool } = setup(null);
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(result).toEqual({
			name: "未加载项目",
			id: null,
			hasActiveProject: false,
			motionGraphicAssets: [],
		});
	});
});

// ------------------------------------------------------------------
// Error handling via MCPServer.execute
// ------------------------------------------------------------------

describe("Tool error handling via MCPServer.execute", () => {
	test("timeline_add_track invalid type returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "timeline_add_track",
			params: { type: "invalid_type" },
		});

		expect(result.status).toBe("error");
		expect(result.error).toContain("类型不匹配：无效的轨道类型");
	});

	test("timeline_delete_elements invalid refs returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "timeline_delete_elements",
			params: { elementRefs: "bad" },
		});

		expect(result.status).toBe("error");
		expect(result.error).toContain(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("selection_select_elements invalid refs returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "selection_select_elements",
			params: { elementRefs: [{ noId: true }] },
		});

		expect(result.status).toBe("error");
		expect(result.error).toContain(
			"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
		);
	});

	test("timeline_move_clip with NaN returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "timeline_move_clip",
			params: {
				trackId: "t1",
				elementId: "e1",
				newStartTimeSeconds: Number.NaN,
			},
		});

		expect(result.status).toBe("error");
		expect(result.error).toBe(
			'参数缺失："newStartTimeSeconds" 为必填项，且必须为有效数字',
		);
	});

	test("timeline_trim_clip with NaN returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "timeline_trim_clip",
			params: {
				elementId: "e1",
				trimStartSeconds: Number.NaN,
				trimEndSeconds: 2.0,
			},
		});

		expect(result.status).toBe("error");
		expect(result.error).toBe(
			'参数缺失："trimStartSeconds" 为必填项，且必须为有效数字',
		);
	});

	test("timeline_split_clip with NaN returns error through execute", async () => {
		const editor = createMockEditor();
		const server = initServerWithAllTools(editor);

		const result = await server.execute({
			toolName: "timeline_split_clip",
			params: {
				trackId: "t1",
				elementId: "e1",
				splitTimeSeconds: Number.NaN,
			},
		});

		expect(result.status).toBe("error");
		expect(result.error).toBe(
			'参数缺失："splitTimeSeconds" 为必填项，且必须为有效数字',
		);
	});
});

// ------------------------------------------------------------------
// Phase 7 — New tools
// ------------------------------------------------------------------

describe("editor_get_status", () => {
	function setup() {
		const editor = createMockEditor({
			project: {
				getActiveOrNull: () =>
					({
						metadata: { id: "p1", name: "Test" },
					}) as unknown as import("@/project/types").TProject,
			},
			scenes: {
				getActiveSceneOrNull: () =>
					({
						tracks: {
							main: { id: "t0", elements: [{ id: "e1" }] },
							overlay: [{ id: "t1", elements: [{ id: "e2" }] }],
							audio: [{ id: "t2", elements: [] }],
						},
					}) as unknown as TScene,
			},
			selection: {
				getSelectedElements: () => [{ trackId: "t0", elementId: "e1" }],
			},
			timeline: {
				getTotalDuration: () => 0 as MediaTime,
			},
			playback: {
				getCurrentTime: () => 0 as MediaTime,
			},
		});
		const tools = buildEditorTools({
			editor,
			deps: { mediaTimeToSeconds: mockMediaTimeToSeconds },
		});
		const tool = tools.find((t) => t.name === "editor_get_status");
		return { tool };
	}

	test("positive path: returns editor status", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});
		expect(result.projectLoaded).toBe(true);
		expect(result.trackCount).toBe(3);
		expect(result.elementCount).toBe(2);
		expect(result.selectedElements).toBe(1);
	});
});

describe("timeline_batch_update", () => {
	function setup() {
		const updateElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { updateElements },
			scenes: {
				getActiveSceneOrNull: () =>
					({
						tracks: {
							main: { id: "t0", elements: [{ id: "e1" }] },
							overlay: [],
							audio: [],
						},
					}) as unknown as TScene,
			},
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_batch_update");
		return { tool, updateElements };
	}

	test("positive path: batch updates with auto-resolved trackId", () => {
		const { tool, updateElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			updates: [{ elementId: "e1", params: { opacity: 0.5 } }],
		});

		expect(result.updated).toBe(1);
		expect(updateElements.mock.calls.length).toBe(1);
		const call = updateElements.mock.calls[0]?.[0];
		expect(call.updates[0].trackId).toBe("t0");
		expect(call.updates[0].elementId).toBe("e1");
		expect(call.updates[0].patch.params.opacity).toBe(0.5);
	});

	test("error: element not found throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				updates: [{ elementId: "missing", params: { opacity: 0.5 } }],
			}),
		).toThrow("片段不存在");
	});

	test("error: invalid params type throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				updates: [{ elementId: "e1", params: "bad" }],
			}),
		).toThrow("参数格式错误");
	});
});

describe("media_import", () => {
	function setup() {
		const editor = createMockEditor({
			project: {
				getActiveOrNull: () =>
					({
						metadata: { id: "p1" },
					}) as unknown as import("@/project/types").TProject,
			},
		});
		const tools = buildMediaTools(editor);
		const tool = tools.find((t) => t.name === "media_import");
		return { tool };
	}

	test("error: invalid type hint throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				source: "http://example.com/video.mp4",
				type: "invalid",
			}),
		).toThrow("类型不匹配");
	});

	test("error: no project loaded throws error", () => {
		const editor = createMockEditor();
		const tools = buildMediaTools(editor);
		const tool = tools.find((t) => t.name === "media_import");
		expect(() =>
			tool?.handler({ source: "http://example.com/video.mp4" }),
		).toThrow("未加载项目");
	});
});
