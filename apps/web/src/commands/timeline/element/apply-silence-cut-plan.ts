import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { ElementRef, SceneTracks } from "@/timeline";

export class ApplySilenceCutPlanCommand extends Command {
	constructor({
		before,
		after,
		selectedElements = [],
	}: {
		before: SceneTracks;
		after: SceneTracks;
		selectedElements?: ElementRef[];
	}) {
		super();
		this.before = before;
		this.after = after;
		this.selectedElements = selectedElements;
	}

	private before: SceneTracks;
	private after: SceneTracks;
	private selectedElements: ElementRef[];

	shouldApplyRipple(): boolean {
		return false;
	}

	execute(): CommandResult | undefined {
		EditorCore.getInstance().timeline.updateTracks(this.after);
		return createElementSelectionResult(this.selectedElements);
	}

	undo(): void {
		EditorCore.getInstance().timeline.updateTracks(this.before);
	}
}
