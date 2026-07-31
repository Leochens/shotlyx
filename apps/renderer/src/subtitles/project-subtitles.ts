/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Renderer scene duration is already MediaTime ticks; this helper adapts project-level subtitle settings into a transient timeline element shape. */
import type {
	TCanvasSize,
	ProjectSubtitleStyleParams,
	TProjectSubtitleTrack,
	TProjectSubtitles,
} from "@/project/types";
import type { SceneTracks, SubtitleElement } from "@/timeline/types";
import type { SubtitleLayerCue } from "@/subtitles/types";
import { getTimelineSubtitleTrack } from "@/subtitles/timing-bindings";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm/media-time";

export const DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE = 30;
const PROJECT_SUBTITLE_STACK_OFFSET_RATIO = 0.07;

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
		return subtitles.tracks.filter(
			(track) => track.cues.length > 0 && track.renderEnabled !== false,
		);
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

function getCueStartSeconds({ cue }: { cue: SubtitleLayerCue }): number {
	return cue.startTime;
}

function getCueEndSeconds({ cue }: { cue: SubtitleLayerCue }): number {
	return cue.startTime + cue.duration;
}

function getSubtitleTrackStartSeconds({
	track,
}: {
	track: TProjectSubtitleTrack;
}): number {
	return Math.min(...track.cues.map((cue) => getCueStartSeconds({ cue })));
}

function getSubtitleTrackEndSeconds({
	track,
}: {
	track: TProjectSubtitleTrack;
}): number {
	return Math.max(...track.cues.map((cue) => getCueEndSeconds({ cue })));
}

function shiftProjectSubtitleCue({
	cue,
	offsetSeconds,
}: {
	cue: SubtitleLayerCue;
	offsetSeconds: number;
}): SubtitleLayerCue {
	if (offsetSeconds === 0) return cue;
	return {
		...cue,
		startTime: cue.startTime + offsetSeconds,
		tokens: cue.tokens?.map((token) => ({
			...token,
			startTime: token.startTime + offsetSeconds,
		})),
	};
}

function getElementRelativeSubtitleTrack({
	track,
}: {
	track: TProjectSubtitleTrack;
}): {
	startTimeSeconds: number;
	durationSeconds: number;
	cues: SubtitleLayerCue[];
} {
	const startTimeSeconds = getSubtitleTrackStartSeconds({ track });
	const endTimeSeconds = getSubtitleTrackEndSeconds({ track });
	return {
		startTimeSeconds,
		durationSeconds: Math.max(0, endTimeSeconds - startTimeSeconds),
		cues: track.cues.map((cue) =>
			shiftProjectSubtitleCue({
				cue,
				offsetSeconds: -startTimeSeconds,
			}),
		),
	};
}

export function buildDefaultProjectSubtitleStyleParams({
	canvasSize,
}: {
	canvasSize: TCanvasSize;
}): ProjectSubtitleStyleParams {
	return {
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
		"subtitle.highlightColor": "#93c5fd",
	};
}

export function buildProjectSubtitleElements({
	subtitles,
	canvasSize,
	duration,
	timelineTracks,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	canvasSize: TCanvasSize;
	duration: MediaTime | number;
	timelineTracks?: SceneTracks | null;
}): SubtitleElement[] {
	if (!subtitles?.enabled) return [];

	const tracks = getRenderableSubtitleTracks({ subtitles });
	if (tracks.length === 0) return [];

	const defaultStyleParams = buildDefaultProjectSubtitleStyleParams({
		canvasSize,
	});
	const styleParams = subtitles.styleParams ?? {};
	const requestedPositionY = styleParams["transform.positionY"];
	const basePositionY =
		typeof requestedPositionY === "number"
			? requestedPositionY
			: Number(defaultStyleParams["transform.positionY"]);

	return tracks.map((storedTrack, trackIndex) => {
		const track = getTimelineSubtitleTrack({
			track: storedTrack,
			tracks: timelineTracks,
		});
		const relativeTrack = getElementRelativeSubtitleTrack({ track });
		const elementStartTime = mediaTimeFromSeconds({
			seconds: relativeTrack.startTimeSeconds,
		});
		const requestedDurationSeconds = mediaTimeToSeconds({
			time: duration as MediaTime,
		});
		const elementDuration = mediaTimeFromSeconds({
			seconds: Math.max(
				0,
				Math.max(
					relativeTrack.durationSeconds,
					requestedDurationSeconds - relativeTrack.startTimeSeconds,
				),
			),
		});
		const stackOffset =
			trackIndex * canvasSize.height * PROJECT_SUBTITLE_STACK_OFFSET_RATIO;
		return {
			id: `project-global-subtitles-${track.id}`,
			type: "subtitle",
			name: track.label,
			startTime: elementStartTime,
			duration: elementDuration,
			trimStart: 0 as MediaTime,
			trimEnd: 0 as MediaTime,
			sourceDuration: elementDuration,
			revealMode: subtitles.revealMode,
			params: {
				...defaultStyleParams,
				...styleParams,
				"transform.positionY": basePositionY - stackOffset,
				"subtitle.role": "project-global",
				"subtitle.maxCharsPerLine":
					subtitles.maxCharsPerLine ??
					DEFAULT_PROJECT_SUBTITLE_MAX_CHARS_PER_LINE,
				"subtitle.lineBreakMode": subtitles.lineBreakMode,
			},
			cues: relativeTrack.cues,
		};
	});
}

export function buildProjectSubtitleElement({
	subtitles,
	canvasSize,
	duration,
	timelineTracks,
}: {
	subtitles: TProjectSubtitles | null | undefined;
	canvasSize: TCanvasSize;
	duration: MediaTime | number;
	timelineTracks?: SceneTracks | null;
}): SubtitleElement | null {
	return (
		buildProjectSubtitleElements({
			subtitles,
			canvasSize,
			duration,
			timelineTracks,
		})[0] ?? null
	);
}

export function cueStartToMediaTime({
	seconds,
}: {
	seconds: number;
}): MediaTime {
	return mediaTimeFromSeconds({ seconds });
}
