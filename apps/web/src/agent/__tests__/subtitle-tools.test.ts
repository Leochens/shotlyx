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
	getTrackById = mock(() => null),
	sceneTracks,
}: {
	insertElement?: ReturnType<typeof mock>;
	addTrack?: ReturnType<typeof mock>;
	updateElements?: ReturnType<typeof mock>;
	getTrackById?: ReturnType<typeof mock>;
	sceneTracks?: unknown;
} = {}): EditorCore {
	return {
		timeline: {
			addTrack,
			insertElement,
			updateElements,
			getTrackById,
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
			revealMode: "line",
		});
		expect(insertElement.mock.calls.length).toBe(1);
			expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
				element: {
					type: "subtitle",
					startTime: 0,
					duration: Math.round(4.5 * MEDIA_TIME_TICKS_PER_SECOND),
				params: {
					"subtitle.role": "layer",
					"subtitle.maxCharsPerLine": 18,
					"subtitle.lineBreakMode": "wrap",
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

	test("subtitles_import stores layer captions unwrapped so the panel can change wrapping later", () => {
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
			insertMode: "layer",
			revealMode: "karaoke",
			lineBreakMode: "page",
			maxCharsPerLine: 3,
			cues: [
				{
					text: "我吃了一个苹果",
					startTimeSeconds: 0,
					durationSeconds: 3,
				},
			],
		});

		expect(result).toMatchObject({
			imported: true,
			insertMode: "layer",
			cueCount: 1,
			revealMode: "karaoke",
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "subtitle",
				revealMode: "karaoke",
				params: {
					"subtitle.maxCharsPerLine": 3,
					"subtitle.lineBreakMode": "page",
					"subtitle.highlightColor": "#22d3ee",
				},
				cues: [
					{
						text: "我吃了一个苹果",
						startTime: 0,
						duration: 3,
					},
				],
			},
		});
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

	test("subtitles_translate adds translated line cues to an existing subtitle layer", async () => {
		const updateElements = mock(() => {});
		const subtitleElement = {
			id: "subtitle-1",
			type: "subtitle",
			params: { "subtitle.groupId": "group-1" },
			revealMode: "karaoke",
			cues: [
				{
					text: "我吃了一个苹果",
					startTime: 0,
					duration: 2,
					tokens: [{ text: "我", startTime: 0, duration: 0.2 }],
				},
				{
					text: "很好吃",
					startTime: 2,
					duration: 1,
				},
			],
		};
		const subtitleTrack = {
			id: "track-sub",
			type: "text",
			elements: [subtitleElement],
		};
		const sceneTracks = {
			main: { id: "main", type: "video", elements: [] },
			overlay: [subtitleTrack],
			audio: [],
		};
		const fetchFn = Object.assign(
			mock(async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("/api/agent/subtitle-translation");
				expect(JSON.parse(String(init?.body))).toMatchObject({
					targetLanguage: "en",
					sourceLanguage: "zh",
					cues: [
						{ index: 0, text: "我吃了一个苹果", startTime: 0, duration: 2 },
						{ index: 1, text: "很好吃", startTime: 2, duration: 1 },
					],
				});
				return new Response(
					JSON.stringify({
						provider: "mock",
						targetLanguage: "en",
						translations: [
							{ index: 0, text: "I ate an apple" },
							{ index: 1, text: "It tasted good" },
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}),
			{ preconnect: mock(() => {}) },
		);
		const editor = createMockEditor({
			updateElements,
			getTrackById: mock(({ trackId }: { trackId: string }) =>
				trackId === "track-sub" ? subtitleTrack : null,
			),
			sceneTracks,
		});
		const tools = buildSubtitleTools({
			editor,
			deps: {
				mediaTimeFromSeconds: mockMediaTimeFromSeconds,
				fetchFn,
			},
		});
		const tool = tools.find((item) => item.name === "subtitles_translate");

		const result = await tool?.handler({
			targetLanguage: "en",
			sourceLanguage: "zh",
		});

		expect(result).toMatchObject({
			translated: true,
			targetLanguage: "en",
			trackId: "track-sub",
			elementId: "subtitle-1",
			cueCount: 2,
		});
		const updateCalls = updateElements.mock.calls as unknown as Array<
			[{ updates: unknown[] }]
		>;
		const updateCall = updateCalls.at(-1)?.[0];
		if (!updateCall) {
			throw new Error("Expected subtitles_translate to update the subtitle layer");
		}
		const update = updateCall.updates[0];
		if (!update) {
			throw new Error("Expected subtitles_translate to patch one subtitle layer");
		}
		expect(update).toMatchObject({
			trackId: "track-sub",
			elementId: "subtitle-1",
			patch: {
				revealMode: "line",
				params: {
					"subtitle.bilingual.enabled": true,
					"subtitle.bilingual.targetLanguage": "en",
					"subtitle.lineBreakMode": "wrap",
				},
				cues: [
					{
						text: "我吃了一个苹果",
						translations: {
							en: {
								text: "I ate an apple",
								language: "en",
								provider: "mock",
							},
						},
					},
					{
						text: "很好吃",
						translations: {
							en: {
								text: "It tasted good",
							},
						},
					},
				],
			},
		});
	});
});
