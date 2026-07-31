import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { EditorSelectionPatch } from "@/selection/editor-selection";
import type { SceneTracks } from "@/timeline";

export class OrganizeTracksCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor({
		tracks,
		elementTrackMap,
	}: {
		tracks: SceneTracks;
		elementTrackMap: Map<string, string>;
	}) {
		super();
		this.tracks = tracks;
		this.elementTrackMap = elementTrackMap;
	}

	private readonly tracks: SceneTracks;
	private readonly elementTrackMap: Map<string, string>;

	shouldApplyRipple(): boolean {
		return false;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const selection = editor.selection.getSnapshot();
		editor.timeline.updateTracks(this.tracks);

		const selectionPatch = remapSelection({
			selection,
			elementTrackMap: this.elementTrackMap,
		});
		return selectionPatch ? { selection: selectionPatch } : undefined;
	}

	undo(): void {
		if (this.savedState) {
			EditorCore.getInstance().timeline.updateTracks(this.savedState);
		}
	}
}

function remapSelection({
	selection,
	elementTrackMap,
}: {
	selection: ReturnType<EditorCore["selection"]["getSnapshot"]>;
	elementTrackMap: Map<string, string>;
}): EditorSelectionPatch | null {
	let changed = false;

	const selectedElements = selection.selectedElements.map((element) => {
		const nextTrackId = elementTrackMap.get(element.elementId);
		if (!nextTrackId || nextTrackId === element.trackId) return element;
		changed = true;
		return { ...element, trackId: nextTrackId };
	});

	const selectedKeyframes = selection.selectedKeyframes.map((keyframe) => {
		const nextTrackId = elementTrackMap.get(keyframe.elementId);
		if (!nextTrackId || nextTrackId === keyframe.trackId) return keyframe;
		changed = true;
		return { ...keyframe, trackId: nextTrackId };
	});

	const keyframeSelectionAnchor = (() => {
		const anchor = selection.keyframeSelectionAnchor;
		if (!anchor) return anchor;
		const nextTrackId = elementTrackMap.get(anchor.elementId);
		if (!nextTrackId || nextTrackId === anchor.trackId) return anchor;
		changed = true;
		return { ...anchor, trackId: nextTrackId };
	})();

	const selectedMaskPoints = (() => {
		const maskPoints = selection.selectedMaskPoints;
		if (!maskPoints) return maskPoints;
		const nextTrackId = elementTrackMap.get(maskPoints.elementId);
		if (!nextTrackId || nextTrackId === maskPoints.trackId) return maskPoints;
		changed = true;
		return { ...maskPoints, trackId: nextTrackId };
	})();

	if (!changed) return null;
	return {
		selectedElements,
		selectedKeyframes,
		keyframeSelectionAnchor,
		selectedMaskPoints,
	};
}
