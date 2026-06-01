/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Test mocks intentionally narrow EditorCore and MediaTime. */
import { describe, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import { FLOWER_TEXT_PRESETS } from "@/graphics/definitions/flower-text";
import { buildFlowerTextTools } from "@/agent/mcp/flower-text-tools";
import type { MediaTime } from "@/wasm";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

function mockMediaTimeFromSeconds({ seconds }: { seconds: number }): MediaTime {
	return Math.round(
		seconds * MEDIA_TIME_TICKS_PER_SECOND,
	) as unknown as MediaTime;
}

function createMockEditor({
	insertElement = mock(() => ({
		elementId: "flower-text-1",
		trackId: "graphic-track-1",
	})),
}: {
	insertElement?: ReturnType<typeof mock>;
} = {}): EditorCore {
	return {
		timeline: {
			insertElement,
			getTrackById: () => null,
		},
		selection: {
			getSelectedElements: () => [],
		},
	} as unknown as EditorCore;
}

describe("flower text MCP tools", () => {
	test("lists reusable flower text presets for the AI", () => {
		const tools = buildFlowerTextTools({
			editor: createMockEditor(),
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "flower_text_list_presets");

		const result = tool?.handler({});

		expect(result).toMatchObject({
			presets: expect.arrayContaining([
				expect.objectContaining({
					id: FLOWER_TEXT_PRESETS[0]?.id,
					name: FLOWER_TEXT_PRESETS[0]?.name,
					defaultText: FLOWER_TEXT_PRESETS[0]?.defaultText,
					useCases: expect.any(Array),
				}),
			]),
		});
	});

	test("inserts a flower text graphic with requested content and placement", () => {
		const insertElement = mock(() => ({
			elementId: "flower-text-1",
			trackId: "graphic-track-1",
		}));
		const editor = createMockEditor({ insertElement });
		const tools = buildFlowerTextTools({
			editor,
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "flower_text_insert");
		const presetId = FLOWER_TEXT_PRESETS[0]!.id;

		const result = tool?.handler({
			presetId,
			content: "重点来了",
			startTimeSeconds: 1.25,
			durationSeconds: 2.5,
			positionX: 0.15,
			positionY: -0.2,
			scale: 0.8,
			accentColor: "#ff3b30",
		});

		expect(result).toMatchObject({
			inserted: true,
			elementId: "flower-text-1",
			trackId: "graphic-track-1",
			presetId,
			content: "重点来了",
		});
		expect(insertElement.mock.calls[0]?.[0]).toMatchObject({
			element: {
				type: "graphic",
				definitionId: FLOWER_TEXT_PRESETS[0]?.definitionId,
				params: {
					content: "重点来了",
					accentColor: "#ff3b30",
					"transform.positionX": 0.15,
					"transform.positionY": -0.2,
					"transform.scaleX": 0.8,
					"transform.scaleY": 0.8,
				},
				animations: {
					"params.progress": expect.any(Object),
				},
			},
			placement: { mode: "auto", trackType: "graphic" },
		});
	});

	test("rejects unknown presets without inserting", () => {
		const insertElement = mock(() => ({
			elementId: "flower-text-1",
			trackId: "graphic-track-1",
		}));
		const tools = buildFlowerTextTools({
			editor: createMockEditor({ insertElement }),
			deps: { mediaTimeFromSeconds: mockMediaTimeFromSeconds },
		});
		const tool = tools.find((item) => item.name === "flower_text_insert");

		expect(() =>
			tool?.handler({
				presetId: "missing",
				content: "不会插入",
				startTimeSeconds: 0,
			}),
		).toThrow("Unknown flower text preset");
		expect(insertElement).not.toHaveBeenCalled();
	});
});
