import { getSourceSpanAtClipTime } from "@/retime";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import {
	isRetimableElement,
	type ElementRef,
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";
import { expandCompoundElement } from "@/timeline/compound-elements";

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

export function buildSelectedElementsMergePlan({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): MergeElementsPlan | null {
	return (
		buildMergeElementsPlan({ tracks, elements }) ??
		buildCompoundElementsPlan({ tracks, elements })
	);
}

export function buildCompoundElementsPlan({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): MergeElementsPlan | null {
	const selected = resolveSelectedTrackElements({ tracks, elements });
	if (!selected) {
		return null;
	}

	const { track, trackId, selectedElements } = selected;
	if (!areSelectedElementsConsecutive({ track, selectedElements })) {
		return null;
	}
	for (let index = 1; index < selectedElements.length; index += 1) {
		const previous = selectedElements[index - 1];
		const current = selectedElements[index];
		const previousEnd = addMediaTime({
			a: previous.startTime,
			b: previous.duration,
		});
		if (previousEnd > current.startTime) {
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
	const compoundElements = selectedElements.flatMap((element) =>
		expandCompoundElement({ element }).map((childElement) => ({
			...childElement,
			startTime: subMediaTime({
				a: childElement.startTime,
				b: firstElement.startTime,
			}),
		})),
	);

	return {
		trackId,
		mergedElement: {
			...firstElement,
			name: buildCompoundName(),
			duration: mergedDuration,
			trimStart: ZERO_MEDIA_TIME,
			trimEnd: ZERO_MEDIA_TIME,
			sourceDuration: mergedDuration,
			animations: undefined,
			compound: {
				elements: compoundElements,
			},
		},
		removedElementIds: selectedElements.slice(1).map((element) => element.id),
	};
}

function resolveSelectedTrackElements({
	tracks,
	elements,
}: {
	tracks: SceneTracks;
	elements: ElementRef[];
}): {
	track: TrackWithElements;
	trackId: string;
	selectedElements: TimelineElement[];
} | null {
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

	return { track, trackId, selectedElements };
}

function areSelectedElementsConsecutive({
	track,
	selectedElements,
}: {
	track: TrackWithElements;
	selectedElements: TimelineElement[];
}): boolean {
	const selectedElementIds = new Set(
		selectedElements.map((element) => element.id),
	);
	const sortedTrackElements = [...track.elements].sort(
		(left, right) => left.startTime - right.startTime,
	);
	const selectedIndices = sortedTrackElements.flatMap((element, index) =>
		selectedElementIds.has(element.id) ? [index] : [],
	);
	if (selectedIndices.length !== selectedElements.length) {
		return false;
	}

	const firstIndex = selectedIndices[0];
	const lastIndex = selectedIndices[selectedIndices.length - 1];
	return lastIndex - firstIndex + 1 === selectedIndices.length;
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

	const entries = Object.entries(value).sort(([leftKey], [rightKey]) =>
		leftKey.localeCompare(rightKey),
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

	const leftBase = stripSplitSuffixes({ name: firstElement.name });
	const rightBase = stripSplitSuffixes({ name: lastElement.name });
	return leftBase === rightBase ? leftBase : firstElement.name;
}

function buildCompoundName(): string {
	return "Compound clip";
}

function stripSplitSuffixes({ name }: { name: string }): string {
	let baseName = name;
	for (;;) {
		const nextName = baseName.replace(/ \((left|right)\)$/, "");
		if (nextName === baseName) {
			return baseName;
		}
		baseName = nextName;
	}
}
