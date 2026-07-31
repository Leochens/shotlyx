import { Command, type CommandResult } from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";

export class RemoveTrackCommand extends Command {
	private savedState: SceneTracks | null = null;

	constructor(private trackId: string) {
		super();
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		const selection = editor.selection.getSnapshot();
		const updatedTracks: SceneTracks = {
			...this.savedState,
			overlay: this.savedState.overlay.filter((track) => track.id !== this.trackId),
			audio: this.savedState.audio.filter((track) => track.id !== this.trackId),
		};
		editor.timeline.updateTracks(updatedTracks);
		return {
			selection: {
				selectedElements: selection.selectedElements.filter(
					(element) => element.trackId !== this.trackId,
				),
				selectedKeyframes: selection.selectedKeyframes.filter(
					(keyframe) => keyframe.trackId !== this.trackId,
				),
				keyframeSelectionAnchor:
					selection.keyframeSelectionAnchor?.trackId === this.trackId
						? null
						: selection.keyframeSelectionAnchor,
				selectedMaskPoints:
					selection.selectedMaskPoints?.trackId === this.trackId
						? null
						: selection.selectedMaskPoints,
			},
		};
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
