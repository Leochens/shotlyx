/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import { buildRoughCutTools } from "@/agent/mcp/rough-cut-tools";
import type { EditorCore } from "@/core";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function seconds(value: number): MediaTime {
	return Math.round(value * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
}

function createMockEditor({
	applySilenceCutPlan = mock(() => true),
	updateElements = mock(() => {}),
}: {
	applySilenceCutPlan?: ReturnType<typeof mock>;
	updateElements?: ReturnType<typeof mock>;
} = {}): EditorCore {
	const videoElement = {
		id: "clip-1",
		name: "Talking head",
		type: "video",
		mediaId: "asset-1",
		startTime: seconds(0),
		duration: seconds(12),
		trimStart: seconds(0),
		trimEnd: seconds(0),
		params: {},
	};
	const subtitleElement = {
		id: "subtitle-1",
		name: "Subtitles",
		type: "subtitle",
		startTime: seconds(0),
		duration: seconds(12),
		trimStart: seconds(0),
		trimEnd: seconds(0),
		params: { "subtitle.role": "layer" },
		cues: [
			{
				text: "嗯 我们开始",
				startTime: 0,
				duration: 2,
				tokens: [
					{ text: "嗯", startTime: 0.2, duration: 0.2 },
					{ text: "我们", startTime: 0.6, duration: 0.2 },
					{ text: "开始", startTime: 1.1, duration: 0.5 },
				],
			},
			{
				text: "复制一下",
				startTime: 3,
				duration: 1.4,
				tokens: [
					{ text: "复制", startTime: 3.1, duration: 0.4 },
					{ text: "一下", startTime: 3.55, duration: 0.3 },
				],
			},
			{
				text: "复制一下",
				startTime: 4.7,
				duration: 1.4,
				tokens: [
					{ text: "复制", startTime: 4.8, duration: 0.4 },
					{ text: "一下", startTime: 5.25, duration: 0.3 },
				],
			},
		],
	};
	const mainTrack = {
		id: "main",
		name: "Main",
		type: "video",
		muted: false,
		hidden: false,
		elements: [videoElement],
	};
	const subtitleTrack = {
		id: "subtitles",
		name: "Subtitles",
		type: "text",
		muted: false,
		hidden: false,
		elements: [subtitleElement],
	};
	const tracks = {
		main: mainTrack,
		overlay: [subtitleTrack],
		audio: [],
	};

	return {
		scenes: {
			getActiveSceneOrNull: () => ({ tracks }),
			getActiveScene: () => ({ tracks }),
		},
		timeline: {
			applySilenceCutPlan,
			updateElements,
			getTrackById: ({ trackId }: { trackId: string }) =>
				trackId === "main"
					? mainTrack
					: trackId === "subtitles"
						? subtitleTrack
						: null,
		},
	} as unknown as EditorCore;
}

describe("rough cut tools", () => {
	test("creates an interactive review from timed subtitle tokens", () => {
		const tools = buildRoughCutTools({
			editor: createMockEditor(),
			deps: {
				now: () => 1_000,
				createId: () => "rough-cut-1",
			},
		});
		const createTool = tools.find(
			(tool) => tool.name === "rough_cut_create_review",
		);

		const review = createTool?.handler({});

		expect(review).toMatchObject({
			reviewId: "rough-cut-1",
			tokenCount: 7,
			selectedTokenCount: 3,
			candidateCount: 2,
			subtitleTrackId: "subtitles",
			subtitleElementId: "subtitle-1",
			openReview: true,
		});
		expect(review).toMatchObject({
			tokens: expect.arrayContaining([
				expect.objectContaining({
					text: "嗯",
					selected: true,
					reason: "filler",
				}),
				expect.objectContaining({
					text: "复制",
					selected: true,
					reason: "repeat",
					cueIndex: 1,
				}),
				expect.objectContaining({
					text: "复制",
					selected: false,
					cueIndex: 2,
				}),
			]),
		});
	});

	test("applies the reviewed token selection as timeline cut ranges", () => {
		const applySilenceCutPlan = mock(() => true);
		const tools = buildRoughCutTools({
			editor: createMockEditor({ applySilenceCutPlan }),
			deps: {
				now: () => 2_000,
				createId: () => "rough-cut-apply",
			},
		});
		const createTool = tools.find(
			(tool) => tool.name === "rough_cut_create_review",
		);
		const applyTool = tools.find(
			(tool) => tool.name === "rough_cut_apply_review",
		);

		const review = createTool?.handler({}) as {
			reviewId: string;
			tokens: Array<{ id: string; text: string; cueIndex: number }>;
		};
		const fillerTokenId = review.tokens.find((token) => token.text === "嗯")?.id;
		const manualTokenId = review.tokens.find(
			(token) => token.text === "我们",
		)?.id;

		const applied = applyTool?.handler({
			reviewId: review.reviewId,
			selectedTokenIds: [fillerTokenId, manualTokenId],
		});

		expect(applied).toMatchObject({
			applied: true,
			reviewId: "rough-cut-apply",
			selectedTokenCount: 2,
		});
		expect(applySilenceCutPlan).toHaveBeenCalledWith({
			targets: [
				{
					trackId: "main",
					elementId: "clip-1",
					ranges: [
						{ startTime: seconds(0), endTime: seconds(1.1) },
					],
				},
				{
					trackId: "subtitles",
					elementId: "subtitle-1",
					ranges: [
						{ startTime: seconds(0), endTime: seconds(1.1) },
					],
				},
			],
		});
	});

	test("applies edited token text back to the subtitle layer", () => {
		const applySilenceCutPlan = mock(() => true);
		const updateElements = mock(() => {});
		const tools = buildRoughCutTools({
			editor: createMockEditor({ applySilenceCutPlan, updateElements }),
			deps: {
				now: () => 3_000,
				createId: () => "rough-cut-edit",
			},
		});
		const createTool = tools.find(
			(tool) => tool.name === "rough_cut_create_review",
		);
		const applyTool = tools.find(
			(tool) => tool.name === "rough_cut_apply_review",
		);

		const review = createTool?.handler({}) as {
			reviewId: string;
			tokens: Array<{ id: string; text: string }>;
		};
		const tokenId = review.tokens.find((token) => token.text === "我们")?.id;

		const applied = applyTool?.handler({
			reviewId: review.reviewId,
			selectedTokenIds: [],
			tokenTextEdits: [{ tokenId, text: "咱们" }],
		});

		expect(applied).toMatchObject({
			applied: true,
			editedTokenCount: 1,
			selectedTokenCount: 0,
		});
		expect(applySilenceCutPlan).not.toHaveBeenCalled();
		expect(updateElements).toHaveBeenCalledTimes(1);
		const calls = updateElements.mock.calls as unknown as Array<
			[
				{
					updates: Array<{
						trackId: string;
						elementId: string;
						patch: {
							cues: Array<{
								text: string;
								tokens?: Array<{ text: string }>;
							}>;
						};
					}>;
				},
			]
		>;
		const call = calls[0]?.[0] as {
			updates: Array<{
				trackId: string;
				elementId: string;
				patch: {
					cues: Array<{
						text: string;
						tokens?: Array<{ text: string }>;
					}>;
				};
			}>;
		};
		expect(call.updates[0]?.trackId).toBe("subtitles");
		expect(call.updates[0]?.elementId).toBe("subtitle-1");
		expect(call.updates[0]?.patch.cues[0]?.text).toBe("嗯咱们开始");
		expect(call.updates[0]?.patch.cues[0]?.tokens?.map((token) => token.text))
			.toEqual(["嗯", "咱们", "开始"]);
	});
});
