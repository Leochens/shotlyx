import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import type { MediaTime } from "@/wasm";

export function buildEditorTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeToSeconds: (args: { time: MediaTime }) => number };
}): Tool[] {
	return [
		{
			name: "editor_get_status",
			description:
				"获取编辑器当前状态，包括项目、播放和时间线状态",
			parameters: {},
			handler: () => {
				const project = editor.project.getActiveOrNull();
				const scene = editor.scenes.getActiveSceneOrNull();

				let trackCount = 0;
				let elementCount = 0;
				if (scene) {
					trackCount =
						1 + scene.tracks.overlay.length + scene.tracks.audio.length;
					elementCount =
						scene.tracks.main.elements.length +
						scene.tracks.overlay.reduce(
							(sum, t) => sum + t.elements.length,
							0,
						) +
						scene.tracks.audio.reduce(
							(sum, t) => sum + t.elements.length,
							0,
						);
				}

				const totalDuration = editor.timeline.getTotalDuration();
				const currentTime = editor.playback.getCurrentTime();

				return {
					initialized: true,
					projectLoaded: project !== null,
					isPlaying: editor.playback.getIsPlaying(),
					currentTime: deps.mediaTimeToSeconds({ time: currentTime }),
					duration: deps.mediaTimeToSeconds({ time: totalDuration }),
					selectedElements:
						editor.selection.getSelectedElements().length,
					trackCount,
					elementCount,
				};
			},
		},
	];
}
