import type { EditorCore } from "@/core";

export interface StateSnapshot {
	trackCount: number;
	trackIds: string[];
	elementCounts: Record<string, number>;
	elementFingerprints?: Record<string, Record<string, string>>;
	trackFingerprints?: Record<string, string>;
	selectedElements: number;
}

function stableSnapshotValue({
	value,
	seen = new WeakSet<object>(),
}: {
	value: unknown;
	seen?: WeakSet<object>;
}): unknown {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "undefined" || typeof value === "function") {
		return undefined;
	}
	if (Array.isArray(value)) {
		return value.map((item) => stableSnapshotValue({ value: item, seen }));
	}
	if (typeof value !== "object") return String(value);
	if (seen.has(value)) return "[circular]";
	seen.add(value);
	if (value instanceof Date) return value.toISOString();

	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== "buffer")
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, stableSnapshotValue({ value: item, seen })])
			.filter(([, item]) => item !== undefined),
	);
}

function fingerprint(value: unknown): string {
	return JSON.stringify(stableSnapshotValue({ value }));
}

export function captureSnapshot(editor: EditorCore): StateSnapshot {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		return {
			trackCount: 0,
			trackIds: [],
			elementCounts: {},
			elementFingerprints: {},
			trackFingerprints: {},
			selectedElements: 0,
		};
	}

	const tracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];

	const elementCounts: Record<string, number> = {};
	const elementFingerprints: Record<string, Record<string, string>> = {};
	const trackFingerprints: Record<string, string> = {};
	for (const track of tracks) {
		elementCounts[track.id] = track.elements.length;
		elementFingerprints[track.id] = Object.fromEntries(
			track.elements.map((element) => [element.id, fingerprint(element)]),
		);
		const { elements: _elements, ...trackState } = track;
		trackFingerprints[track.id] = fingerprint(trackState);
	}

	return {
		trackCount: tracks.length,
		trackIds: tracks.map((t) => t.id),
		elementCounts,
		elementFingerprints,
		trackFingerprints,
		selectedElements: editor.selection.getSelectedElements().length,
	};
}

export interface VerificationResult {
	verified: boolean;
	changes: Array<{
		type: "added" | "removed" | "updated";
		target: string;
		detail?: string;
	}>;
	expectation?: {
		description: string;
		satisfied: boolean;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

function readStringField({
	value,
	key,
}: {
	value: Record<string, unknown> | null;
	key: string;
}): string | null {
	return typeof value?.[key] === "string" ? value[key] : null;
}

function readElementFingerprint({
	snapshot,
	trackId,
	elementId,
}: {
	snapshot: StateSnapshot;
	trackId: string;
	elementId: string;
}): Record<string, unknown> | null {
	const serialized = snapshot.elementFingerprints?.[trackId]?.[elementId];
	if (!serialized) return null;
	try {
		return readRecord(JSON.parse(serialized));
	} catch {
		return null;
	}
}

export function verifyChanges(
	before: StateSnapshot,
	after: StateSnapshot,
): VerificationResult {
	const changes: VerificationResult["changes"] = [];

	if (after.trackCount > before.trackCount) {
		const newTracks = after.trackIds.filter(
			(id) => !before.trackIds.includes(id),
		);
		for (const id of newTracks) {
			changes.push({ type: "added", target: "track", detail: id });
		}
	} else if (after.trackCount < before.trackCount) {
		const removedTracks = before.trackIds.filter(
			(id) => !after.trackIds.includes(id),
		);
		for (const id of removedTracks) {
			changes.push({ type: "removed", target: "track", detail: id });
		}
	}

	for (const trackId of after.trackIds) {
		const beforeCount = before.elementCounts[trackId] ?? 0;
		const afterCount = after.elementCounts[trackId] ?? 0;
		if (afterCount > beforeCount) {
			changes.push({
				type: "added",
				target: "element",
				detail: `${trackId}: ${beforeCount} → ${afterCount}`,
			});
		} else if (afterCount < beforeCount) {
			changes.push({
				type: "removed",
				target: "element",
				detail: `${trackId}: ${beforeCount} → ${afterCount}`,
			});
		}

		const beforeElements = before.elementFingerprints?.[trackId] ?? {};
		const afterElements = after.elementFingerprints?.[trackId] ?? {};
		for (const elementId of Object.keys(afterElements)) {
			if (
				beforeElements[elementId] !== undefined &&
				beforeElements[elementId] !== afterElements[elementId]
			) {
				changes.push({
					type: "updated",
					target: "element",
					detail: `${trackId}:${elementId}`,
				});
			}
		}

		const beforeTrack = before.trackFingerprints?.[trackId];
		const afterTrack = after.trackFingerprints?.[trackId];
		if (
			beforeTrack !== undefined &&
			afterTrack !== undefined &&
			beforeTrack !== afterTrack
		) {
			changes.push({
				type: "updated",
				target: "track",
				detail: trackId,
			});
		}
	}

	const stateChanged =
		changes.length > 0 || before.selectedElements !== after.selectedElements;

	return {
		verified: stateChanged,
		changes,
	};
}

export function verifyToolMutation({
	toolName,
	params,
	data,
	before,
	after,
}: {
	toolName: string;
	params: Record<string, unknown>;
	data: unknown;
	before: StateSnapshot;
	after: StateSnapshot;
}): VerificationResult {
	const generic = verifyChanges(before, after);
	const resultData = readRecord(data);
	const trackId =
		readStringField({ value: resultData, key: "trackId" }) ??
		readStringField({ value: params, key: "trackId" });
	const elementId =
		readStringField({ value: resultData, key: "elementId" }) ??
		readStringField({ value: params, key: "elementId" });

	if (toolName === "timeline_delete_clip" && trackId && elementId) {
		const satisfied = !after.elementFingerprints?.[trackId]?.[elementId];
		return {
			...generic,
			verified: satisfied,
			expectation: {
				description: `element_removed:${trackId}:${elementId}`,
				satisfied,
			},
		};
	}

	if (
		toolName === "timeline_delete_elements" &&
		Array.isArray(params.elementRefs)
	) {
		const refs = params.elementRefs.flatMap((value) => {
			const ref = readRecord(value);
			const refTrackId = readStringField({ value: ref, key: "trackId" });
			const refElementId = readStringField({ value: ref, key: "elementId" });
			return refTrackId && refElementId
				? [{ trackId: refTrackId, elementId: refElementId }]
				: [];
		});
		const satisfied =
			refs.length > 0 &&
			refs.every(
				(ref) => !after.elementFingerprints?.[ref.trackId]?.[ref.elementId],
			);
		return {
			...generic,
			verified: satisfied,
			expectation: {
				description: `elements_removed:${refs.length}`,
				satisfied,
			},
		};
	}

	if (toolName === "timeline_remove_track" && trackId) {
		const satisfied = !after.trackIds.includes(trackId);
		return {
			...generic,
			verified: satisfied,
			expectation: {
				description: `track_removed:${trackId}`,
				satisfied,
			},
		};
	}

	if (toolName === "timeline_update_text_content" && trackId && elementId) {
		const expectedContent = readStringField({ value: params, key: "content" });
		const element = readElementFingerprint({
			snapshot: after,
			trackId,
			elementId,
		});
		const elementParams = readRecord(element?.params);
		const satisfied =
			expectedContent !== null &&
			readStringField({ value: elementParams, key: "content" }) ===
				expectedContent;
		return {
			...generic,
			verified: satisfied,
			expectation: {
				description: `text_content:${trackId}:${elementId}`,
				satisfied,
			},
		};
	}

	return generic;
}
