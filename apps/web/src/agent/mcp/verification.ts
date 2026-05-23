import type { EditorCore } from "@/core";

export interface StateSnapshot {
	trackCount: number;
	trackIds: string[];
	elementCounts: Record<string, number>;
	selectedElements: number;
}

export function captureSnapshot(editor: EditorCore): StateSnapshot {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		return {
			trackCount: 0,
			trackIds: [],
			elementCounts: {},
			selectedElements: 0,
		};
	}

	const tracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];

	const elementCounts: Record<string, number> = {};
	for (const track of tracks) {
		elementCounts[track.id] = track.elements.length;
	}

	return {
		trackCount: tracks.length,
		trackIds: tracks.map((t) => t.id),
		elementCounts,
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
	}

	const stateChanged =
		changes.length > 0 ||
		before.selectedElements !== after.selectedElements;

	return {
		verified: stateChanged,
		changes,
	};
}
