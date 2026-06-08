const DEFAULT_ELEMENT_OVERSCAN_PX = 1200;

interface VisibleTimelineElement {
	id: string;
	startTime: number;
	duration: number;
}

export function isTimelineElementVisible({
	element,
	scrollLeft,
	viewportWidth,
	timeToPixels,
	overscanPx = DEFAULT_ELEMENT_OVERSCAN_PX,
	pinnedElementIds,
}: {
	element: VisibleTimelineElement;
	scrollLeft: number;
	viewportWidth: number;
	timeToPixels: (time: number) => number;
	overscanPx?: number;
	pinnedElementIds?: ReadonlySet<string> | null;
}): boolean {
	if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
		return true;
	}

	if (pinnedElementIds?.has(element.id)) {
		return true;
	}

	const windowStartPx = Math.max(0, scrollLeft - overscanPx);
	const windowEndPx = scrollLeft + viewportWidth + overscanPx;
	const elementStartPx = timeToPixels(element.startTime);
	const elementEndPx = timeToPixels(element.startTime + element.duration);

	return elementEndPx >= windowStartPx && elementStartPx <= windowEndPx;
}

export function getVisibleTimelineElements<
	TElement extends VisibleTimelineElement,
>({
	elements,
	scrollLeft,
	viewportWidth,
	timeToPixels,
	overscanPx = DEFAULT_ELEMENT_OVERSCAN_PX,
	pinnedElementIds,
	assumeSortedByStartTime = false,
}: {
	elements: readonly TElement[];
	scrollLeft: number;
	viewportWidth: number;
	timeToPixels: (time: number) => number;
	overscanPx?: number;
	pinnedElementIds?: ReadonlySet<string> | null;
	assumeSortedByStartTime?: boolean;
}): readonly TElement[] {
	if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
		return elements;
	}

	const windowStartPx = Math.max(0, scrollLeft - overscanPx);
	const windowEndPx = scrollLeft + viewportWidth + overscanPx;
	const canStopAtWindowEnd = assumeSortedByStartTime;
	const remainingPinnedElementIds =
		pinnedElementIds && pinnedElementIds.size > 0
			? new Set(pinnedElementIds)
			: null;
	const visibleElements: TElement[] = [];

	for (const element of elements) {
		if (pinnedElementIds?.has(element.id)) {
			visibleElements.push(element);
			remainingPinnedElementIds?.delete(element.id);
			continue;
		}

		const elementStartPx = timeToPixels(element.startTime);
		if (
			canStopAtWindowEnd &&
			elementStartPx > windowEndPx &&
			(!remainingPinnedElementIds || remainingPinnedElementIds.size === 0)
		) {
			break;
		}

		const elementEndPx = timeToPixels(element.startTime + element.duration);
		if (elementEndPx >= windowStartPx && elementStartPx <= windowEndPx) {
			visibleElements.push(element);
		}
	}

	return visibleElements;
}
