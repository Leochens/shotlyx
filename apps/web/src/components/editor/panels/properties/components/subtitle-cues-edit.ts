import type { SubtitleLayerCue } from "@/subtitles/types";

export function applySubtitleCueTextEdits({
	cues,
	texts,
}: {
	cues: readonly SubtitleLayerCue[];
	texts: readonly string[];
}): SubtitleLayerCue[] {
	return cues.map((cue, index) => {
		const nextText = texts[index] ?? cue.text;
		if (nextText === cue.text) return cue;

		return {
			...cue,
			text: nextText,
			tokens: undefined,
		};
	});
}
