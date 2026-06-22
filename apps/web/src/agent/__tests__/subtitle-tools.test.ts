/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { opencutWasmMock, wasmMock } from "@/test/wasm-mock";
import type { MediaTime } from "@/wasm/media-time";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);

const { buildSubtitleTools } = await import("@/agent/mcp/subtitle-tools");

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(
		seconds * MEDIA_TIME_TICKS_PER_SECOND,
	) as unknown as MediaTime;
}

function createMockEditor({
	insertElement = mock(() => ({
		elementId: "subtitle-1",
		trackId: "track-sub",
	})),
	addTrack = mock(() => "track-sub"),
	addMediaAsset = mock(() => ({ id: "text-asset", name: "transcript.txt" })),
	updateElements = mock(() => {}),
	updateSettings = mock(() => {}),
	getTrackById = mock(() => null),
	mediaAssets = [],
	sceneTracks,
}: {
	insertElement?: ReturnType<typeof mock>;
	addTrack?: ReturnType<typeof mock>;
	addMediaAsset?: ReturnType<typeof mock>;
	updateElements?: ReturnType<typeof mock>;
	updateSettings?: ReturnType<typeof mock>;
	getTrackById?: ReturnType<typeof mock>;
	mediaAssets?: unknown[];
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
				metadata: {
					id: "project-1",
				},
				settings: {
					canvasSize: { width: 1024, height: 768 },
					subtitles: null,
				},
			}),
			getActive: () => ({
				metadata: {
					id: "project-1",
				},
				settings: {
					canvasSize: { width: 1024, height: 768 },
					subtitles: null,
				},
			}),
			updateSettings,
		},
		media: {
			getAssets: () => mediaAssets,
			addMediaAsset,
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
	test("subtitles_import writes SRT cues to the project-global transcript by default", () => {
		const insertElement = mock(() => ({
			elementId: "subtitle-1",
			trackId: "track-sub",
		}));
		const updateSettings = mock(() => {});
		const editor = createMockEditor({ insertElement, updateSettings });
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
			insertMode: "project",
			global: true,
			cueCount: 2,
			skippedCueCount: 0,
			revealMode: "line",
		});
		expect(insertElement.mock.calls.length).toBe(0);
		expect(updateSettings.mock.calls[0]?.[0]).toMatchObject({
			settings: {
				subtitles: {
					enabled: true,
					lineBreakMode: "page",
					maxCharsPerLine: 30,
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
			},
		});
	});

	test("subtitles_import can still insert one legacy subtitle layer", () => {
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
			insertMode: "layer",
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
					fontSize: 4,
					color: "#ffffff",
					"background.enabled": true,
					"background.color": "#00000099",
					"subtitle.role": "layer",
					"subtitle.maxCharsPerLine": 30,
					"subtitle.lineBreakMode": "page",
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
					"subtitle.highlightColor": "#93c5fd",
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

	test("subtitles_import links a unified subtitle layer to a subtitle asset", () => {
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
			subtitleAssetId: "asset-subtitles",
			subtitleAssetName: "transcript-volcengine.srt",
			cues: [
				{
					text: "素材字幕",
					startTimeSeconds: 0,
					durationSeconds: 2,
				},
			],
		});

		expect(result).toMatchObject({
			imported: true,
			insertMode: "layer",
			subtitleAssetId: "asset-subtitles",
			subtitleAssetName: "transcript-volcengine.srt",
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "subtitle",
				params: {
					"subtitle.assetId": "asset-subtitles",
					"subtitle.assetName": "transcript-volcengine.srt",
				},
			},
		});
	});

	test("subtitles_extract_transcript returns readable text with timeline anchors from a subtitle layer", async () => {
		const subtitleElement = {
			id: "subtitle-1",
			type: "subtitle",
			startTime: mockMediaTimeFromSeconds({ seconds: 10 }),
			trimStart: mockMediaTimeFromSeconds({ seconds: 2 }),
			params: { "subtitle.groupId": "group-1" },
			cues: [
				{
					text: "第一句保留语义",
					startTime: 1,
					duration: 2,
				},
				{
					text: "第二句用于定位",
					startTime: 3.5,
					duration: 1.5,
				},
			],
		};
		const subtitleTrack = {
			id: "track-sub",
			type: "text",
			elements: [subtitleElement],
		};
		const editor = createMockEditor({
			getTrackById: mock(({ trackId }: { trackId: string }) =>
				trackId === "track-sub" ? subtitleTrack : null,
			),
			sceneTracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [subtitleTrack],
				audio: [],
			},
		});
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(item) => item.name === "subtitles_extract_transcript",
		);

		const result = await tool?.handler({
			source: "timeline",
			subtitleTrackId: "track-sub",
			subtitleElementId: "subtitle-1",
			mode: "anchored",
		});

		expect(result).toMatchObject({
			source: "timeline",
			mode: "anchored",
			hasTiming: true,
			text: "第一句保留语义\n第二句用于定位",
			cueCount: 2,
			trackId: "track-sub",
			elementId: "subtitle-1",
			anchors: [
				{
					index: 0,
					text: "第一句保留语义",
					startTimeSeconds: 1,
					endTimeSeconds: 3,
					timelineStartTimeSeconds: 9,
					timelineEndTimeSeconds: 11,
				},
				{
					index: 1,
					text: "第二句用于定位",
					startTimeSeconds: 3.5,
					endTimeSeconds: 5,
					timelineStartTimeSeconds: 11.5,
					timelineEndTimeSeconds: 13,
				},
			],
		});

		const timedResult = await tool?.handler({
			source: "timeline",
			subtitleTrackId: "track-sub",
			subtitleElementId: "subtitle-1",
			mode: "timed",
		});
		expect(timedResult).toMatchObject({
			mode: "timed",
			timedText:
				"[00:00:09.000 -> 00:00:11.000] 第一句保留语义\n[00:00:11.500 -> 00:00:13.000] 第二句用于定位",
		});
	});

	test("subtitles_extract_transcript parses an SRT asset into timed transcript text", async () => {
		const file = new File(
			[
				[
					"1",
					"00:00:00,000 --> 00:00:02,000",
					"第一句",
					"",
					"2",
					"00:00:02,500 --> 00:00:04,000",
					"第二句",
				].join("\n"),
			],
			"captions.srt",
			{ type: "application/x-subrip" },
		);
		const editor = createMockEditor({
			mediaAssets: [
				{
					id: "subtitle-asset",
					name: "captions.srt",
					type: "subtitle",
					file,
				},
			],
		});
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(item) => item.name === "subtitles_extract_transcript",
		);

		const result = await tool?.handler({
			source: "asset",
			assetId: "subtitle-asset",
			mode: "timed",
		});

		expect(result).toMatchObject({
			source: "asset",
			mode: "timed",
			assetId: "subtitle-asset",
			assetName: "captions.srt",
			text: "第一句\n第二句",
			timedText:
				"[00:00:00.000 -> 00:00:02.000] 第一句\n[00:00:02.500 -> 00:00:04.000] 第二句",
			cueCount: 2,
			anchors: [
				{
					index: 0,
					text: "第一句",
					startTimeSeconds: 0,
					endTimeSeconds: 2,
				},
				{
					index: 1,
					text: "第二句",
					startTimeSeconds: 2.5,
					endTimeSeconds: 4,
				},
			],
		});
	});

	test("subtitles_extract_transcript can save the plain transcript as a text asset", async () => {
		const addMediaAsset = mock(() => ({
			id: "saved-transcript",
			name: "captions-transcript.txt",
		}));
		const file = new File(
			[
				[
					"1",
					"00:00:00,000 --> 00:00:02,000",
					"第一句",
					"",
					"2",
					"00:00:02,000 --> 00:00:03,000",
					"第二句",
				].join("\n"),
			],
			"captions.srt",
			{ type: "application/x-subrip" },
		);
		const editor = createMockEditor({
			addMediaAsset,
			mediaAssets: [
				{
					id: "subtitle-asset",
					name: "captions.srt",
					type: "subtitle",
					file,
				},
			],
		});
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(item) => item.name === "subtitles_extract_transcript",
		);

		const result = await tool?.handler({
			source: "asset",
			assetId: "subtitle-asset",
			mode: "plain",
			saveAsTextAsset: true,
		});

		expect(result).toMatchObject({
			source: "asset",
			mode: "plain",
			text: "第一句\n第二句",
			savedTextAssetId: "saved-transcript",
			savedTextAssetName: "captions-transcript.txt",
		});
		expect(addMediaAsset.mock.calls[0]?.[0]).toMatchObject({
			projectId: "project-1",
			asset: {
				name: "captions-transcript.txt",
				type: "text",
			},
		});
		const savedFile = addMediaAsset.mock.calls[0]?.[0].asset.file;
		expect(await savedFile.text()).toBe("第一句\n第二句\n");
	});

	test("subtitles_extract_transcript refuses timed output for untimed text assets", async () => {
		const file = new File(["第一句\n第二句"], "script.txt", {
			type: "text/plain",
		});
		const editor = createMockEditor({
			mediaAssets: [
				{
					id: "text-asset",
					name: "script.txt",
					type: "text",
					file,
				},
			],
		});
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(item) => item.name === "subtitles_extract_transcript",
		);

		expect(
			tool?.handler({
				source: "asset",
				assetId: "text-asset",
				mode: "timed",
			}),
		).rejects.toThrow("没有时间戳");
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
				insertMode: "layer",
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
					"background.color": "#00000099",
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
			throw new Error(
				"Expected subtitles_translate to update the subtitle layer",
			);
		}
		const update = updateCall.updates[0];
		if (!update) {
			throw new Error(
				"Expected subtitles_translate to patch one subtitle layer",
			);
		}
		expect(update).toMatchObject({
			trackId: "track-sub",
			elementId: "subtitle-1",
			patch: {
				revealMode: "line",
				params: {
					"subtitle.bilingual.enabled": true,
					"subtitle.bilingual.targetLanguage": "en",
					"subtitle.lineBreakMode": "page",
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

	test("subtitles_plan_effects creates an executable plan from timed subtitle cues", async () => {
		const subtitleElement = {
			id: "subtitle-1",
			type: "subtitle",
			startTime: 10 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			params: { "subtitle.groupId": "group-1" },
			cues: [
				{ text: "今天讲三个关键步骤", startTime: 0, duration: 2 },
				{ text: "第一步先看这个位置", startTime: 2, duration: 2 },
				{ text: "最后给大家一个结论", startTime: 4, duration: 2 },
			],
		};
		const subtitleTrack = {
			id: "track-sub",
			type: "text",
			elements: [subtitleElement],
		};
		const editor = createMockEditor({
			getTrackById: mock(({ trackId }: { trackId: string }) =>
				trackId === "track-sub" ? subtitleTrack : null,
			),
			sceneTracks: {
				main: { id: "main", type: "video", elements: [] },
				overlay: [subtitleTrack],
				audio: [],
			},
		});
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_plan_effects");

		const result = await tool?.handler({ maxEffects: 2 });

		expect(result).toMatchObject({
			source: "timeline",
			trackId: "track-sub",
			elementId: "subtitle-1",
			cueCount: 3,
		});
		const plannedEffects = (result as { plannedEffects: unknown[] })
			.plannedEffects;
		expect(plannedEffects).toHaveLength(2);
		expect(plannedEffects[0]).toMatchObject({
			cueIndex: 0,
			startTimeSeconds: 10,
			tool: "timeline_insert_visual_effect",
			params: {
				startTimeSeconds: 10,
			},
		});
		expect(plannedEffects[1]).toMatchObject({
			cueIndex: 1,
			startTimeSeconds: 12,
			tool: "timeline_insert_visual_effect",
			params: {
				kind: "arrow",
				startTimeSeconds: 12,
			},
		});
		expect((result as { nextSteps: string[] }).nextSteps).toEqual(
			expect.arrayContaining([
				expect.stringContaining("timeline_insert_visual_effect"),
				expect.stringContaining("animated_sticker_insert"),
			]),
		);
	});

	test("subtitles_plan_effects can use a subtitle asset as the timing source", async () => {
		const subtitleAsset = {
			id: "subtitle-asset",
			name: "script.srt",
			type: "subtitle",
			file: new File(
				[
					[
						"1",
						"00:00:00,000 --> 00:00:01,800",
						"核心观点先抛出来",
						"",
						"2",
						"00:00:01,800 --> 00:00:03,200",
						"最后总结一下",
					].join("\n"),
				],
				"script.srt",
				{ type: "application/x-subrip" },
			),
		};
		const editor = createMockEditor({ mediaAssets: [subtitleAsset] });
		const tools = buildSubtitleTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "subtitles_plan_effects");

		const result = await tool?.handler({
			source: "asset",
			assetId: "subtitle-asset",
			maxEffects: 1,
		});

		expect(result).toMatchObject({
			source: "asset",
			assetId: "subtitle-asset",
			assetName: "script.srt",
			cueCount: 2,
			plannedEffects: [
				{
					cueIndex: 0,
					text: "核心观点先抛出来",
					startTimeSeconds: 0,
					tool: "timeline_insert_visual_effect",
				},
			],
		});
	});
});
