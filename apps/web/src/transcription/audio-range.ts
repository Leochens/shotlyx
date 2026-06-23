import type { MediaAsset } from "@/media/types";
import type {
	AudioElement,
	ElementRef,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/timeline";
import { canTrackHaveAudio } from "@/timeline/track-capabilities";
import { MEDIA_TIME_TICKS_PER_SECOND } from "@/wasm/timebase";

type MediaTime = number;

export type TranscriptionAudioRangeKind =
	| "timeline"
	| "selection"
	| "element"
	| "track";

export interface TranscriptionAudioRange {
	kind: TranscriptionAudioRangeKind;
	startTime: MediaTime;
	duration: MediaTime;
	label: string;
	elementRef?: ElementRef;
	trackRef?: { trackId: string };
}

export interface TranscriptionAudioElementOption extends TranscriptionAudioRange {
	kind: "element";
	elementRef: ElementRef;
}

export interface TranscriptionAudioTrackOption extends TranscriptionAudioRange {
	kind: "track";
	trackRef: { trackId: string };
}

interface ElementWithTrack {
	element: TimelineElement;
	track: TimelineTrack;
}

type CompoundTimelineElement = TimelineElement & {
	compound: {
		elements: TimelineElement[];
	};
};

export function audioRangeToSeconds({
	range,
}: {
	range: TranscriptionAudioRange;
}): { startTimeSeconds: number; durationSeconds: number } {
	return {
		startTimeSeconds: range.startTime / MEDIA_TIME_TICKS_PER_SECOND,
		durationSeconds: range.duration / MEDIA_TIME_TICKS_PER_SECOND,
	};
}

function canElementHaveAudio(
	element: TimelineElement,
): element is AudioElement | VideoElement {
	return element.type === "audio" || element.type === "video";
}

function hasMediaId(
	element: TimelineElement,
): element is TimelineElement & { mediaId: string } {
	return "mediaId" in element;
}

function isCompoundElement(
	element: TimelineElement,
): element is CompoundTimelineElement {
	return Array.isArray(element.compound?.elements);
}

function expandTranscriptionAudioElement({
	element,
}: {
	element: TimelineElement;
}): TimelineElement[] {
	if (!isCompoundElement(element)) {
		return [element];
	}

	return element.compound.elements.flatMap((childElement) =>
		expandTranscriptionAudioElement({
			element: {
				...childElement,
				startTime: element.startTime + childElement.startTime,
			},
		}),
	);
}

function isElementMuted({ element }: { element: AudioElement | VideoElement }) {
	return element.params.muted === true;
}

function isTimelineElementMuted({ element }: { element: TimelineElement }) {
	return element.params.muted === true;
}

function doesElementHaveEnabledAudio({
	element,
	mediaAsset,
}: {
	element: AudioElement | VideoElement;
	mediaAsset?: Pick<MediaAsset, "hasAudio"> | null;
}): boolean {
	if (element.type === "audio") return true;

	return (
		!!mediaAsset &&
		mediaAsset.hasAudio !== false &&
		element.isSourceAudioEnabled !== false
	);
}

export function getTimelineAudioRange({
	totalDuration,
}: {
	totalDuration: MediaTime;
}): TranscriptionAudioRange {
	return {
		kind: "timeline",
		startTime: 0,
		duration: totalDuration,
		label: "Full timeline mixed audio",
	};
}

export function isElementAudibleForTranscription({
	element,
	track,
	mediaAssets,
}: {
	element: TimelineElement;
	track: TimelineTrack;
	mediaAssets: MediaAsset[];
}): boolean {
	if (element.duration <= 0) return false;
	if (canTrackHaveAudio(track) && track.muted) return false;
	if (isTimelineElementMuted({ element })) return false;

	for (const expandedElement of expandTranscriptionAudioElement({ element })) {
		if (!canElementHaveAudio(expandedElement)) continue;
		if (expandedElement.duration <= 0) continue;
		if (isElementMuted({ element: expandedElement })) continue;

		const mediaAsset = hasMediaId(expandedElement)
			? (mediaAssets.find((asset) => asset.id === expandedElement.mediaId) ??
				null)
			: null;
		if (
			doesElementHaveEnabledAudio({
				element: expandedElement,
				mediaAsset,
			})
		) {
			return true;
		}
	}

	return false;
}

export function getTranscriptionAudioElementOptions({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): TranscriptionAudioElementOption[] {
	const options: TranscriptionAudioElementOption[] = [];
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];

	for (const track of orderedTracks) {
		for (const element of track.elements) {
			if (
				!isElementAudibleForTranscription({
					element,
					track,
					mediaAssets,
				})
			) {
				continue;
			}

			options.push({
				kind: "element",
				startTime: element.startTime,
				duration: element.duration,
				label: element.name || "Audio clip",
				elementRef: { trackId: track.id, elementId: element.id },
			});
		}
	}

	return options;
}

export function getTranscriptionAudioTrackOptions({
	tracks,
	mediaAssets,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
}): TranscriptionAudioTrackOption[] {
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	const options: TranscriptionAudioTrackOption[] = [];

	for (const track of orderedTracks) {
		const audibleElements = track.elements.filter((element) =>
			isElementAudibleForTranscription({
				element,
				track,
				mediaAssets,
			}),
		);
		if (audibleElements.length === 0) continue;

		const startTime = Math.min(
			...audibleElements.map((element) => element.startTime),
		);
		const endTime = Math.max(
			...audibleElements.map(
				(element) => element.startTime + element.duration,
			),
		);
		options.push({
			kind: "track",
			startTime,
			duration: endTime - startTime,
			label: track.name || track.id,
			trackRef: { trackId: track.id },
			...(audibleElements.length === 1
				? {
						elementRef: {
							trackId: track.id,
							elementId: audibleElements[0].id,
						},
					}
				: {}),
		});
	}

	return options;
}

export function resolveSelectedTranscriptionAudioRange({
	selectedElements,
	elementsWithTracks,
	mediaAssets,
}: {
	selectedElements: ElementRef[];
	elementsWithTracks: ElementWithTrack[];
	mediaAssets: MediaAsset[];
}): TranscriptionAudioRange | null {
	const selectedKeys = new Set(
		selectedElements.map((ref) => `${ref.trackId}:${ref.elementId}`),
	);
	const audibleSelected = elementsWithTracks.filter(({ element, track }) => {
		if (!selectedKeys.has(`${track.id}:${element.id}`)) return false;
		return isElementAudibleForTranscription({ element, track, mediaAssets });
	});

	if (audibleSelected.length === 0) {
		return null;
	}

	const startTime = Math.min(
		...audibleSelected.map(({ element }) => element.startTime),
	);
	const endTime = Math.max(
		...audibleSelected.map(({ element }) => element.startTime + element.duration),
	);
	const first = audibleSelected[0];

	if (audibleSelected.length === 1) {
		return {
			kind: "selection",
			startTime,
			duration: endTime - startTime,
			label: first.element.name || "Selected clip mixed audio",
			elementRef: {
				trackId: first.track.id,
				elementId: first.element.id,
			},
		};
	}

	return {
		kind: "selection",
		startTime,
		duration: endTime - startTime,
		label: `Selected ${audibleSelected.length} clips mixed audio`,
	};
}
