import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import {
	buildMergeElementsPlan,
	type MergeElementsPlan,
} from "@/timeline/merge-elements";
import type { ElementRef, SceneTracks, TimelineTrack } from "@/timeline";

function applyMergeToTrack<TTrack extends TimelineTrack>({
	track,
	plan,
}: {
	track: TTrack;
	plan: MergeElementsPlan;
}): TTrack {
	if (track.id !== plan.trackId) {
		return track;
	}

	const removedElementIds = new Set(plan.removedElementIds);
	return {
		...track,
		elements: track.elements
			.map((element) =>
				element.id === plan.mergedElement.id ? plan.mergedElement : element,
			)
			.filter((element) => !removedElementIds.has(element.id)),
	} as TTrack;
}

export class MergeElementsCommand extends Command {
	private savedState: SceneTracks | null = null;
	private readonly elements: ElementRef[];

	constructor({ elements }: { elements: ElementRef[] }) {
		super();
		this.elements = elements;
	}

	shouldApplyRipple(): boolean {
		return false;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const before = editor.scenes.getActiveScene().tracks;
		const plan = buildMergeElementsPlan({
			tracks: before,
			elements: this.elements,
		});
		if (!plan) {
			return undefined;
		}

		this.savedState = before;
		const updatedTracks: SceneTracks = {
			overlay: before.overlay.map((track) => applyMergeToTrack({ track, plan })),
			main: applyMergeToTrack({ track: before.main, plan }),
			audio: before.audio.map((track) => applyMergeToTrack({ track, plan })),
		};

		editor.timeline.updateTracks(updatedTracks);
		return createElementSelectionResult([
			{ trackId: plan.trackId, elementId: plan.mergedElement.id },
		]);
	}

	undo(): void {
		if (!this.savedState) {
			return;
		}
		EditorCore.getInstance().timeline.updateTracks(this.savedState);
	}
}
