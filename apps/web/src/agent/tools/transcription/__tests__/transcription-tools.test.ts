/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and inspect fetch call payloads. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import {
	buildTranscriptionTools,
	createTranscriptionToolDeps,
} from "@/agent/tools/transcription/transcription-tools";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

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
			style: { type: "string", optional: true },
			placement: { type: "string", optional: true },
			revealMode: { type: "string", optional: true },
			lineBreakMode: { type: "string", optional: true },
			maxCharsPerLine: { type: "number", optional: true },
			highlightColor: { type: "string", optional: true },
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
			style: "social",
			revealMode: "karaoke",
			lineBreakMode: "page",
			maxCharsPerLine: 12,
			highlightColor: "#ffcc00",
		});

		expect(generateSubtitlesFromVideo).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "timeline",
				provider: "volcengine",
				language: "zh",
				style: "social",
				placement: "bottom",
				revealMode: "karaoke",
				lineBreakMode: "page",
				maxCharsPerLine: 12,
				highlightColor: "#ffcc00",
				saveAsset: false,
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
				groupId: "subtitle-group",
				trackId: "subtitle-track",
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
		expect(addMediaAsset).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			imported: true,
			provider: "tencent",
			cueCount: 1,
			groupId: "subtitle-group",
		});
		expect(result.subtitleAssetId).toBeUndefined();
		expect(progressEvents).toMatchObject([
			{ stage: "audio-extract", status: "running" },
			{ stage: "audio-extract", status: "success" },
			{ stage: "asr-provider", status: "running" },
			{ stage: "asr-provider", status: "running" },
			{ stage: "asr-provider", status: "success" },
			{ stage: "subtitle-import", status: "running" },
			{ stage: "subtitle-import", status: "success" },
		]);
	});

	test("client deps emit cloud ASR recognition progress while the request is pending", async () => {
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
			media: { getAssets: () => [] },
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

	test("client deps only save an SRT asset when requested", async () => {
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
			saveAsset: true,
		});

		expect(addMediaAsset).toHaveBeenCalledTimes(1);
		const addMediaCall = addMediaAsset.mock.calls[0]?.[0] as {
			asset: { name: string; type: string; file: File };
			projectId: string;
		};
		expect(addMediaCall.projectId).toBe("project-1");
		expect(addMediaCall.asset).toMatchObject({
			name: "transcript-tencent.tokens.srt",
			type: "subtitle",
		});
		expect(await addMediaCall.asset.file.text()).toBe(
			[
				"1",
				"00:00:00,000 --> 00:00:00,250",
				"你",
				"",
				"2",
				"00:00:00,250 --> 00:00:00,500",
				"好",
				"",
			].join("\n"),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "tencent",
			subtitleAssetId: "subtitle-asset",
		});
	});
});
