/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Renderer scene duration is already MediaTime ticks; this helper adapts project-level subtitle settings into a transient timeline element shape. */
import type { TCanvasSize, TProjectSubtitles } from "@/project/types";
import type { SubtitleElement } from "@/timeline/types";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm/media-time";

export const DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE = 30;

export function createEmptyProjectSubtitles(): TProjectSubtitles {
	return {
		enabled: true,
		cues: [],
		revealMode: "line",
		lineBreakMode: "page",
		maxCharsPerLine: DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE,
	};
}

export function buildProjectSubtitleElement({
	subtitles,
	canvasSize,
	duration,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	canvasSize: TCanvasSize;
	duration: MediaTime | number;
}): SubtitleElement | null {
	if (!subtitles?.enabled || subtitles.cues.length === 0) return null;

	return {
		id: "project-global-subtitles",
		type: "subtitle",
		name: "全局字幕",
		startTime: 0 as MediaTime,
		duration: duration as MediaTime,
		trimStart: 0 as MediaTime,
		trimEnd: 0 as MediaTime,
		sourceDuration: duration as MediaTime,
		revealMode: subtitles.revealMode,
		params: {
			fontFamily: "Arial",
			fontSize: 4,
			color: "#ffffff",
			textAlign: "center",
			fontWeight: "bold",
			fontStyle: "normal",
			textDecoration: "none",
			letterSpacing: 0,
			lineHeight: 1.2,
			"background.enabled": true,
			"background.color": "#00000099",
			"background.cornerRadius": 8,
			"background.paddingX": 22,
			"background.paddingY": 24,
			"background.offsetX": 0,
			"background.offsetY": 0,
			"transform.positionX": 0,
			"transform.positionY": canvasSize.height * 0.36,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
			blendMode: "normal",
			"subtitle.role": "project-global",
			"subtitle.maxCharsPerLine":
				subtitles.maxCharsPerLine ??
				DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE,
			"subtitle.lineBreakMode": subtitles.lineBreakMode,
			"subtitle.highlightColor": "#93c5fd",
		},
		cues: subtitles.cues,
	};
}

export function cueStartToMediaTime({ seconds }: { seconds: number }): MediaTime {
	return mediaTimeFromSeconds({ seconds });
}
