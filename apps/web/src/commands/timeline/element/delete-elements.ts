import { Command, type CommandResult } from "@/commands/base-command";
import type { SceneTracks } from "@/timeline";
import { EditorCore } from "@/core";
import type { TimelineTrack } from "@/timeline";
import type { TProjectSubtitles } from "@/project/types";
import {
	buildSubtitleCutRangesFromElements,
	getTimelineCutModeForCommand,
	syncProjectSubtitlesForTimelineCuts,
} from "@/subtitles/timeline-sync";

function removeTrackElements<TTrack extends TimelineTrack>({
	track,
	elements,
}: {
	track: TTrack;
	elements: { trackId: string; elementId: string }[];
}): TTrack {
	const nextElements = track.elements.filter(
		(element) =>
			!elements.some(
				(target) =>
					target.trackId === track.id && target.elementId === element.id,
			),
	);

	return { ...track, elements: nextElements } as TTrack;
}

export class DeleteElementsCommand extends Command {
	private savedState: SceneTracks | null = null;
	private savedSubtitles: TProjectSubtitles | null | undefined;
	private didUpdateSubtitles = false;
	private readonly elements: { trackId: string; elementId: string }[];

	constructor({
		elements,
	}: {
		elements: { trackId: string; elementId: string }[];
	}) {
		super();
		this.elements = elements;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		this.savedState = editor.scenes.getActiveScene().tracks;
		this.savedSubtitles = editor.project.getActiveOrNull()?.settings.subtitles;
		const nextSubtitles = syncProjectSubtitlesForTimelineCuts({
			subtitles: this.savedSubtitles,
			timelineTracks: this.savedState,
			ranges: buildSubtitleCutRangesFromElements({
				tracks: this.savedState,
				elements: this.elements,
				mode: getTimelineCutModeForCommand({
					rippleEnabled: editor.command.isRippleEnabled,
				}),
			}),
		});
		this.didUpdateSubtitles = nextSubtitles !== this.savedSubtitles;

		const updatedTracks: SceneTracks = {
			overlay: this.savedState.overlay.map((track) =>
				removeTrackElements({ track, elements: this.elements }),
			),
			main: removeTrackElements({
				track: this.savedState.main,
				elements: this.elements,
			}),
			audio: this.savedState.audio.map((track) =>
				removeTrackElements({ track, elements: this.elements }),
			),
		};

		editor.timeline.updateTracks(updatedTracks);
		if (this.didUpdateSubtitles) {
			applyProjectSubtitles({ editor, subtitles: nextSubtitles });
		}

		return {
			selection: {
				selectedElements: [],
				selectedKeyframes: [],
				keyframeSelectionAnchor: null,
				selectedMaskPoints: null,
			},
		};
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
			if (this.didUpdateSubtitles) {
				applyProjectSubtitles({ editor, subtitles: this.savedSubtitles });
			}
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
