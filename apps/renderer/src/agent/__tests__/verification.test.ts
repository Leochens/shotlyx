import { describe, expect, test } from "bun:test";
import {
	captureSnapshot,
	verifyChanges,
} from "@/agent/mcp/verification";
import type { StateSnapshot } from "@/agent/mcp/verification";

function makeMockEditor(opts: {
	tracks?: Array<{ id: string; elements: Array<unknown> }>;
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
