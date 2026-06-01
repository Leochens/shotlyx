import { getSourceSpanAtClipTime } from "@/retime";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
} from "@/wasm";
import {
	isRetimableElement,
	type ElementRef,
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";

export interface MergeElementsPlan {
	trackId: string;
	mergedElement: TimelineElement;
	removedElementIds: string[];
}

type TrackWithElements = TimelineTrack & { elements: TimelineElement[] };

export function buildMergeElementsPlan({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): MergeElementsPlan | null {
	const uniqueRefs = uniqueElementRefs({ elements });
	if (uniqueRefs.length < 2) {
		return null;
	}

	const trackId = uniqueRefs[0]?.trackId;
	if (!trackId || uniqueRefs.some((ref) => ref.trackId !== trackId)) {
		return null;
	}

	const track = findTrackById({ tracks, trackId });
	if (!track) {
		return null;
	}

	const selectedElementIds = new Set(uniqueRefs.map((ref) => ref.elementId));
	const selectedElements = track.elements
		.filter((element) => selectedElementIds.has(element.id))
		.sort((left, right) => left.startTime - right.startTime);
	if (selectedElements.length !== selectedElementIds.size) {
		return null;
	}

	for (let index = 1; index < selectedElements.length; index += 1) {
		const previous = selectedElements[index - 1];
		const current = selectedElements[index];
		if (!canMergePair({ previous, current })) {
			return null;
		}
	}

	const firstElement = selectedElements[0];
	const lastElement = selectedElements[selectedElements.length - 1];
	if (!firstElement || !lastElement) {
		return null;
	}

	const mergedDuration = subMediaTime({
		a: addMediaTime({
			a: lastElement.startTime,
			b: lastElement.duration,
		}),
		b: firstElement.startTime,
	});

	return {
		trackId,
		mergedElement: {
			...firstElement,
			name: buildMergedName({ elements: selectedElements }),
			duration: mergedDuration,
			trimEnd: lastElement.trimEnd,
		} as TimelineElement,
		removedElementIds: selectedElements.slice(1).map((element) => element.id),
	};
}

function uniqueElementRefs({
	elements,
}: {
	elements: ElementRef[];
}): ElementRef[] {
	const seen = new Set<string>();
	const result: ElementRef[] = [];
	for (const element of elements) {
		const key = `${element.trackId}:${element.elementId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(element);
	}
	return result;
}

function findTrackById({
	tracks,
	trackId,
}: {
	tracks: SceneTracks;
	trackId: string;
}): TrackWithElements | null {
	return (
		[tracks.main, ...tracks.overlay, ...tracks.audio].find(
			(track) => track.id === trackId,
		) ?? null
	);
}

function canMergePair({
	previous,
	current,
}: {
	previous: TimelineElement;
	current: TimelineElement;
}): boolean {
	return (
		previous.type === current.type &&
		!previous.animations &&
		!current.animations &&
		areElementsTimelineAdjacent({ previous, current }) &&
		areElementsSourceAdjacent({ previous, current }) &&
		buildComparableElementKey({ element: previous }) ===
			buildComparableElementKey({ element: current })
	);
}

function areElementsTimelineAdjacent({
	previous,
	current,
}: {
	previous: TimelineElement;
	current: TimelineElement;
}): boolean {
	return (
		addMediaTime({ a: previous.startTime, b: previous.duration }) ===
		current.startTime
	);
}

function areElementsSourceAdjacent({
	previous,
	current,
}: {
	previous: TimelineElement;
	current: TimelineElement;
}): boolean {
	return getElementSourceEnd({ element: previous }) === current.trimStart;
}

function getElementSourceEnd({
	element,
}: {
	element: TimelineElement;
}): MediaTime {
	const retime = isRetimableElement(element) ? element.retime : undefined;
	const sourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: element.duration,
			retime,
		}),
	});
	return addMediaTime({
		a: element.trimStart,
		b: sourceSpan,
	});
}

function buildComparableElementKey({
	element,
}: {
	element: TimelineElement;
}): string {
	const {
		id: _id,
		name: _name,
		startTime: _startTime,
		duration: _duration,
		trimStart: _trimStart,
		trimEnd: _trimEnd,
		animations: _animations,
		...comparable
	} = element;
	return stableStringify(comparable);
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}

	const entries = Object.entries(value).sort(
		([leftKey], [rightKey]) => leftKey.localeCompare(rightKey),
	);
	return `{${entries
		.map(
			([key, entryValue]) =>
				`${JSON.stringify(key)}:${stableStringify(entryValue)}`,
		)
		.join(",")}}`;
}

function buildMergedName({
	elements,
}: {
	elements: TimelineElement[];
}): string {
	const firstElement = elements[0];
	const lastElement = elements[elements.length - 1];
	if (!firstElement || !lastElement) {
		return "";
	}

	const leftBase = stripSplitSuffix({ name: firstElement.name, suffix: "left" });
	const rightBase = stripSplitSuffix({ name: lastElement.name, suffix: "right" });
	return leftBase === rightBase ? leftBase : firstElement.name;
}

function stripSplitSuffix({
	name,
	suffix,
}: {
	name: string;
	suffix: "left" | "right";
}): string {
	const marker = ` (${suffix})`;
	return name.endsWith(marker) ? name.slice(0, -marker.length) : name;
}
