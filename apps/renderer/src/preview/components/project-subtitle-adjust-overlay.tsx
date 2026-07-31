"use client";

import { useRef } from "react";
import { usePropertiesStore } from "@/components/editor/panels/properties/stores/properties-store";
import { useEditor } from "@/editor/use-editor";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { usePreviewViewport } from "@/preview/components/preview-viewport";
import type {
	ProjectSubtitleStyleParams,
	TProjectSubtitles,
} from "@/project/types";
import {
	buildDefaultProjectSubtitleStyleParams,
	buildProjectSubtitleElements,
	createEmptyProjectSubtitles,
} from "@/subtitles/project-subtitles";
import type { SceneTracks } from "@/timeline";
import {
	maxMediaTime,
	mediaTime,
	mediaTimeFromSeconds,
	type MediaTime,
} from "@/wasm/media-time";

const EDIT_TRACK_ID = "__project_global_subtitles_edit_track__";
const MIN_SELECTION_WIDTH = 44;
const MIN_SELECTION_HEIGHT = 32;

interface DragSession {
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startPositionX: number;
	startPositionY: number;
	latestPositionX: number;
	latestPositionY: number;
	hasMoved: boolean;
}

function getSubtitleCueDuration({
	subtitles,
}: {
	subtitles: TProjectSubtitles;
}): MediaTime {
	let maxCueEndSeconds = 0;
	for (const track of subtitles.tracks ?? []) {
		for (const cue of track.cues) {
			maxCueEndSeconds = Math.max(
				maxCueEndSeconds,
				cue.startTime + cue.duration,
			);
		}
	}
	for (const cue of subtitles.cues ?? []) {
		maxCueEndSeconds = Math.max(maxCueEndSeconds, cue.startTime + cue.duration);
	}
	return mediaTimeFromSeconds({ seconds: maxCueEndSeconds });
}

function readSubtitlePosition({
	canvasSize,
	subtitles,
}: {
	canvasSize: { width: number; height: number };
	subtitles: TProjectSubtitles;
}) {
	const defaults = buildDefaultProjectSubtitleStyleParams({ canvasSize });
	const styleParams = subtitles.styleParams ?? {};
	const positionX = styleParams["transform.positionX"];
	const positionY = styleParams["transform.positionY"];
	return {
		x:
			typeof positionX === "number"
				? positionX
				: Number(defaults["transform.positionX"] ?? 0),
		y:
			typeof positionY === "number"
				? positionY
				: Number(defaults["transform.positionY"] ?? 0),
	};
}

function buildEditSceneTracks({
	subtitles,
	canvasSize,
	duration,
	timelineTracks,
}: {
	subtitles: TProjectSubtitles;
	canvasSize: { width: number; height: number };
	duration: MediaTime;
	timelineTracks: SceneTracks;
}): SceneTracks {
	return {
		overlay: [
			{
				id: EDIT_TRACK_ID,
				name: "Global subtitles",
				type: "text",
				hidden: false,
				elements: buildProjectSubtitleElements({
					subtitles,
					canvasSize,
					duration,
					timelineTracks,
				}),
			},
		],
		main: {
			id: "__project_global_subtitles_edit_main__",
			name: "Main",
			type: "video",
			elements: [],
			muted: false,
			hidden: true,
		},
		audio: [],
	};
}

function roundPosition(value: number): number {
	return Math.round(value);
}

