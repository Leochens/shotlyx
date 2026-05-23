/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import { buildSilenceTools } from "@/agent/mcp/silence-tools";
import type { EditorCore } from "@/core";
import type { MediaTime } from "@/wasm";

const TICKS_PER_SECOND = 90_000;

function seconds(value: number): MediaTime {
	return Math.round(value * TICKS_PER_SECOND) as unknown as MediaTime;
}

function createMockEditor({
	selectedElements = [],
	applySilenceCutPlan = mock(() => true),
}: {
	selectedElements?: Array<{ trackId: string; elementId: string }>;
	applySilenceCutPlan?: ReturnType<typeof mock>;
} = {}): EditorCore {
	const clip = {
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
	const mainTrack = {
		id: "main",
		name: "Main",
		type: "video",
		muted: false,
		hidden: false,
		elements: [clip],
	};
	const tracks = {
		main: mainTrack,
		overlay: [],
		audio: [],
	};

	return {
		scenes: {
			getActiveSceneOrNull: () => ({ tracks }),
		},
		selection: {
			getSelectedElements: () => selectedElements,
		},
		media: {
			getAssets: () => [
				{
					id: "asset-1",
					name: "talking-head.mp4",
					type: "video",
					duration: 12,
				},
			],
		},
		timeline: {
			getElementsWithTracks: ({
				elements,
			}: {
				elements: Array<{ trackId: string; elementId: string }>;
			}) =>
				elements
					.filter(
						(ref) => ref.trackId === "main" && ref.elementId === "clip-1",
					)
					.map(() => ({ track: mainTrack, element: clip })),
			applySilenceCutPlan,
		},
	} as unknown as EditorCore;
}

describe("silence tools", () => {
	test("analyzes an explicit element and applies the cached plan", async () => {
		const applySilenceCutPlan = mock(() => true);
		const analyzeSilenceForElements = mock(async () => ({
			totalSilenceDuration: seconds(1.5),
			targets: [
				{
					trackId: "main",
					elementId: "clip-1",
					elementName: "Talking head",
					segments: [
						{
							startTime: seconds(2),
							endTime: seconds(3.5),
						},
					],
				},
			],
		}));
		const tools = buildSilenceTools({
			editor: createMockEditor({ applySilenceCutPlan }),
			deps: {
				analyzeSilenceForElements,
				now: () => 1_000,
				createId: () => "plan-1",
			},
		});

		const analyzeTool = tools.find(
			(tool) => tool.name === "silence_analyze_timeline",
		);
		const applyTool = tools.find(
			(tool) => tool.name === "silence_apply_cut_plan",
		);

		const analysis = await analyzeTool?.handler({
			scope: "element",
			trackId: "main",
			elementId: "clip-1",
			minSilenceMs: 500,
			paddingMs: 120,
		});

		expect(analysis).toMatchObject({
			planId: "plan-1",
			analyzedClipCount: 1,
			targetCount: 1,
			segmentCount: 1,
			totalSilenceSeconds: 1.5,
		});
		expect(analyzeSilenceForElements.mock.calls[0]?.[0]).toMatchObject({
			options: {
				minSilenceMs: 500,
				paddingMs: 120,
			},
		});

		const applied = applyTool?.handler({ planId: "plan-1" });
		expect(applied).toMatchObject({
			applied: true,
			planId: "plan-1",
			segmentCount: 1,
			removedSeconds: 1.5,
		});
		expect(applySilenceCutPlan.mock.calls[0]?.[0]).toEqual({
			targets: [
				{
					trackId: "main",
					elementId: "clip-1",
					ranges: [
						{
							startTime: seconds(2),
							endTime: seconds(3.5),
						},
					],
				},
			],
		});
	});

	test("blank planId falls back to the latest cached plan", async () => {
		const applySilenceCutPlan = mock(() => true);
		const tools = buildSilenceTools({
			editor: createMockEditor({ applySilenceCutPlan }),
			deps: {
				analyzeSilenceForElements: mock(async () => ({
					totalSilenceDuration: seconds(0.8),
					targets: [
						{
							trackId: "main",
							elementId: "clip-1",
							elementName: "Talking head",
							segments: [
								{
									startTime: seconds(5),
									endTime: seconds(5.8),
								},
							],
						},
					],
				})),
				now: () => 1_500,
				createId: () => "plan-latest",
			},
		});
		const analyzeTool = tools.find(
			(tool) => tool.name === "silence_analyze_timeline",
		);
		const applyTool = tools.find(
			(tool) => tool.name === "silence_apply_cut_plan",
		);

		await analyzeTool?.handler({
			scope: "element",
			trackId: "main",
			elementId: "clip-1",
		});
		const applied = applyTool?.handler({ planId: "" });

		expect(applied).toMatchObject({
			applied: true,
			planId: "plan-latest",
			segmentCount: 1,
		});
	});

	test("auto scope prefers the current selection", async () => {
		const analyzeSilenceForElements = mock(async () => ({
			totalSilenceDuration: seconds(0),
			targets: [],
		}));
		const tools = buildSilenceTools({
			editor: createMockEditor({
				selectedElements: [{ trackId: "main", elementId: "clip-1" }],
			}),
			deps: {
				analyzeSilenceForElements,
				now: () => 2_000,
				createId: () => "plan-2",
			},
		});
		const analyzeTool = tools.find(
			(tool) => tool.name === "silence_analyze_timeline",
		);

		await analyzeTool?.handler({});

		expect(analyzeSilenceForElements.mock.calls[0]?.[0].elements).toHaveLength(
			1,
		);
		expect(
			analyzeSilenceForElements.mock.calls[0]?.[0].elements[0]?.element.id,
		).toBe("clip-1");
	});
});
