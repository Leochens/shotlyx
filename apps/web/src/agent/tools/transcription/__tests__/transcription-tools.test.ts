/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and inspect fetch call payloads. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import {
	buildTranscriptionTools,
	createTranscriptionToolDeps,
} from "@/agent/tools/transcription/transcription-tools";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

function wavBlob({
	durationSeconds,
	sampleRate = 44_100,
	channels = 2,
}: {
	durationSeconds: number;
	sampleRate?: number;
	channels?: number;
}): Blob {
	const bitsPerSample = 16;
	const bytesPerSample = bitsPerSample / 8;
	const sampleCount = Math.round(durationSeconds * sampleRate);
	const dataSize = sampleCount * channels * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * bytesPerSample, true);
	view.setUint16(32, channels * bytesPerSample, true);
	view.setUint16(34, bitsPerSample, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataSize, true);

	return new Blob([buffer], { type: "audio/wav" });
}

describe("transcription tools", () => {
	test("builds subtitles_generate_from_video schema", () => {
		const [tool] = buildTranscriptionTools({
			deps: {
				generateSubtitlesFromVideo: mock(async () => ({
					imported: true,
					provider: "mock",
					cueCount: 0,
				})),
			},
		});

		expect(tool?.name).toBe("subtitles_generate_from_video");
		expect(tool?.parameters).toMatchObject({
			source: { type: "string", optional: true },
			provider: { type: "string", optional: true },
			language: { type: "string", optional: true },
			model: { type: "string", optional: true },
			referenceText: { type: "string", optional: true },
			style: { type: "string", optional: true },
			placement: { type: "string", optional: true },
			revealMode: { type: "string", optional: true },
			lineBreakMode: { type: "string", optional: true },
			maxCharsPerLine: { type: "number", optional: true },
			highlightColor: { type: "string", optional: true },
			audioRangeStartSeconds: { type: "number", optional: true },
			audioRangeDurationSeconds: { type: "number", optional: true },
			audioRangeTrackId: { type: "string", optional: true },
			audioRangeElementId: { type: "string", optional: true },
			saveAsset: { type: "boolean", optional: true },
		});
	});

	test("calls injected generator with normalized defaults", async () => {
		const generateSubtitlesFromVideo = mock(async () => ({
			imported: true,
			provider: "volcengine",
			cueCount: 1,
			groupId: "subtitle-group",
			trackId: "track-subtitles",
		}));
		const [tool] = buildTranscriptionTools({
			deps: { generateSubtitlesFromVideo },
		});

		const result = await tool?.handler({
			language: "zh",
			referenceText: "开场讲 Shotlyx 字幕识别，不要写成 Short links。",
			style: "social",
			revealMode: "karaoke",
			lineBreakMode: "page",
			maxCharsPerLine: 12,
			highlightColor: "#ffcc00",
			audioRangeStartSeconds: 3,
			audioRangeDurationSeconds: 8,
			audioRangeTrackId: "audio-track",
			audioRangeElementId: "voiceover-1",
		});

		expect(generateSubtitlesFromVideo).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "timeline",
				provider: "volcengine",
				language: "zh",
				referenceText: "开场讲 Shotlyx 字幕识别，不要写成 Short links。",
				style: "social",
				placement: "bottom",
				revealMode: "karaoke",
				lineBreakMode: "page",
				maxCharsPerLine: 12,
				highlightColor: "#ffcc00",
				audioRangeStartSeconds: 3,
				audioRangeDurationSeconds: 8,
				audioRangeTrackId: "audio-track",
				audioRangeElementId: "voiceover-1",
				saveAsset: true,
			}),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "volcengine",
			cueCount: 1,
		});
	});

	test("defaults generated subtitles to one-line overflow", async () => {
		const generateSubtitlesFromVideo = mock(async () => ({
			imported: true,
			provider: "volcengine",
			cueCount: 1,
		}));
		const [tool] = buildTranscriptionTools({
			deps: { generateSubtitlesFromVideo },
		});

		await tool?.handler({});

		expect(generateSubtitlesFromVideo).toHaveBeenCalledWith(
			expect.objectContaining({
				lineBreakMode: "page",
			}),
		);
	});

	test("client deps extract timeline audio, call cloud ASR, and import cues", async () => {
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: {
				imported: true,
				global: true,
				cueCount: 1,
			},
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: {
				getAssets: () => [],
				addMediaAsset,
			},
			timeline: { getTotalDuration: () => MEDIA_TIME_TICKS_PER_SECOND },
			mcp: { execute },
		} as unknown as EditorCore;
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "你好 Shotlyx",
					provider: "tencent",
					language: "zh",
					cues: [
						{
							text: "你好 Shotlyx",
							startTimeSeconds: 0,
							durationSeconds: 2,
							tokens: [
								{ text: "你", startTime: 0, duration: 0.25 },
								{ text: "好", startTime: 0.25, duration: 0.25 },
								{ text: "Shotlyx", startTime: 0.75, duration: 0.7 },
							],
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const progressEvents: Array<{ stage: string; status: string }> = [];
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn: mock(async () => {
				return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
			}),
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "tencent",
			language: "zh",
			referenceText:
				"脚本提示：这里会说你好 Shotlyx，Shotlyx 是产品名，保持英文拼写。",
			style: "social",
			placement: "lower_third",
			revealMode: "karaoke",
			lineBreakMode: "page",
			maxCharsPerLine: 12,
			highlightColor: "#ffcc00",
			onProgress: (event) => progressEvents.push(event),
		});

		expect(fetchFn).toHaveBeenCalledWith(
			"/api/agent/transcription",
			expect.objectContaining({ method: "POST" }),
		);
		const fetchCalls = fetchFn.mock.calls as unknown as Array<
			[string, RequestInit]
		>;
		const body = fetchCalls[0]?.[1].body as FormData;
		expect(body.get("provider")).toBe("tencent");
		expect(body.get("language")).toBe("zh");
		expect(body.get("referenceText")).toBe(
			"脚本提示：这里会说你好 Shotlyx，Shotlyx 是产品名，保持英文拼写。",
		);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					format: "cues",
					style: "social",
					placement: "lower_third",
					revealMode: "karaoke",
					lineBreakMode: "page",
					maxCharsPerLine: 12,
					highlightColor: "#ffcc00",
					subtitleAssetId: "subtitle-asset",
					subtitleAssetName: "transcript-tencent.srt",
					cues: [
						expect.objectContaining({
							text: "你好 Shotlyx",
							tokens: [
								{ text: "你", startTime: 0, duration: 0.25 },
								{ text: "好", startTime: 0.25, duration: 0.25 },
								{ text: "Shotlyx", startTime: 0.75, duration: 0.7 },
							],
						}),
					],
				}),
			}),
		);
		expect(addMediaAsset).toHaveBeenCalledTimes(1);
		const addMediaCall = addMediaAsset.mock.calls[0]?.[0] as {
			asset: { name: string; type: string; file: File };
			projectId: string;
		};
		expect(addMediaCall.projectId).toBe("project-1");
		expect(addMediaCall.asset).toMatchObject({
			name: "transcript-tencent.srt",
			type: "subtitle",
		});
		expect(await addMediaCall.asset.file.text()).toBe(
			["1", "00:00:00,000 --> 00:00:02,000", "你好 Shotlyx", ""].join("\n"),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "tencent",
			cueCount: 1,
			global: true,
			subtitleAssetId: "subtitle-asset",
			subtitleAssetName: "transcript-tencent.srt",
		});
		expect(progressEvents).toMatchObject([
			{ stage: "audio-extract", status: "running" },
			{ stage: "audio-extract", status: "success" },
			{ stage: "asr-provider", status: "running" },
			{ stage: "asr-provider", status: "running" },
			{ stage: "asr-provider", status: "success" },
			{ stage: "subtitle-asset", status: "running" },
			{ stage: "subtitle-asset", status: "success" },
			{ stage: "subtitle-import", status: "running" },
			{ stage: "subtitle-import", status: "success" },
		]);
	});

	test("client deps remove punctuation from generated cues before import", async () => {
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: { getAssets: () => [], addMediaAsset },
			timeline: { getTotalDuration: () => MEDIA_TIME_TICKS_PER_SECOND },
			mcp: { execute },
		} as unknown as EditorCore;
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "你好，Shotlyx！今天，继续。",
					provider: "volcengine",
					cues: [
						{
							text: "你好，Shotlyx！",
							startTimeSeconds: 0,
							durationSeconds: 2,
							tokens: [
								{ text: "你", startTime: 0, duration: 0.25 },
								{ text: "好", startTime: 0.25, duration: 0.25 },
								{ text: "，", startTime: 0.5, duration: 0.05 },
								{ text: "Shotlyx", startTime: 0.75, duration: 0.7 },
								{ text: "！", startTime: 1.5, duration: 0.05 },
							],
						},
						{
							text: "今天，继续。",
							startTimeSeconds: 2,
							durationSeconds: 1.5,
							tokens: [
								{ text: "今天", startTime: 2, duration: 0.3 },
								{ text: "，", startTime: 2.3, duration: 0.05 },
								{ text: "继续", startTime: 2.6, duration: 0.4 },
								{ text: "。", startTime: 3.1, duration: 0.05 },
							],
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn: mock(async () => {
				return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
			}),
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
		});

		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					subtitleAssetId: "subtitle-asset",
					subtitleAssetName: "transcript-volcengine.srt",
					cues: [
						expect.objectContaining({
							text: "你好Shotlyx",
							tokens: [
								{ text: "你", startTime: 0, duration: 0.25 },
								{ text: "好", startTime: 0.25, duration: 0.25 },
								{ text: "Shotlyx", startTime: 0.75, duration: 0.7 },
							],
						}),
						expect.objectContaining({
							text: "今天继续",
							tokens: [
								{ text: "今天", startTime: 2, duration: 0.3 },
								{ text: "继续", startTime: 2.6, duration: 0.4 },
							],
						}),
					],
				}),
			}),
		);
		expect(result.text).toBe("你好Shotlyx今天继续");
	});

	test("client deps transcribe an explicit mixed timeline range and offset imported cues", async () => {
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1, global: true },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: { getAssets: () => [], addMediaAsset },
			timeline: {
				getTotalDuration: () => 20 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		const extractTimelineAudioFn = mock(async () => {
			return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
		});
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "选区字幕",
					provider: "volcengine",
					cues: [
						{
							text: "选区字幕",
							startTimeSeconds: 0.4,
							durationSeconds: 1.2,
							tokens: [
								{ text: "选区", startTime: 0.4, duration: 0.4 },
								{ text: "字幕", startTime: 0.9, duration: 0.5 },
							],
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeStartSeconds: 5,
			audioRangeDurationSeconds: 2,
		});

		expect(extractTimelineAudioFn).toHaveBeenCalledWith(
			expect.objectContaining({
				totalDuration: 20 * MEDIA_TIME_TICKS_PER_SECOND,
				rangeStart: 5 * MEDIA_TIME_TICKS_PER_SECOND,
				rangeDuration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			}),
		);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					cues: [
						expect.objectContaining({
							text: "选区字幕",
							startTimeSeconds: 5.4,
							durationSeconds: 1.2,
							tokens: [
								{ text: "选区", startTime: 5.4, duration: 0.4 },
								{ text: "字幕", startTime: 5.9, duration: 0.5 },
							],
						}),
					],
				}),
			}),
		);
		expect(result.metadata).toMatchObject({
			audioRange: {
				kind: "selection",
				startTimeSeconds: 5,
				durationSeconds: 2,
			},
		});
		const addMediaCall = addMediaAsset.mock.calls[0]?.[0] as {
			asset: { file: File };
		};
		expect(await addMediaCall.asset.file.text()).toBe(
			["1", "00:00:05,400 --> 00:00:06,600", "选区字幕", ""].join("\n"),
		);
	});

	test("client deps bind generated subtitles to the current moved source track start", async () => {
		const voiceElement = {
			id: "voice-clip",
			type: "video",
			name: "Moved video",
			sourceType: "upload",
			mediaId: "voice-media",
			startTime: 5 * MEDIA_TIME_TICKS_PER_SECOND,
			duration: 3 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			trimEnd: 0,
			sourceDuration: 3 * MEDIA_TIME_TICKS_PER_SECOND,
			isSourceAudioEnabled: true,
			params: {},
		};
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1, global: true },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: {
							id: "video-track",
							type: "video",
							name: "Video track",
							elements: [voiceElement],
						},
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: {
				getAssets: () => [{ id: "voice-media", type: "video", hasAudio: true }],
				addMediaAsset: mock(async () => null),
			},
			timeline: {
				getTotalDuration: () => 12 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		const extractTimelineAudioFn = mock(async () => {
			return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
		});
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "挪后字幕",
					provider: "volcengine",
					cues: [
						{
							text: "挪后字幕",
							startTimeSeconds: 0,
							durationSeconds: 1,
							tokens: [
								{ text: "挪", startTime: 0, duration: 0.3 },
								{ text: "后", startTime: 0.3, duration: 0.3 },
							],
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeStartSeconds: 0,
			audioRangeDurationSeconds: 12,
			audioRangeTrackId: "video-track",
			saveAsset: false,
		});

		expect(extractTimelineAudioFn).toHaveBeenCalledWith(
			expect.objectContaining({
				rangeStart: 5 * MEDIA_TIME_TICKS_PER_SECOND,
				rangeDuration: 3 * MEDIA_TIME_TICKS_PER_SECOND,
			}),
		);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					sourceTrackId: "video-track",
					sourceElementId: "voice-clip",
					sourceTimelineStartTimeSeconds: 5,
					cues: [
						expect.objectContaining({
							text: "挪后字幕",
							startTimeSeconds: 5,
							tokens: [
								{ text: "挪", startTime: 5, duration: 0.3 },
								{ text: "后", startTime: 5.3, duration: 0.3 },
							],
						}),
					],
				}),
			}),
		);
	});

	test("client deps transcribe the full timeline by default even with one audible source", async () => {
		const voiceElement = {
			id: "voice-clip",
			type: "video",
			name: "Moved video",
			sourceType: "upload",
			mediaId: "voice-media",
			startTime: 5 * MEDIA_TIME_TICKS_PER_SECOND,
			duration: 3 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			trimEnd: 0,
			sourceDuration: 3 * MEDIA_TIME_TICKS_PER_SECOND,
			isSourceAudioEnabled: true,
			params: {},
		};
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1, global: true },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: {
							id: "video-track",
							type: "video",
							name: "Video track",
							elements: [voiceElement],
						},
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: {
				getAssets: () => [{ id: "voice-media", type: "video", hasAudio: true }],
				addMediaAsset: mock(async () => null),
			},
			timeline: {
				getTotalDuration: () => 12 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		const extractTimelineAudioFn = mock(async () => {
			return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
		});
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "自动绑定",
					provider: "volcengine",
					cues: [
						{
							text: "自动绑定",
							startTimeSeconds: 0,
							durationSeconds: 1,
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeStartSeconds: 0,
			audioRangeDurationSeconds: 12,
			saveAsset: false,
		});

		expect(extractTimelineAudioFn).toHaveBeenCalledWith(
			expect.objectContaining({
				rangeStart: 0,
				rangeDuration: 12 * MEDIA_TIME_TICKS_PER_SECOND,
			}),
		);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					cues: [
						expect.objectContaining({
							text: "自动绑定",
							startTimeSeconds: 0,
						}),
					],
				}),
			}),
		);
		const importCall = execute.mock.calls[0]?.[0] as {
			params: Record<string, unknown>;
		};
		expect(importCall.params.sourceTrackId).toBeUndefined();
		expect(importCall.params.sourceElementId).toBeUndefined();
	});

	test("client deps isolate an explicit audio source element instead of transcribing every overlapping track", async () => {
		const selectedElement = {
			id: "voice-clip",
			type: "audio",
			name: "Selected voice",
			sourceType: "upload",
			mediaId: "voice-media",
			startTime: 5 * MEDIA_TIME_TICKS_PER_SECOND,
			duration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			trimEnd: 0,
			sourceDuration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			params: {},
		};
		const overlappingElement = {
			...selectedElement,
			id: "music-bed",
			name: "Music bed",
			mediaId: "music-media",
			startTime: 0,
			duration: 20 * MEDIA_TIME_TICKS_PER_SECOND,
			sourceDuration: 20 * MEDIA_TIME_TICKS_PER_SECOND,
		};
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [
							{
								id: "voice-track",
								type: "audio",
								name: "Voice",
								elements: [selectedElement],
							},
							{
								id: "music-track",
								type: "audio",
								name: "Music",
								elements: [overlappingElement],
							},
						],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: { getAssets: () => [], addMediaAsset },
			timeline: {
				getTotalDuration: () => 20 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		const extractTimelineAudioFn = mock(async () => {
			return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
		});
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "只识别人声",
					provider: "volcengine",
					cues: [
						{
							text: "只识别人声",
							startTimeSeconds: 0,
							durationSeconds: 1,
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeStartSeconds: 5,
			audioRangeDurationSeconds: 2,
			audioRangeTrackId: "voice-track",
			audioRangeElementId: "voice-clip",
		});

		expect(extractTimelineAudioFn).toHaveBeenCalledWith(
			expect.objectContaining({
				tracks: expect.objectContaining({
					audio: [
						expect.objectContaining({
							id: "voice-track",
							elements: [selectedElement],
						}),
					],
				}),
				rangeStart: 5 * MEDIA_TIME_TICKS_PER_SECOND,
				rangeDuration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			}),
		);
		expect(result.metadata).toMatchObject({
			audioRange: {
				elementRef: { trackId: "voice-track", elementId: "voice-clip" },
			},
		});
	});

	test("client deps isolate an explicit audio source track", async () => {
		const voiceElement = {
			id: "voice-clip",
			type: "audio",
			name: "Voice",
			sourceType: "upload",
			mediaId: "voice-media",
			startTime: 5 * MEDIA_TIME_TICKS_PER_SECOND,
			duration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			trimStart: 0,
			trimEnd: 0,
			sourceDuration: 2 * MEDIA_TIME_TICKS_PER_SECOND,
			params: {},
		};
		const musicElement = {
			...voiceElement,
			id: "music-bed",
			name: "Music",
			mediaId: "music-media",
		};
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [
							{
								id: "voice-track",
								type: "audio",
								name: "Voice",
								elements: [voiceElement],
							},
							{
								id: "music-track",
								type: "audio",
								name: "Music",
								elements: [musicElement],
							},
						],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: { getAssets: () => [], addMediaAsset: mock(async () => null) },
			timeline: {
				getTotalDuration: () => 20 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		const extractTimelineAudioFn = mock(async () => {
			return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
		});
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "人声轨",
					provider: "volcengine",
					cues: [
						{
							text: "人声轨",
							startTimeSeconds: 0,
							durationSeconds: 1,
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeStartSeconds: 5,
			audioRangeDurationSeconds: 2,
			audioRangeTrackId: "voice-track",
		});

		expect(extractTimelineAudioFn).toHaveBeenCalledWith(
			expect.objectContaining({
				tracks: expect.objectContaining({
					audio: [
						expect.objectContaining({
							id: "voice-track",
							elements: [voiceElement],
						}),
					],
				}),
			}),
		);
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				params: expect.objectContaining({
					sourceTrackId: "voice-track",
					sourceTrackName: "Voice",
				}),
			}),
		);
		expect(result.metadata).toMatchObject({
			audioRange: {
				kind: "track",
				trackRef: { trackId: "voice-track" },
			},
		});
	});

	test("client deps log the actual ASR audio payload duration before provider upload", async () => {
		const originalInfo = console.info;
		const consoleInfo: typeof console.info = mock(() => {});
		console.info = consoleInfo;
		try {
			const execute = mock(async () => ({
				status: "success" as const,
				data: { imported: true, cueCount: 1 },
			}));
			const editor = {
				scenes: {
					getActiveScene: () => ({
						tracks: {
							main: { id: "main", elements: [] },
							overlay: [],
							audio: [],
						},
					}),
				},
				project: { getActive: () => ({ metadata: { id: "project-1" } }) },
				media: {
					getAssets: () => [],
					addMediaAsset: mock(async () => null),
				},
				timeline: {
					getTotalDuration: () => 10 * MEDIA_TIME_TICKS_PER_SECOND,
				},
				mcp: { execute },
			} as unknown as EditorCore;
			const fetchFn = mock(async () =>
				Response.json({
					text: "payload",
					provider: "volcengine",
					cues: [
						{
							text: "payload",
							startTimeSeconds: 0,
							durationSeconds: 1,
						},
					],
				}),
			);
			const deps = createTranscriptionToolDeps({
				editor,
				fetchFn: fetchFn as unknown as typeof fetch,
				extractTimelineAudioFn: mock(async () =>
					wavBlob({ durationSeconds: 2.5 }),
				),
			});

			await deps.generateSubtitlesFromVideo({
				source: "timeline",
				provider: "volcengine",
				audioRangeStartSeconds: 4,
				audioRangeDurationSeconds: 2.5,
				saveAsset: false,
			});

			expect(consoleInfo).toHaveBeenCalledWith(
				"[Shotlyx transcription] extracted ASR audio payload",
				expect.objectContaining({
					provider: "volcengine",
					payloadDurationSeconds: 2.5,
					requestedDurationSeconds: 2.5,
					payloadBytes: expect.any(Number),
				}),
			);
			expect(consoleInfo).toHaveBeenCalledWith(
				"[Shotlyx transcription] sending ASR audio payload",
				expect.objectContaining({
					provider: "volcengine",
					payloadDurationSeconds: 2.5,
					payloadBytes: expect.any(Number),
				}),
			);
		} finally {
			console.info = originalInfo;
		}
	});

	test("client deps chunk long cloud ASR audio and merge cues back to timeline", async () => {
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 3 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: {
				getAssets: () => [],
				addMediaAsset: mock(async () => null),
			},
			timeline: {
				getTotalDuration: () => 650 * MEDIA_TIME_TICKS_PER_SECOND,
			},
			mcp: { execute },
		} as unknown as EditorCore;
		let fetchCount = 0;
		const fetchFn = mock(async () => {
			const cueTexts = ["第一段", "第二段", "第三段"];
			const cueStarts = [10, 2, 3];
			const index = fetchCount;
			fetchCount += 1;
			return Response.json({
				text: cueTexts[index],
				provider: "volcengine",
				cues: [
					{
						text: cueTexts[index],
						startTimeSeconds: cueStarts[index],
						durationSeconds: 1,
					},
				],
			});
		});
		const extractTimelineAudioFn = mock(
			async ({ rangeDuration }: { rangeDuration: number }) => {
				return wavBlob({
					durationSeconds: rangeDuration / MEDIA_TIME_TICKS_PER_SECOND,
					sampleRate: 100,
					channels: 1,
				});
			},
		);
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn,
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			audioRangeDurationSeconds: 650,
			saveAsset: false,
		});

		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(extractTimelineAudioFn).toHaveBeenCalledTimes(3);
		expect(extractTimelineAudioFn.mock.calls[0]?.[0]).toMatchObject({
			rangeStart: 0,
			rangeDuration: 241.2 * MEDIA_TIME_TICKS_PER_SECOND,
		});
		expect(extractTimelineAudioFn.mock.calls[1]?.[0]).toMatchObject({
			rangeStart: 238.8 * MEDIA_TIME_TICKS_PER_SECOND,
			rangeDuration: 242.4 * MEDIA_TIME_TICKS_PER_SECOND,
		});
		expect(extractTimelineAudioFn.mock.calls[2]?.[0]).toMatchObject({
			rangeStart: 478.8 * MEDIA_TIME_TICKS_PER_SECOND,
			rangeDuration: 171.2 * MEDIA_TIME_TICKS_PER_SECOND,
		});
		expect(execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: "subtitles_import",
				params: expect.objectContaining({
					cues: [
						expect.objectContaining({
							text: "第一段",
							startTimeSeconds: 10,
						}),
						expect.objectContaining({
							text: "第二段",
							startTimeSeconds: 240.8,
						}),
						expect.objectContaining({
							text: "第三段",
							startTimeSeconds: 481.8,
						}),
					],
				}),
			}),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "volcengine",
			cueCount: 3,
			metadata: {
				chunked: true,
				chunkCount: 3,
			},
		});
	});

	test("client deps emit cloud ASR recognition progress while the request is pending", async () => {
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: { getAssets: () => [], addMediaAsset },
			timeline: { getTotalDuration: () => MEDIA_TIME_TICKS_PER_SECOND },
			mcp: { execute },
		} as unknown as EditorCore;
		let releaseFetch: (() => void) | undefined;
		const fetchFn = mock(async () => {
			await new Promise<void>((resolve) => {
				releaseFetch = resolve;
			});
			return new Response(
				JSON.stringify({
					text: "识别进度",
					provider: "volcengine",
					cues: [
						{
							text: "识别进度",
							startTimeSeconds: 0,
							durationSeconds: 1,
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const progressEvents: Array<{
			stage: string;
			label: string;
			status: string;
			current?: number;
			total?: number;
		}> = [];
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn: mock(async () => {
				return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
			}),
			cloudAsrProgressIntervalMs: 5,
		});

		const generation = deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "volcengine",
			onProgress: (event) => progressEvents.push(event),
		});

		const hasRecognitionProgress = () =>
			progressEvents.some(
				(event) =>
					event.stage === "asr-provider" &&
					event.status === "running" &&
					event.label.includes("识别") &&
					typeof event.current === "number" &&
					event.current > 0 &&
					event.total === 100,
			);

		for (
			let attempt = 0;
			attempt < 20 && !hasRecognitionProgress();
			attempt++
		) {
			await new Promise((resolve) => setTimeout(resolve, 5));
		}

		expect(releaseFetch).toBeDefined();
		expect(hasRecognitionProgress()).toBe(true);

		releaseFetch?.();
		await generation;
	});

	test("client deps can skip saving a linked SRT asset when disabled", async () => {
		const addMediaAsset = mock(
			async ({ asset }: { asset: { name: string } }) => ({
				id: "subtitle-asset",
				name: asset.name,
			}),
		);
		const execute = mock(async () => ({
			status: "success" as const,
			data: { imported: true, cueCount: 1 },
		}));
		const editor = {
			scenes: {
				getActiveScene: () => ({
					tracks: {
						main: { id: "main", elements: [] },
						overlay: [],
						audio: [],
					},
				}),
			},
			project: { getActive: () => ({ metadata: { id: "project-1" } }) },
			media: {
				getAssets: () => [],
				addMediaAsset,
			},
			timeline: { getTotalDuration: () => MEDIA_TIME_TICKS_PER_SECOND },
			mcp: { execute },
		} as unknown as EditorCore;
		const fetchFn = mock(async () => {
			return new Response(
				JSON.stringify({
					text: "你好",
					provider: "tencent",
					cues: [
						{
							text: "你好",
							startTimeSeconds: 0,
							durationSeconds: 0.5,
							tokens: [
								{ text: "你", startTime: 0, duration: 0.25 },
								{ text: "好", startTime: 0.25, duration: 0.25 },
							],
						},
					],
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		});
		const deps = createTranscriptionToolDeps({
			editor,
			fetchFn: fetchFn as unknown as typeof fetch,
			extractTimelineAudioFn: mock(async () => {
				return new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
			}),
		});

		const result = await deps.generateSubtitlesFromVideo({
			source: "timeline",
			provider: "tencent",
			saveAsset: false,
		});

		expect(addMediaAsset).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			imported: true,
			provider: "tencent",
		});
		expect(result.subtitleAssetId).toBeUndefined();
	});
});