export function ProjectSubtitleAdjustOverlay() {
	const editor = useEditor();
	const viewport = usePreviewViewport();
	const inspectorFocus = usePropertiesStore((state) => state.inspectorFocus);
	const selectedElements = useEditor((e) => e.selection.getSelectedElements());
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const subtitles = useEditor(
		(e) => e.project.getActive().settings.subtitles ?? null,
	);
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const timelineTracks = useEditor((e) => e.scenes.getActiveScene().tracks);
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const dragSessionRef = useRef<DragSession | null>(null);

	if (
		inspectorFocus !== "project-subtitles" ||
		selectedElements.length > 0 ||
		!subtitles?.enabled
	) {
		return null;
	}

	const duration = maxMediaTime({
		a: maxMediaTime({
			a: editor.timeline.getTotalDuration(),
			b: getSubtitleCueDuration({ subtitles }),
		}),
		b: maxMediaTime({
			a: mediaTime({ ticks: currentTime + 1 }),
			b: mediaTime({ ticks: 1 }),
		}),
	});
	const [selectedWithBounds] = getVisibleElementsWithBounds({
		tracks: buildEditSceneTracks({
			subtitles,
			canvasSize,
			duration,
			timelineTracks,
		}),
		currentTime,
		canvasSize,
		mediaAssets,
	});

	if (!selectedWithBounds) return null;

	const { bounds } = selectedWithBounds;
	const displayScale = viewport.getDisplayScale();
	const center = viewport.canvasToOverlay({
		canvasX: bounds.cx,
		canvasY: bounds.cy,
	});
	const width = Math.max(
		MIN_SELECTION_WIDTH,
		Math.abs(bounds.width) * displayScale.x,
	);
	const height = Math.max(
		MIN_SELECTION_HEIGHT,
		Math.abs(bounds.height) * displayScale.y,
	);

	const updatePosition = ({
		positionX,
		positionY,
		pushHistory,
	}: {
		positionX: number;
		positionY: number;
		pushHistory: boolean;
	}) => {
		const currentSubtitles =
			editor.project.getActive().settings.subtitles ??
			createEmptyProjectSubtitles();
		const styleParams: ProjectSubtitleStyleParams = {
			...(currentSubtitles.styleParams ?? {}),
			"transform.positionX": roundPosition(positionX),
			"transform.positionY": roundPosition(positionY),
		};

		void editor.project.updateSettings({
			settings: {
				subtitles: {
					...currentSubtitles,
					styleParams,
					updatedAt: new Date().toISOString(),
				},
			},
			pushHistory,
		});
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const position = readSubtitlePosition({ canvasSize, subtitles });
		dragSessionRef.current = {
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startPositionX: position.x,
			startPositionY: position.y,
			latestPositionX: position.x,
			latestPositionY: position.y,
			hasMoved: false,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
		const session = dragSessionRef.current;
		if (!session) return;
		event.preventDefault();
		event.stopPropagation();
		const logicalDelta = viewport.screenPixelsToLogicalThreshold({
			screenPixels: event.clientX - session.startClientX,
		});
		const logicalDeltaY = viewport.screenPixelsToLogicalThreshold({
			screenPixels: event.clientY - session.startClientY,
		}).y;
		const nextPositionX = session.startPositionX + logicalDelta.x;
		const nextPositionY = session.startPositionY + logicalDeltaY;
		session.latestPositionX = nextPositionX;
		session.latestPositionY = nextPositionY;
		session.hasMoved = true;
		updatePosition({
			positionX: nextPositionX,
			positionY: nextPositionY,
			pushHistory: false,
		});
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
		const session = dragSessionRef.current;
		if (!session) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.currentTarget.hasPointerCapture(session.pointerId)) {
			event.currentTarget.releasePointerCapture(session.pointerId);
		}
		dragSessionRef.current = null;
		if (!session.hasMoved) return;
		updatePosition({
			positionX: session.latestPositionX,
			positionY: session.latestPositionY,
			pushHistory: true,
		});
	};

	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden">
			<button
				type="button"
				data-testid="project-subtitle-selection-box"
				aria-label="拖动全局字幕"
				className="pointer-events-auto absolute cursor-move rounded-md border border-cyan-200/60 bg-cyan-300/[0.08] p-0 shadow-[0_0_0_1px_rgba(8,145,178,0.18),0_0_18px_rgba(34,211,238,0.14)] transition-colors hover:border-cyan-100/75 hover:bg-cyan-300/[0.12] focus-visible:outline-2 focus-visible:outline-cyan-200/80"
				style={{
					left: center.x,
					top: center.y,
					width,
					height,
					transform: `translate(-50%, -50%) rotate(${bounds.rotation}deg)`,
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onDragStart={(event) => event.preventDefault()}
			/>
		</div>
	);
}
