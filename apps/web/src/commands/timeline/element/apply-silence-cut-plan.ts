import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { ElementRef, SceneTracks } from "@/timeline";
import type { TProjectSubtitles } from "@/project/types";
import type { SilenceCutTarget } from "@/silence";
import {
	buildSubtitleCutRangesFromTargets,
	syncProjectSubtitlesForTimelineCuts,
} from "@/subtitles/timeline-sync";

export class ApplySilenceCutPlanCommand extends Command {
	constructor({
		before,
		after,
		targets,
		selectedElements = [],
	}: {
		before: SceneTracks;
		after: SceneTracks;
		targets: SilenceCutTarget[];
		selectedElements?: ElementRef[];
	}) {
		super();
		this.before = before;
		this.after = after;
		this.targets = targets;
		this.selectedElements = selectedElements;
	}

	private before: SceneTracks;
	private after: SceneTracks;
	private targets: SilenceCutTarget[];
	private selectedElements: ElementRef[];
	private beforeSubtitles: TProjectSubtitles | null | undefined;
	private didUpdateSubtitles = false;

	shouldApplyRipple(): boolean {
		return false;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.beforeSubtitles = editor.project.getActiveOrNull()?.settings.subtitles;
		const nextSubtitles = syncProjectSubtitlesForTimelineCuts({
			subtitles: this.beforeSubtitles,
			timelineTracks: this.before,
			ranges: buildSubtitleCutRangesFromTargets({
				targets: this.targets,
				mode: "collapse",
			}),
		});
		this.didUpdateSubtitles = nextSubtitles !== this.beforeSubtitles;
		editor.timeline.updateTracks(this.after);
		if (this.didUpdateSubtitles) {
			applyProjectSubtitles({ editor, subtitles: nextSubtitles });
		}
		return createElementSelectionResult(this.selectedElements);
	}

	undo(): void {
		const editor = EditorCore.getInstance();
		editor.timeline.updateTracks(this.before);
		if (this.didUpdateSubtitles) {
			applyProjectSubtitles({ editor, subtitles: this.beforeSubtitles });
		}
	}
}

function applyProjectSubtitles({
	editor,
	subtitles,
}: {
	editor: EditorCore;
	subtitles: TProjectSubtitles | null | undefined;
}): void {
	const activeProject = editor.project.getActiveOrNull();
	if (!activeProject) return;
	editor.project.setActiveProject({
		project: {
			...activeProject,
			settings: {
				...activeProject.settings,
				subtitles,
			},
			metadata: {
				...activeProject.metadata,
				updatedAt: new Date(),
			},
		},
	});
}
