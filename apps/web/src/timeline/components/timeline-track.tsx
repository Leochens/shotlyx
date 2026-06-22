"use client";

import { useCallback, useMemo, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import {
	createTimelineElementReference,
	createTimelineTrackReference,
} from "@/agent/context/resolve-references";
import { useAgentContextStore } from "@/agent/context/store";
import { useElementSelection } from "@/timeline/hooks/element/use-element-selection";
import { TimelineElement } from "./timeline-element";
import type { TimelineTrack } from "@/timeline";
import type { TimelineElement as TimelineElementType } from "@/timeline";
import { TIMELINE_LAYERS } from "./layers";
import type { ElementDragView } from "@/timeline";
import { getVisibleTimelineElements } from "./visible-elements";
import { timelineTimeToPixels } from "@/timeline/pixel-utils";

interface RollingBoundaryHover {
	leftElementId: string;
	rightElementId: string;
}

export function getRollingBoundaryForHandle({
	elements,
	element,
	side,
}: {
	elements: TimelineElementType[];
	element: TimelineElementType;
	side: "left" | "right";
}): RollingBoundaryHover | null {
	if (side === "right") {
		const elementEnd = element.startTime + element.duration;
		const rightElement = elements.find(
			(candidate) => candidate.startTime === elementEnd,
		);
		if (!rightElement) return null;
		return {
			leftElementId: element.id,
			rightElementId: rightElement.id,
		};
	}

	const leftElement = elements.find(
		(candidate) => candidate.startTime + candidate.duration === element.startTime,
	);
	if (!leftElement) return null;
	return {
		leftElementId: leftElement.id,
		rightElementId: element.id,
	};
}

interface TimelineTrackContentProps {
	track: TimelineTrack;
	zoomLevel: number;
	scrollLeft: number;
	viewportWidth: number;
	dragView: ElementDragView;
	onResizeStart: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
		side: "left" | "right";
	}) => void;
	onElementMouseDown: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onElementClick: (params: {
		event: React.MouseEvent;
		element: TimelineElementType;
		track: TimelineTrack;
	}) => void;
	onTrackMouseDown?: (event: React.MouseEvent) => void;
	onTrackMouseUp?: (event: React.MouseEvent) => void;
	shouldIgnoreClick?: () => boolean;
	targetElementId?: string | null;
}

export function TimelineTrackContent({
	track,
	zoomLevel,
	scrollLeft,
	viewportWidth,
	dragView,
	onResizeStart,
	onElementMouseDown,
	onElementClick,
	onTrackMouseDown,
	onTrackMouseUp,
	shouldIgnoreClick,
	targetElementId = null,
}: TimelineTrackContentProps) {
	const { isElementSelected } = useElementSelection();
	const editor = useEditor();
	const { pointSelectEnabled, addReference } = useAgentContextStore();
	const [rollingBoundaryHover, setRollingBoundaryHover] =
		useState<RollingBoundaryHover | null>(null);
	const pinnedElementIds =
		dragView.kind === "dragging"
			? (dragView.pinnedElementIdsByTrackId.get(track.id) ?? null)
			: null;
	const visibleElements = useMemo(
		() =>
			getVisibleTimelineElements<TimelineElementType>({
				elements: track.elements,
				scrollLeft,
				viewportWidth,
				timeToPixels: (time) => timelineTimeToPixels({ time, zoomLevel }),
				pinnedElementIds,
				assumeSortedByStartTime: true,
			}),
		[track.elements, scrollLeft, viewportWidth, zoomLevel, pinnedElementIds],
	);

	const addTrackReference = () => {
		if (!pointSelectEnabled) return;
		const reference = createTimelineTrackReference({
			editor,
			trackId: track.id,
			source: "point-select",
		});
		if (reference) addReference(reference);
	};

	const addElementReference = (element: TimelineElementType) => {
		if (!pointSelectEnabled) return;
		const reference = createTimelineElementReference({
			editor,
			trackId: track.id,
			elementId: element.id,
			source: "point-select",
		});
		if (reference) addReference(reference);
	};

	const handleResizeHandleHoverChange = useCallback(
		({
			element,
			side,
			isHovered,
		}: {
			element: TimelineElementType;
			side: "left" | "right";
			isHovered: boolean;
		}) => {
			const boundary = getRollingBoundaryForHandle({
				elements: track.elements,
				element,
				side,
			});
			if (isHovered) {
				setRollingBoundaryHover(boundary);
				return;
			}
			setRollingBoundaryHover((current) =>
				current &&
				boundary &&
				current.leftElementId === boundary.leftElementId &&
				current.rightElementId === boundary.rightElementId
					? null
					: current,
			);
		},
		[track.elements],
	);

	return (
		<div
			className={
				pointSelectEnabled
					? "relative size-full cursor-crosshair rounded-sm ring-1 ring-transparent hover:ring-amber-400/40"
					: "relative size-full"
			}
		>
			<button
				type="button"
				className="absolute inset-0 m-0 size-full appearance-none border-0 bg-transparent p-0"
				aria-label={`Select ${track.name} track`}
				onMouseUp={(event) => {
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
					if (event.button === 0) addTrackReference();
				}}
				onMouseDown={(event) => {
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			/>
			{/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- spatial gesture surface; the wrapping <button> handles keyboard track selection, this <div> only forwards background clicks for box-select / deselect. */}
			<div
				className="relative h-full min-w-full"
				style={{ zIndex: TIMELINE_LAYERS.trackContent }}
				onMouseUp={(event) => {
					if (event.target !== event.currentTarget) return;
					if (shouldIgnoreClick?.()) return;
					onTrackMouseUp?.(event);
					if (event.button === 0) addTrackReference();
				}}
				onMouseDown={(event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					onTrackMouseDown?.(event);
				}}
			>
				{track.elements.length === 0 ? (
					<div className="text-muted-foreground border-muted/30 pointer-events-none flex size-full items-center justify-center rounded-sm border-2 border-dashed text-xs" />
				) : (
					visibleElements.map((element) => {
						const isSelected = isElementSelected({
							trackId: track.id,
							elementId: element.id,
						});

						return (
							<TimelineElement
								key={element.id}
								element={element}
								track={track}
								zoomLevel={zoomLevel}
								isSelected={isSelected}
								onResizeStart={({ event, element, side }) =>
									onResizeStart({ event, element, track, side })
								}
								onResizeHandleHoverChange={handleResizeHandleHoverChange}
								isLeftResizeHighlighted={
									rollingBoundaryHover?.rightElementId === element.id
								}
								isRightResizeHighlighted={
									rollingBoundaryHover?.leftElementId === element.id
								}
								onElementMouseDown={({ event, element }) =>
									onElementMouseDown({ event, element, track })
								}
								onElementClick={({ event, element }) => {
									onElementClick({ event, element, track });
									addElementReference(element);
								}}
								dragView={dragView}
								isDropTarget={element.id === targetElementId}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}
