import { describe, expect, test, mock } from "bun:test";
import { buildTimelineTools } from "@/agent/mcp/timeline-tools";
import { buildPlaybackTools } from "@/agent/mcp/playback-tools";
import { buildSelectionTools } from "@/agent/mcp/selection-tools";
import { buildMediaTools } from "@/agent/mcp/media-tools";
import { buildProjectTools } from "@/agent/mcp/project-tools";
import { buildSceneTools } from "@/agent/mcp/scene-tools";
import type { EditorCore } from "@/core";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";
import type { TScene } from "@/timeline";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
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
		getTrackById: () => null,
		insertElement: () => {},
		duplicateElements: () => [],
		removeTrack: () => {},
		getElementsWithTracks: () => [],
		moveElements: () => {},
		toggleTrackMute: () => {},
		toggleTrackVisibility: () => {},
		toggleElementsMuted: () => {},
		toggleElementsVisibility: () => {},
		getTotalDuration: () => 0,
		getLastFrameTime: () => 0,
	} as unknown as EditorCore["timeline"];

	const defaultPlayback: EditorCore["playback"] = {
		play: () => {},
		pause: () => {},
		seek: () => {},
		getIsPlaying: () => false,
		getCurrentTime: () => mockMediaTimeFromSeconds({ seconds: 0 }),
		toggle: () => {},
		setVolume: () => {},
		toggleMute: () => {},
		isMuted: () => false,
	} as unknown as EditorCore["playback"];

	const defaultScenes: EditorCore["scenes"] = {
		getActiveSceneOrNull: () => null,
		getScenes: () => [],
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
		getActiveSelectionKind: () => "none",
		getSelectedKeyframes: () => [],
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

function createSceneWithMainElement(elementId = "e1"): TScene {
	return {
		id: "scene-1",
		name: "Scene 1",
		isMain: true,
		tracks: {
			main: {
				id: "t1",
				name: "Main",
				type: "video",
				muted: false,
				hidden: false,
				elements: [
					{
						id: elementId,
						type: "video",
						name: "Clip 1",
						mediaId: "media-1",
						startTime: 0 as unknown as MediaTime,
						duration: MEDIA_TIME_TICKS_PER_SECOND as unknown as MediaTime,
						trimStart: 0 as unknown as MediaTime,
						trimEnd: 0 as unknown as MediaTime,
						params: {},
					},
				],
			},
			overlay: [],
			audio: [],
		},
		bookmarks: [],
		createdAt: new Date(0),
		updatedAt: new Date(0),
	} as unknown as TScene;
}

// ------------------------------------------------------------------
// Phase 5 — Timeline insert/duplicate/remove
// ------------------------------------------------------------------

describe("timeline_insert_media", () => {
	function setup(assets: MediaAsset[] = []) {
		const insertElement = mock(() => {});
		const getTrackById = mock(() => ({
			id: "track-1",
			type: "video",
			elements: [],
		}));
		const editor = createMockEditor({
			timeline: { insertElement, getTrackById },
			media: {
				getAssets: () => assets,
			},
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_insert_media");
		return { tool, insertElement, getTrackById };
	}

	test("positive path: inserts video asset onto track", () => {
		const asset: MediaAsset = {
			id: "media-1",
			name: "Test video",
			type: "video",
			duration: 10,
			width: 1920,
			height: 1080,
			fps: 30,
			url: "",
			thumbnailUrl: null,
			createdAt: new Date(),
		};
		const { tool, insertElement } = setup([asset]);
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "track-1",
			mediaId: "media-1",
			startTimeSeconds: 5,
		});

		expect(result.trackId).toBe("track-1");
		expect(result.mediaId).toBe("media-1");
		expect(result.startTime).toBe(5);
		expect(insertElement.mock.calls.length).toBe(1);
	});

	test("error: missing trackId throws error", () => {
		const { tool } = setup([]);
		expect(() => tool?.handler({ mediaId: "m1", startTimeSeconds: 0 })).toThrow(
			"trackId",
		);
	});

	test("error: missing mediaId throws error", () => {
		const { tool } = setup([]);
		expect(() => tool?.handler({ trackId: "t1", startTimeSeconds: 0 })).toThrow(
			"mediaId",
		);
	});

	test("error: asset not found throws error", () => {
		const { tool } = setup([]);
		expect(() =>
			tool?.handler({ trackId: "t1", mediaId: "missing", startTimeSeconds: 0 }),
		).toThrow("找不到媒体资源");
	});

	test("error: track not found throws error", () => {
		const asset: MediaAsset = {
			id: "media-1",
			name: "Test",
			type: "video",
			duration: 10,
			width: 1920,
			height: 1080,
			fps: 30,
			url: "",
			thumbnailUrl: null,
			createdAt: new Date(),
		};
		const getTrackById = mock(() => null);
		const editor = createMockEditor({
			timeline: { getTrackById },
			media: { getAssets: () => [asset] },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_insert_media");
		expect(() =>
			tool?.handler({ trackId: "t1", mediaId: "media-1", startTimeSeconds: 0 }),
		).toThrow("轨道不存在");
	});
});

describe("timeline_insert_text", () => {
	function setup({
		trackType = "text",
	}: {
		trackType?: "video" | "text" | "audio" | "graphic" | "effect";
	} = {}) {
		const insertElement = mock(() => ({
			elementId: "text-element-1",
			trackId: "text-track-1",
		}));
		const getTrackById = mock(() => ({
			id: "text-track-1",
			type: trackType,
			elements: [],
		}));
		const editor = createMockEditor({
			timeline: { insertElement, getTrackById },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_insert_text");
		return { tool, insertElement, getTrackById };
	}

	test("positive path: inserts a text element with styling", () => {
		const { tool, insertElement } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			content: "花生：地下宝藏",
			startTimeSeconds: 1,
			durationSeconds: 4,
			fontSize: 28,
			color: "#22c55e",
			fontFamily: "Arial",
			positionX: 120,
			positionY: 640,
		});

		expect(result).toMatchObject({
			inserted: true,
			trackId: "text-track-1",
			elementId: "text-element-1",
			content: "花生：地下宝藏",
			startTime: 1,
			duration: 4,
		});
		expect(insertElement.mock.calls.length).toBe(1);
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "text",
				name: "Text",
					startTime: MEDIA_TIME_TICKS_PER_SECOND,
					duration: 4 * MEDIA_TIME_TICKS_PER_SECOND,
				params: {
					content: "花生：地下宝藏",
					fontSize: 28,
					color: "#22c55e",
					fontFamily: "Arial",
					"transform.positionX": 120,
					"transform.positionY": 640,
				},
			},
			placement: { mode: "auto", trackType: "text" },
		});
	});

	test("error: explicit non-text track is rejected", () => {
		const { tool } = setup({ trackType: "video" });
		expect(tool).toBeTruthy();

		expect(() =>
			tool?.handler({
				trackId: "video-track-1",
				content: "Wrong track",
				startTimeSeconds: 0,
			}),
		).toThrow("类型不匹配");
	});
});

