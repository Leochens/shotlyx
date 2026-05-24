/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { buildSubtitleTools } from "@/agent/mcp/subtitle-tools";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
}

function createMockEditor({
	insertElement = mock(() => ({
		elementId: "subtitle-1",
		trackId: "track-sub",
	})),
	addTrack = mock(() => "track-sub"),
	updateElements = mock(() => {}),
	sceneTracks,
}: {
	insertElement?: ReturnType<typeof mock>;
	addTrack?: ReturnType<typeof mock>;
	updateElements?: ReturnType<typeof mock>;
	sceneTracks?: unknown;
} = {}): EditorCore {
	return {
		timeline: {
			addTrack,
			insertElement,
			updateElements,
			getTrackById: () => null,
		},
		project: {
			getActiveOrNull: () => ({
				settings: {
					canvasSize: { width: 1024, height: 768 },
				},
			}),
			getActive: () => ({
				settings: {
					canvasSize: { width: 1024, height: 768 },
				},
			}),
		},
		scenes: {
			getActiveSceneOrNull: () =>
				sceneTracks
					? {
							tracks: sceneTracks,
						}
					: null,
		},
		selection: {
			getSelectedElements: () => [],
		},
	} as unknown as EditorCore;
}

describe("subtitle tools", () => {
	test("subtitles_import parses SRT and inserts one subtitle layer by default", () => {
		const insertElement = mock(() => ({
			elementId: "subtitle-1",
			trackId: "track-sub",
		}));
		const editor = createMockEditor({ insertElement });
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_import");

		const result = tool?.handler({
			format: "srt",
			content: [
				"1",
				"00:00:00,000 --> 00:00:02,000",
				"花生其实不是坚果",
				"",
				"2",
				"00:00:02,000 --> 00:00:04,500",
				"它属于豆科植物",
			].join("\n"),
			style: "clean",
		});

		expect(result).toMatchObject({
			imported: true,
			insertMode: "layer",
			trackId: "track-sub",
			cueCount: 2,
			skippedCueCount: 0,
			revealMode: "full",
		});
		expect(insertElement.mock.calls.length).toBe(1);
			expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
				element: {
					type: "subtitle",
					startTime: 0,
					duration: Math.round(4.5 * MEDIA_TIME_TICKS_PER_SECOND),
				params: {
					"subtitle.role": "layer",
				},
				cues: [
					{
						text: "花生其实不是坚果",
						startTime: 0,
						duration: 2,
					},
					{
						text: "它属于豆科植物",
						startTime: 2,
						duration: 2.5,
					},
				],
			},
			placement: { mode: "explicit", trackId: "track-sub" },
		});
		const groupId =
			insertElement.mock.calls[0]?.[0].element.params["subtitle.groupId"];
		expect(typeof groupId).toBe("string");
	});

	test("subtitles_import can still insert legacy text elements", () => {
		const insertElement = mock(() => ({
			elementId: "subtitle-1",
			trackId: "track-sub",
		}));
		const editor = createMockEditor({ insertElement });
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_import");

		const result = tool?.handler({
			format: "cues",
			insertMode: "text-elements",
			cues: [
				{
					text: "花生其实不是坚果",
					startTimeSeconds: 0,
					durationSeconds: 2,
				},
				{
					text: "它属于豆科植物",
					startTimeSeconds: 2,
					durationSeconds: 2.5,
				},
			],
		});

		expect(result).toMatchObject({
			imported: true,
			insertMode: "text-elements",
			cueCount: 2,
		});
		expect(insertElement.mock.calls.length).toBe(2);
			expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
				element: {
					type: "text",
					startTime: 0,
					duration: Math.round(2 * MEDIA_TIME_TICKS_PER_SECOND),
				params: {
					content: "花生其实不是坚果",
					"subtitle.role": "cue",
					"subtitle.index": 0,
				},
			},
		});
	});

	test("subtitles_import rejects an explicit missing track", () => {
		const editor = createMockEditor();
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_import");

		expect(() =>
			tool?.handler({
				format: "srt",
				trackId: "missing-track",
				content: [
					"1",
					"00:00:00,000 --> 00:00:02,000",
					"花生其实不是坚果",
				].join("\n"),
			}),
		).toThrow("轨道不存在");
	});

	test("subtitles_update_style updates every cue in a subtitle group", () => {
		const updateElements = mock(() => {});
		const sceneTracks = {
			main: { id: "main", type: "video", elements: [] },
			overlay: [
				{
					id: "track-sub",
					type: "text",
					elements: [
						{
							id: "cue-1",
							type: "text",
							params: { "subtitle.groupId": "group-1" },
						},
						{
							id: "cue-2",
							type: "text",
							params: { "subtitle.groupId": "group-1" },
						},
					],
				},
			],
			audio: [],
		};
		const editor = createMockEditor({ updateElements, sceneTracks });
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_update_style");

		const result = tool?.handler({
			groupId: "group-1",
			style: "social",
			color: "#f8fafc",
		});

		expect(result).toMatchObject({
			updated: true,
			groupId: "group-1",
			cueCount: 2,
		});
		expect(updateElements.mock.calls[0]?.[0].updates).toHaveLength(2);
		expect(updateElements.mock.calls[0]?.[0].updates[0]).toMatchObject({
			trackId: "track-sub",
			elementId: "cue-1",
			patch: {
				params: {
					color: "#f8fafc",
					fontWeight: "bold",
					"background.enabled": true,
				},
			},
		});
	});
});
