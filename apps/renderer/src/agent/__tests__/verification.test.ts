import { describe, expect, test } from "bun:test";
import {
	captureSnapshot,
	verifyChanges,
	verifyToolMutation,
} from "@/agent/mcp/verification";
import type { StateSnapshot } from "@/agent/mcp/verification";

function makeMockEditor(opts: {
	tracks?: Array<{
		id: string;
		elements: Array<unknown>;
		muted?: boolean;
		hidden?: boolean;
	}>;
	selectedElements?: Array<unknown>;
	hasScene?: boolean;
}) {
	const {
		tracks = [{ id: "main-1", elements: [] }],
		selectedElements = [],
		hasScene = true,
	} = opts;

	const mainTrack = tracks[0] ?? { id: "main-1", elements: [] };
	const overlayTracks = tracks.slice(1);

	return {
		scenes: {
			getActiveSceneOrNull: () =>
				hasScene
					? {
							tracks: {
								main: mainTrack,
								overlay: overlayTracks,
								audio: [],
							},
						}
					: null,
		},
		selection: {
			getSelectedElements: () => selectedElements,
		},
	};
}

describe("captureSnapshot", () => {
	test("returns empty snapshot when no active scene", () => {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		const editor = makeMockEditor({ hasScene: false }) as never;
		const snapshot = captureSnapshot(editor);

		expect(snapshot.trackCount).toBe(0);
		expect(snapshot.trackIds).toEqual([]);
		expect(snapshot.elementCounts).toEqual({});
		expect(snapshot.selectedElements).toBe(0);
	});

	test("captures track count and ids", () => {
		const editor = makeMockEditor({
			tracks: [
				{ id: "main-1", elements: [{ id: "el-1" }] },
				{ id: "overlay-1", elements: [] },
			],
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		}) as never;
		const snapshot = captureSnapshot(editor);

		expect(snapshot.trackCount).toBe(2);
		expect(snapshot.trackIds).toEqual(["main-1", "overlay-1"]);
	});

	test("captures element counts per track", () => {
		const editor = makeMockEditor({
			tracks: [
				{ id: "main-1", elements: [{ id: "a" }, { id: "b" }] },
				{ id: "overlay-1", elements: [{ id: "c" }] },
			],
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		}) as never;
		const snapshot = captureSnapshot(editor);

		expect(snapshot.elementCounts["main-1"]).toBe(2);
		expect(snapshot.elementCounts["overlay-1"]).toBe(1);
	});

	test("captures selected elements count", () => {
		const editor = makeMockEditor({
			selectedElements: [{ id: "sel-1" }, { id: "sel-2" }],
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		}) as never;
		const snapshot = captureSnapshot(editor);

		expect(snapshot.selectedElements).toBe(2);
	});

	test("captures stable element fingerprints for semantic verification", () => {
		const editor = makeMockEditor({
			tracks: [
				{
					id: "main-1",
					elements: [
						{
							id: "text-1",
							type: "text",
							name: "Title",
							params: { text: "Before", color: "#fff" },
						},
					],
				},
			],
			// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
		}) as never;

		const snapshot = captureSnapshot(editor);
		expect(snapshot.elementFingerprints["main-1"]?.["text-1"]).toContain(
			"Before",
		);
	});
});

describe("verifyChanges", () => {
	test("detects added tracks", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 0 },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			trackCount: 2,
			trackIds: ["main-1", "overlay-1"],
			elementCounts: { "main-1": 0, "overlay-1": 0 },
			selectedElements: 0,
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toContainEqual({
			type: "added",
			target: "track",
			detail: "overlay-1",
		});
	});

	test("detects removed tracks", () => {
		const before: StateSnapshot = {
			trackCount: 2,
			trackIds: ["main-1", "overlay-1"],
			elementCounts: { "main-1": 0, "overlay-1": 0 },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 0 },
			selectedElements: 0,
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toContainEqual({
			type: "removed",
			target: "track",
			detail: "overlay-1",
		});
	});

	test("detects added elements in a track", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 1 },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 3 },
			selectedElements: 0,
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toContainEqual({
			type: "added",
			target: "element",
			detail: "main-1: 1 → 3",
		});
	});

	test("detects removed elements in a track", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 3 },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 1 },
			selectedElements: 0,
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toContainEqual({
			type: "removed",
			target: "element",
			detail: "main-1: 3 → 1",
		});
	});

	test("detects an updated element even when track counts stay the same", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 1 },
			elementFingerprints: {
				"main-1": { "text-1": '{"params":{"text":"Before"}}' },
			},
			trackFingerprints: { "main-1": "{}" },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			...before,
			elementFingerprints: {
				"main-1": { "text-1": '{"params":{"text":"After"}}' },
			},
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toContainEqual({
			type: "updated",
			target: "element",
			detail: "main-1:text-1",
		});
	});

	test("reports no changes when states are equal", () => {
		const snapshot: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 2 },
			selectedElements: 1,
		};

		const result = verifyChanges(snapshot, snapshot);
		expect(result.verified).toBe(false);
		expect(result.changes).toHaveLength(0);
	});

	test("detects selection change as verified even without structural changes", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 2 },
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 2 },
			selectedElements: 2,
		};

		const result = verifyChanges(before, after);
		expect(result.verified).toBe(true);
		expect(result.changes).toHaveLength(0);
	});
});

describe("verifyToolMutation", () => {
	test("requires a deleted clip to actually disappear", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["main-1"],
			elementCounts: { "main-1": 1 },
			elementFingerprints: { "main-1": { "clip-1": "{}" } },
			selectedElements: 0,
		};
		const result = verifyToolMutation({
			toolName: "timeline_delete_clip",
			params: { trackId: "main-1", elementId: "clip-1" },
			data: { deleted: true, trackId: "main-1", elementId: "clip-1" },
			before,
			after: before,
		});

		expect(result.verified).toBe(false);
		expect(result.expectation).toEqual({
			description: "element_removed:main-1:clip-1",
			satisfied: false,
		});
	});

	test("verifies the requested text content rather than only an object change", () => {
		const before: StateSnapshot = {
			trackCount: 1,
			trackIds: ["text-track"],
			elementCounts: { "text-track": 1 },
			elementFingerprints: {
				"text-track": {
					"text-1": '{"id":"text-1","params":{"content":"Before"}}',
				},
			},
			selectedElements: 0,
		};
		const after: StateSnapshot = {
			...before,
			elementFingerprints: {
				"text-track": {
					"text-1": '{"id":"text-1","params":{"content":"After"}}',
				},
			},
		};
		const result = verifyToolMutation({
			toolName: "timeline_update_text_content",
			params: {
				trackId: "text-track",
				elementId: "text-1",
				content: "After",
			},
			data: { updated: true },
			before,
			after,
		});

		expect(result.verified).toBe(true);
		expect(result.expectation?.satisfied).toBe(true);
	});
});
