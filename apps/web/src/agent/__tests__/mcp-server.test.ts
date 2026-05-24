import { describe, expect, test } from "bun:test";
import { MCPServer } from "@/agent/mcp/server";
import { buildTimelineTools } from "@/agent/mcp/timeline-tools";
import { buildPlaybackTools } from "@/agent/mcp/playback-tools";
import { buildSelectionTools } from "@/agent/mcp/selection-tools";
import { buildMediaTools } from "@/agent/mcp/media-tools";
import { buildProjectTools } from "@/agent/mcp/project-tools";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function mockMediaTimeFromSeconds({
	seconds,
}: {
	seconds: number;
}): import("@/wasm").MediaTime {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return Math.round(
		seconds * MEDIA_TIME_TICKS_PER_SECOND,
	) as unknown as import("@/wasm").MediaTime;
}

describe("MCPServer", () => {
	test("registers and executes a tool", async () => {
		const server = new MCPServer();
		server.register({
			name: "test_echo",
			description: "Echo back input",
			parameters: {
				msg: { type: "string", description: "Message" },
			},
			handler: (params) => params.msg,
		});

		const result = await server.execute({
			toolName: "test_echo",
			params: { msg: "hello" },
		});
		expect(result.status).toBe("success");
		expect(result.data).toBe("hello");
	});

	test("forwards progress events to tool handlers", async () => {
		const server = new MCPServer();
		server.register({
			name: "test_progress",
			description: "Emits progress",
			parameters: {},
			handler: (_params, context) => {
				context?.onProgress?.({
					stage: "generation",
					label: "已生成标题层",
					status: "success",
					current: 1,
					total: 2,
				});
				return "done";
			},
		});
		const progressEvents: Array<{ label: string; status: string }> = [];

		const result = await server.execute({
			toolName: "test_progress",
			params: {},
			onProgress: (event) => {
				progressEvents.push({
					label: event.label,
					status: event.status,
				});
			},
		});

		expect(result.status).toBe("success");
		expect(progressEvents).toEqual([
			{ label: "已生成标题层", status: "success" },
		]);
	});

	test("returns error for unknown tool", async () => {
		const server = new MCPServer();
		const result = await server.execute({ toolName: "unknown", params: {} });
		expect(result.status).toBe("error");
	});

	test("returns error on handler exception", async () => {
		const server = new MCPServer();
		server.register({
			name: "test_fail",
			description: "Always fails",
			parameters: {},
			handler: () => {
				throw new Error("boom");
			},
		});

		const result = await server.execute({
			toolName: "test_fail",
			params: {},
		});
		expect(result.status).toBe("error");
		expect(result.error).toBe("boom");
	});
});