describe("timeline_duplicate_clip", () => {
	function setup() {
		const duplicateElements = mock(() => [{ trackId: "t1", elementId: "e2" }]);
		const editor = createMockEditor({
			timeline: { duplicateElements },
			scenes: { getActiveSceneOrNull: () => createSceneWithMainElement() },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_duplicate_clip");
		return { tool, duplicateElements };
	}

	test("positive path: duplicates a clip", () => {
		const { tool, duplicateElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1", elementId: "e1" });

		expect(result.duplicated).toBe(1);
		expect(result.newElements).toEqual([{ trackId: "t1", elementId: "e2" }]);
		expect(duplicateElements.mock.calls.length).toBe(1);
	});

	test("positive path: resolves trackId from elementId when omitted", () => {
		const { tool, duplicateElements } = setup();
		expect(tool).toBeTruthy();

		tool?.handler({ elementId: "e1" });

		expect(duplicateElements.mock.calls[0]?.[0]).toEqual({
			elements: [{ trackId: "t1", elementId: "e1" }],
		});
	});
});

describe("timeline_remove_track", () => {
	function setup() {
		const removeTrack = mock(() => {});
		const editor = createMockEditor({
			timeline: { removeTrack },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_remove_track");
		return { tool, removeTrack };
	}

	test("positive path: removes track", () => {
		const { tool, removeTrack } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1" });

		expect(result.removed).toBe(true);
		expect(result.trackId).toBe("t1");
		expect(removeTrack.mock.calls.length).toBe(1);
	});

	test("error: missing trackId throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow("trackId");
	});
});

// ------------------------------------------------------------------
// Phase 5 — Timeline get_details / move_to_track
// ------------------------------------------------------------------

describe("timeline_get_clip_details", () => {
	function setup() {
		const getElementsWithTracks = mock(() => [
			{
				trackId: "t1",
				element: {
					id: "e1",
					name: "Clip 1",
					type: "video",
					startTime: mockMediaTimeFromSeconds({ seconds: 5 }),
					duration: mockMediaTimeFromSeconds({ seconds: 10 }),
					trimStart: 0 as MediaTime,
					trimEnd: 0 as MediaTime,
					params: { opacity: 1 },
					effects: [{ id: "fx1", type: "blur", enabled: true }],
					animations: {},
				},
			},
		]);
		const editor = createMockEditor({
			timeline: { getElementsWithTracks },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_get_clip_details");
		return { tool, getElementsWithTracks };
	}

	test("positive path: returns clip details", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1", elementId: "e1" });

		expect(result.id).toBe("e1");
		expect(result.name).toBe("Clip 1");
		expect(result.type).toBe("video");
		expect(result.effects).toEqual([
			{ id: "fx1", type: "blur", enabled: true },
		]);
	});

	test("error: clip not found throws error", () => {
		const getElementsWithTracks = mock(() => []);
		const editor = createMockEditor({
			timeline: { getElementsWithTracks },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_get_clip_details");
		expect(() => tool?.handler({ trackId: "t1", elementId: "e1" })).toThrow(
			"片段不存在",
		);
	});
});

describe("timeline_move_clip_to_track", () => {
	function setup() {
		const moveElements = mock(() => {});
		const getTrackById = mock((args: { trackId: string }) => ({
			id: args.trackId,
			type: "video",
			elements: [
				{ id: "e1", startTime: mockMediaTimeFromSeconds({ seconds: 5 }) },
			],
		}));
		const editor = createMockEditor({
			timeline: { moveElements, getTrackById },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_move_clip_to_track");
		return { tool, moveElements, getTrackById };
	}

	test("positive path: moves clip to new track", () => {
		const { tool, moveElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			targetTrackId: "t2",
			newStartTimeSeconds: 10,
		});

		expect(result.targetTrackId).toBe("t2");
		expect(moveElements.mock.calls.length).toBe(1);
	});

	test("positive path: moves without changing time", () => {
		const { tool, moveElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			targetTrackId: "t2",
		});

		expect(result.newStartTime).toBeUndefined();
		expect(moveElements.mock.calls.length).toBe(1);
	});

	test("error: source track not found throws error", () => {
		const getTrackById = mock(() => null);
		const editor = createMockEditor({
			timeline: { getTrackById },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_move_clip_to_track");
		expect(() =>
			tool?.handler({ trackId: "t1", elementId: "e1", targetTrackId: "t2" }),
		).toThrow("轨道不存在");
	});
});

// ------------------------------------------------------------------
// Phase 5 — Property modification
// ------------------------------------------------------------------

describe("timeline_update_element_params", () => {
	function setup() {
		const updateElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { updateElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_update_element_params");
		return { tool, updateElements };
	}

	test("positive path: updates element params", () => {
		const { tool, updateElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			params: { opacity: 0.5, "transform.scaleX": 1.2 },
		});

		expect(result.updated).toBe(true);
		expect(updateElements.mock.calls.length).toBe(1);
		const call = updateElements.mock.calls[0]?.[0];
		expect(call.updates[0].patch.params).toEqual({
			opacity: 0.5,
			"transform.scaleX": 1.2,
		});
	});

	test("error: non-object params throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({ trackId: "t1", elementId: "e1", params: "bad" }),
		).toThrow("params");
	});

	test("error: null params throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({ trackId: "t1", elementId: "e1", params: null }),
		).toThrow("params");
	});

	test("error: NaN param value throws error", () => {
		const { tool } = setup();
		expect(() =>
			tool?.handler({
				trackId: "t1",
				elementId: "e1",
				params: { opacity: Number.NaN },
			}),
		).toThrow("NaN");
	});
});

describe("timeline_update_text_content", () => {
	function setup() {
		const updateElements = mock(() => {});
		const editor = createMockEditor({
			timeline: { updateElements },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_update_text_content");
		return { tool, updateElements };
	}

	test("positive path: updates text content", () => {
		const { tool, updateElements } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			content: "Hello world",
		});

		expect(result.updated).toBe(true);
		expect(result.content).toBe("Hello world");
		expect(updateElements.mock.calls.length).toBe(1);
	});

	test("positive path: updates with optional styling", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({
			trackId: "t1",
			elementId: "e1",
			content: "Styled text",
			fontSize: 24,
			color: "#ff0000",
			fontFamily: "Arial",
		});

		expect(result.fontSize).toBe(24);
		expect(result.color).toBe("#ff0000");
	});

	test("error: missing content throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ trackId: "t1", elementId: "e1" })).toThrow(
			"content",
		);
	});
});

// ------------------------------------------------------------------
// Phase 5 — Toggle tools
// ------------------------------------------------------------------

describe("timeline_toggle_track_mute", () => {
	function setup() {
		const toggleTrackMute = mock(() => {});
		const editor = createMockEditor({
			timeline: { toggleTrackMute },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_toggle_track_mute");
		return { tool, toggleTrackMute };
	}

	test("positive path: toggles track mute", () => {
		const { tool, toggleTrackMute } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1" });

		expect(result.toggled).toBe(true);
		expect(toggleTrackMute.mock.calls.length).toBe(1);
	});

	test("error: missing trackId throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow("trackId");
	});
});

describe("timeline_toggle_track_visibility", () => {
	function setup() {
		const toggleTrackVisibility = mock(() => {});
		const editor = createMockEditor({
			timeline: { toggleTrackVisibility },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(t) => t.name === "timeline_toggle_track_visibility",
		);
		return { tool, toggleTrackVisibility };
	}

	test("positive path: toggles track visibility", () => {
		const { tool, toggleTrackVisibility } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ trackId: "t1" });

		expect(result.toggled).toBe(true);
		expect(toggleTrackVisibility.mock.calls.length).toBe(1);
	});
});

describe("timeline_toggle_clip_mute", () => {
	function setup() {
		const toggleElementsMuted = mock(() => {});
		const editor = createMockEditor({
			timeline: { toggleElementsMuted },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "timeline_toggle_clip_mute");
		return { tool, toggleElementsMuted };
	}

	test("positive path: toggles clip mute", () => {
		const { tool, toggleElementsMuted } = setup();
		expect(tool).toBeTruthy();

		const refs = [{ trackId: "t1", elementId: "e1" }];
		const result = tool?.handler({ elementRefs: refs });

		expect(result.toggled).toBe(1);
		expect(toggleElementsMuted.mock.calls.length).toBe(1);
	});

	test("error: invalid elementRefs throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({ elementRefs: "bad" })).toThrow("参数格式错误");
	});
});

describe("timeline_toggle_clip_visibility", () => {
	function setup() {
		const toggleElementsVisibility = mock(() => {});
		const editor = createMockEditor({
			timeline: { toggleElementsVisibility },
		});
		const tools = buildTimelineTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(t) => t.name === "timeline_toggle_clip_visibility",
		);
		return { tool, toggleElementsVisibility };
	}

	test("positive path: toggles clip visibility", () => {
		const { tool, toggleElementsVisibility } = setup();
		expect(tool).toBeTruthy();

		const refs = [
			{ trackId: "t1", elementId: "e1" },
			{ trackId: "t2", elementId: "e2" },
		];
		const result = tool?.handler({ elementRefs: refs });

		expect(result.toggled).toBe(2);
		expect(toggleElementsVisibility.mock.calls.length).toBe(1);
	});
});

// ------------------------------------------------------------------
// Phase 5 — Playback enhancement
// ------------------------------------------------------------------

describe("playback_toggle", () => {
	function setup() {
		const toggle = mock(() => {});
		const getIsPlaying = mock(() => true);
		const editor = createMockEditor({
			playback: { toggle, getIsPlaying },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_toggle");
		return { tool, toggle, getIsPlaying };
	}

	test("positive path: toggles playback", () => {
		const { tool, toggle } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.isPlaying).toBe(true);
		expect(toggle.mock.calls.length).toBe(1);
	});
});

describe("playback_set_volume", () => {
	function setup() {
		const setVolume = mock(() => {});
		const editor = createMockEditor({
			playback: { setVolume },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_set_volume");
		return { tool, setVolume };
	}

	test("positive path: sets volume", () => {
		const { tool, setVolume } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({ volume: 0.75 });

		expect(result.volume).toBe(0.75);
		expect(setVolume.mock.calls.length).toBe(1);
	});

	test("positive path: clamps volume to [0, 1]", () => {
		const { tool, setVolume } = setup();
		expect(tool).toBeTruthy();

		const resultHigh = tool?.handler({ volume: 1.5 });
		expect(resultHigh.volume).toBe(1);

		const resultLow = tool?.handler({ volume: -0.5 });
		expect(resultLow.volume).toBe(0);
	});

	test("error: missing volume throws error", () => {
		const { tool } = setup();
		expect(() => tool?.handler({})).toThrow("volume");
	});
});

describe("playback_toggle_mute", () => {
	function setup() {
		const toggleMute = mock(() => {});
		const isMuted = mock(() => true);
		const editor = createMockEditor({
			playback: { toggleMute, isMuted },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_toggle_mute");
		return { tool, toggleMute };
	}

	test("positive path: toggles mute", () => {
		const { tool, toggleMute } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.muted).toBe(true);
		expect(toggleMute.mock.calls.length).toBe(1);
	});
});

describe("playback_get_duration", () => {
	function setup() {
		const getTotalDuration = mock(() => 120);
		const getLastFrameTime = mock(() => 119.5);
		const editor = createMockEditor({
			timeline: { getTotalDuration, getLastFrameTime },
		});
		const tools = buildPlaybackTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((t) => t.name === "playback_get_duration");
		return { tool };
	}

	test("positive path: returns duration", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.totalDuration).toBe(120);
		expect(result.lastFrameTime).toBe(119.5);
	});
});

// ------------------------------------------------------------------
// Phase 5 — Selection / Media / Project / Scene
// ------------------------------------------------------------------

describe("selection_get_state", () => {
	function setup() {
		const getActiveSelectionKind = mock(() => "elements");
		const getSelectedElements = mock(() => [
			{ trackId: "t1", elementId: "e1" },
		]);
		const getSelectedKeyframes = mock(() => []);
		const getElementsWithTracks = mock(() => [
			{
				track: { id: "t1" },
				element: { id: "e1", name: "Clip 1", type: "video" },
			},
		]);
		const editor = createMockEditor({
			selection: {
				getActiveSelectionKind,
				getSelectedElements,
				getSelectedKeyframes,
			},
			timeline: { getElementsWithTracks },
		});
		const tools = buildSelectionTools(editor);
		const tool = tools.find((t) => t.name === "selection_get_state");
		return { tool };
	}

	test("positive path: returns selection state", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.kind).toBe("elements");
		expect(result.elements.length).toBe(1);
		expect(result.elements[0]?.name).toBe("Clip 1");
	});
});

describe("media_get_all", () => {
	function setup(assets: MediaAsset[] = []) {
		const editor = createMockEditor({
			media: { getAssets: () => assets },
		});
		const tools = buildMediaTools(editor);
		const tool = tools.find((t) => t.name === "media_get_all");
		return { tool };
	}

	test("positive path: returns all assets", () => {
		const assets: MediaAsset[] = [
			{
				id: "1",
				name: "Video A",
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

		const result = tool?.handler({});

		expect(result.count).toBe(1);
		expect(result.results[0]?.name).toBe("Video A");
	});

	test("positive path: returns empty when no assets", () => {
		const { tool } = setup([]);
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.count).toBe(0);
		expect(result.results).toEqual([]);
	});
});

describe("project_get_settings", () => {
	function setup(project: TProject | null = null) {
		const editor = createMockEditor({
			project: { getActiveOrNull: () => project },
		});
		const tools = buildProjectTools(editor);
		const tool = tools.find((t) => t.name === "project_get_settings");
		return { tool };
	}

	test("positive path: returns project settings", () => {
		const project: TProject = {
			metadata: {
				id: "proj-1",
				name: "Test",
				duration: 120,
				createdAt: new Date(),
				updatedAt: new Date(),
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

		expect(result.hasActiveProject).toBe(true);
		expect(result.fps).toEqual({ num: 30, den: 1 });
		expect(result.canvasSize).toEqual({ width: 1920, height: 1080 });
	});

	test("positive path: returns fallback when no project", () => {
		const { tool } = setup(null);
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.hasActiveProject).toBe(false);
	});
});

describe("scene_get_list", () => {
	function setup() {
		const scenes = [
			{
				id: "scene-1",
				name: "Main",
				isMain: true,
				tracks: { main: { id: "t0", elements: [] }, overlay: [], audio: [] },
			},
			{
				id: "scene-2",
				name: "Intro",
				isMain: false,
				tracks: {
					main: { id: "t0", elements: [] },
					overlay: [{ id: "t1", elements: [] }],
					audio: [],
				},
			},
		];
		const editor = createMockEditor({
			scenes: {
				getScenes: () => scenes as TScene[],
				getActiveSceneOrNull: () => scenes[0] as TScene,
			},
		});
		const tools = buildSceneTools(editor);
		const tool = tools.find((t) => t.name === "scene_get_list");
		return { tool };
	}

	test("positive path: returns scene list", () => {
		const { tool } = setup();
		expect(tool).toBeTruthy();

		const result = tool?.handler({});

		expect(result.count).toBe(2);
		expect(result.scenes[0]?.name).toBe("Main");
		expect(result.scenes[0]?.isActive).toBe(true);
		expect(result.scenes[1]?.trackCount).toBe(2);
	});
});
