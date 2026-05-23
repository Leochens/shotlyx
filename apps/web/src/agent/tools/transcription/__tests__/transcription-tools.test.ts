/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and inspect fetch call payloads. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import {
	buildTranscriptionTools,
	createTranscriptionToolDeps,
} from "@/agent/tools/transcription/transcription-tools";

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
		});
	});

	test("calls injected generator with normalized defaults", async () => {
		const generateSubtitlesFromVideo = mock(async () => ({
			imported: true,
			provider: "local",
			cueCount: 1,
			groupId: "subtitle-group",
			trackId: "track-subtitles",
		}));
		const [tool] = buildTranscriptionTools({
			deps: { generateSubtitlesFromVideo },
		});

		const result = await tool?.handler({
			language: "zh",
			provider: "local",
			style: "social",
		});

		expect(generateSubtitlesFromVideo).toHaveBeenCalledWith(
			expect.objectContaining({
				source: "timeline",
				provider: "local",
				language: "zh",
				style: "social",
				placement: "bottom",
			}),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "local",
			cueCount: 1,
		});
	});

	test("client deps extract timeline audio, call cloud ASR, and import cues", async () => {
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
					tracks: { main: { id: "main", elements: [] }, overlay: [], audio: [] },
				}),
			},
			media: { getAssets: () => [] },
			timeline: { getTotalDuration: () => 90_000 },
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
				}),
			}),
		);
		expect(result).toMatchObject({
			imported: true,
			provider: "tencent",
			cueCount: 1,
			groupId: "subtitle-group",
		});
		expect(progressEvents).toMatchObject([
			{ stage: "audio-extract", status: "running" },
			{ stage: "audio-extract", status: "success" },
			{ stage: "asr-provider", status: "running" },
			{ stage: "asr-provider", status: "success" },
			{ stage: "subtitle-import", status: "running" },
			{ stage: "subtitle-import", status: "success" },
		]);
	});
});
