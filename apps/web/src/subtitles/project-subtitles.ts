/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Renderer scene duration is already MediaTime ticks; this helper adapts project-level subtitle settings into a transient timeline element shape. */
import type {
	TCanvasSize,
	TProjectSubtitleTrack,
	TProjectSubtitles,
} from "@/project/types";
import type { SubtitleElement } from "@/timeline/types";
import { mediaTimeFromSeconds, type MediaTime } from "@/wasm/media-time";

export const DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE = 30;

export function createEmptyProjectSubtitles(): TProjectSubtitles {
	return {
		enabled: true,
		cues: [],
		tracks: [],
		revealMode: "line",
		lineBreakMode: "page",
		maxCharsPerLine: DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE,
	};
}

function getRenderableSubtitleTracks({
	subtitles,
}: {
	subtitles: TProjectSubtitles;
}): TProjectSubtitleTrack[] {
	if (subtitles.tracks && subtitles.tracks.length > 0) {
		return subtitles.tracks.filter((track) => track.cues.length > 0);
	}
	if (subtitles.cues.length === 0) return [];
	return [
		{
			id: "global",
			label: "全局字幕",
			cues: subtitles.cues,
			...(subtitles.assetId
				? {
						assetId: subtitles.assetId,
						...(subtitles.assetName ? { assetName: subtitles.assetName } : {}),
					}
				: {}),
		},
	];
}

export function buildProjectSubtitleElements({
	subtitles,
	canvasSize,
	duration,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	canvasSize: TCanvasSize;
	duration: MediaTime | number;
}): SubtitleElement[] {
	if (!subtitles?.enabled) return [];

	const tracks = getRenderableSubtitleTracks({ subtitles });
	if (tracks.length === 0) return [];

	return tracks.map((track, trackIndex) => ({
		id: `project-global-subtitles-${track.id}`,
		type: "subtitle",
		name: track.label,
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
			"transform.positionY":
				canvasSize.height * 0.36 - trackIndex * canvasSize.height * 0.07,
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
		cues: track.cues,
	}));
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
	return (
		buildProjectSubtitleElements({
			subtitles,
			canvasSize,
			duration,
		})[0] ?? null
	);
}

export function cueStartToMediaTime({ seconds }: { seconds: number }): MediaTime {
	return mediaTimeFromSeconds({ seconds });
}