describe("Timeline tools", () => {
	test("buildTimelineTools creates expected tools", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			timeline: {
				addTrack: () => "track-1",
				deleteElements: () => {},
			},
			scenes: {
				getActiveSceneOrNull: () => null,
			},
			selection: {
				getSelectedElements: () => [],
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildTimelineTools({
			editor: mockEditor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("timeline_add_track");
		expect(toolNames).toContain("timeline_move_clip");
		expect(toolNames).toContain("timeline_trim_clip");
		expect(toolNames).toContain("timeline_split_clip");
		expect(toolNames).toContain("timeline_delete_clip");
		expect(toolNames).toContain("timeline_delete_elements");
		expect(toolNames).toContain("timeline_get_summary");
	});

	test("timeline_get_summary returns empty when no scene", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			timeline: {},
			scenes: {
				getActiveSceneOrNull: () => null,
			},
			selection: {
				getSelectedElements: () => [],
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildTimelineTools({
			editor: mockEditor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const summaryTool = tools.find((t) => t.name === "timeline_get_summary");
		expect(summaryTool).toBeTruthy();
		const result = summaryTool?.handler({});
		expect(result).toEqual({ tracks: [], selection: null });
	});
});

describe("Playback tools", () => {
	test("buildPlaybackTools creates expected tools", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			playback: {
				play: () => {},
				pause: () => {},
				seek: () => {},
				getIsPlaying: () => false,
				getCurrentTime: () => ({ seconds: 0 }),
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildPlaybackTools({
			editor: mockEditor,
			deps: {
				mediaTimeFromSeconds: mockMediaTimeFromSeconds,
			},
		});
		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("playback_play");
		expect(toolNames).toContain("playback_pause");
		expect(toolNames).toContain("playback_seek");
		expect(toolNames).toContain("playback_get_state");
	});
});

describe("Selection tools", () => {
	test("buildSelectionTools creates expected tools", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			selection: {
				setSelectedElements: () => {},
				clearSelection: () => {},
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildSelectionTools(mockEditor);
		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("selection_select_clip");
		expect(toolNames).toContain("selection_select_elements");
		expect(toolNames).toContain("selection_clear");
	});
});

describe("Media tools", () => {
	test("buildMediaTools creates expected tools", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			media: {
				getAssets: () => [],
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildMediaTools(mockEditor);
		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("media_search");
	});

	test("media_search filters assets by query", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			media: {
				getAssets: () => [
					{
						id: "1",
						name: "Beach sunset",
						type: "video",
						duration: 10,
						width: 1920,
						height: 1080,
					},
					{
						id: "2",
						name: "Ocean waves",
						type: "audio",
						duration: 15,
					},
				],
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildMediaTools(mockEditor);
		const searchTool = tools.find((t) => t.name === "media_search");
		expect(searchTool).toBeTruthy();
		const result = searchTool?.handler({ query: "beach" });
		expect(result.count).toBe(1);
		expect(result.results[0]?.name).toBe("Beach sunset");
	});

	test("media_search filters by type", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			media: {
				getAssets: () => [
					{ id: "1", name: "Video clip", type: "video" },
					{ id: "2", name: "Audio clip", type: "audio" },
				],
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildMediaTools(mockEditor);
		const searchTool = tools.find((t) => t.name === "media_search");
		const result = searchTool?.handler({ query: "clip", type: "audio" });
		expect(result.count).toBe(1);
		expect(result.results[0]?.type).toBe("audio");
	});
});

describe("MCPServer.init() eager registration", () => {
	test("getToolSchemas includes timeline and playback tools immediately after init", () => {
		const server = new MCPServer();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			selection: {
				setSelectedElements: () => {},
				clearSelection: () => {},
				getSelectedElements: () => [],
			},
			media: { getAssets: () => [] },
			project: { getActiveOrNull: () => null },
			scenes: { getActiveSceneOrNull: () => null },
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
		} as unknown as import("@/core").EditorCore;

		server.init(mockEditor);
		const schemas = server.getToolSchemas();
		const names = schemas.map((s) => s.name);

		expect(names).toContain("timeline_add_track");
		expect(names).toContain("timeline_get_summary");
		expect(names).toContain("silence_analyze_timeline");
		expect(names).toContain("silence_apply_cut_plan");
		expect(names).toContain("playback_play");
		expect(names).toContain("playback_seek");
		expect(names).toContain("web_search");
		expect(names).toContain("web_fetch");
	});
});

describe("Project tools", () => {
	test("buildProjectTools creates expected tools", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			project: {
				getActiveOrNull: () => null,
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildProjectTools(mockEditor);
		const toolNames = tools.map((t) => t.name);
		expect(toolNames).toContain("project_get_summary");
	});

	test("project_get_summary returns fallback when no project", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const mockEditor = {
			project: {
				getActiveOrNull: () => null,
			},
		} as unknown as import("@/core").EditorCore;

		const tools = buildProjectTools(mockEditor);
		const summaryTool = tools.find((t) => t.name === "project_get_summary");
		expect(summaryTool).toBeTruthy();
		const result = summaryTool?.handler({});
		expect(result).toEqual({
			name: "未加载项目",
			id: null,
			hasActiveProject: false,
			motionGraphicAssets: [],
		});
	});
});
