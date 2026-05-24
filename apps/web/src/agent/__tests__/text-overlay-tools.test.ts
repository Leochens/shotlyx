/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { planTextOverlay } from "@/agent/mcp/text-overlay-planner";
import { buildTextOverlayTools } from "@/agent/mcp/text-overlay-tools";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(seconds * MEDIA_TIME_TICKS_PER_SECOND) as unknown as MediaTime;
}

function createMockEditor({
	insertElement = mock(() => ({ elementId: "text-1", trackId: "track-text" })),
}: {
	insertElement?: ReturnType<typeof mock>;
} = {}): EditorCore {
	return {
		timeline: {
			insertElement,
			getTrackById: () => null,
		},
		project: {
			getActiveOrNull: () => ({
				settings: {
					canvasSize: { width: 1024, height: 768 },
				},
			}),
		},
		selection: {
			getSelectedElements: () => [],
		},
	} as unknown as EditorCore;
}

describe("planTextOverlay", () => {
	test("plans a title inside the canvas safe area with app-scale font size", () => {
		const plan = planTextOverlay({
			canvasSize: { width: 1024, height: 768 },
			content: "花生：地下宝藏",
			kind: "title",
			style: "documentary",
			placement: "top",
		});

		expect(plan.params.fontSize).toBeLessThanOrEqual(9);
		expect(plan.params.fontSize).toBeGreaterThanOrEqual(6);
		expect(plan.params["transform.positionY"]).toBeLessThan(0);
		expect(plan.params["background.enabled"]).toBe(true);
	});

	test("uses smaller bottom text for caption-like overlays", () => {
		const plan = planTextOverlay({
			canvasSize: { width: 1024, height: 768 },
			content: "花生富含植物蛋白和不饱和脂肪酸",
			kind: "caption",
			style: "clean",
			placement: "bottom",
		});

		expect(plan.params.fontSize).toBeLessThan(6);
		expect(plan.params["transform.positionY"]).toBeGreaterThan(0);
		expect(plan.durationSeconds).toBe(4);
	});
});

describe("timeline_insert_text_overlay", () => {
	test("inserts a planned title without requiring raw font or position params", () => {
		const insertElement = mock(() => ({
			elementId: "title-1",
			trackId: "text-track-1",
		}));
		const editor = createMockEditor({ insertElement });
		const tools = buildTextOverlayTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find(
			(item) => item.name === "timeline_insert_text_overlay",
		);

		const result = tool?.handler({
			content: "花生科普",
			kind: "title",
			style: "documentary",
			placement: "top",
			startTimeSeconds: 0,
		});

		expect(result).toMatchObject({
			inserted: true,
			trackId: "text-track-1",
			elementId: "title-1",
			kind: "title",
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "text",
				params: {
					content: "花生科普",
					fontWeight: "bold",
					"background.enabled": true,
				},
			},
			placement: { mode: "auto", trackType: "text" },
		});
	});
});
