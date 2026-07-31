import type {
	AudioElement,
	AudioTrack,
	EffectElement,
	EffectTrack,
	GraphicTrack,
	OverlayTrack,
	SceneTracks,
	TextTrack,
	TimelineElement,
	TimelineTrack,
	VideoTrack,
} from "@/timeline/types";

export interface OrganizedTracksPlan {
	tracks: SceneTracks;
	changed: boolean;
	elementTrackMap: Map<string, string>;
}

interface TrackLane<TTrack extends TimelineTrack> {
	track: TTrack;
	elements: TimelineElement[];
}

export function buildOrganizedTracksPlan({
	tracks,
}: {
	tracks: SceneTracks;
}): OrganizedTracksPlan {
	const overlay = compactTrackCategory({ tracks: tracks.overlay });
	const audio = compactTrackCategory({ tracks: tracks.audio });
	const elementTrackMap = new Map<string, string>([
		...overlay.elementTrackMap,
		...audio.elementTrackMap,
	]);

	return {
		tracks: {
			...tracks,
			overlay: overlay.tracks,
			audio: audio.tracks,
		},
		changed: overlay.changed || audio.changed,
		elementTrackMap,
	};
}

function compactTrackCategory({ tracks }: { tracks: OverlayTrack[] }): {
	tracks: OverlayTrack[];
	changed: boolean;
	elementTrackMap: Map<string, string>;
};
function compactTrackCategory({ tracks }: { tracks: AudioTrack[] }): {
	tracks: AudioTrack[];
	changed: boolean;
	elementTrackMap: Map<string, string>;
};
function compactTrackCategory({
	tracks,
}: {
	tracks: Array<OverlayTrack | AudioTrack>;
}): {
	tracks: Array<OverlayTrack | AudioTrack>;
	changed: boolean;
	elementTrackMap: Map<string, string>;
} {
	const nextTracks: Array<OverlayTrack | AudioTrack> = [];
	const elementTrackMap = new Map<string, string>();
	let changed = false;
	let currentRun: Array<OverlayTrack | AudioTrack> = [];

	const flushRun = () => {
		if (currentRun.length === 0) return;
		const compacted = compactCompatibleTracks({
			tracks: currentRun,
		});

		for (const [index, lane] of compacted.lanes.entries()) {
			const sourceTrack = currentRun[index];
			if (!sourceTrack) continue;

			nextTracks.push(
				compacted.changed
					? withTrackElements({
							track: sourceTrack,
							elements: lane.elements,
						})
					: sourceTrack,
			);

			for (const element of lane.elements) {
				elementTrackMap.set(element.id, sourceTrack.id);
			}
		}

		changed = changed || compacted.changed;
		currentRun = [];
	};

	for (const track of tracks) {
		const previousTrack = currentRun.at(-1);
		if (
			previousTrack &&
			getTrackOrganizeKey(previousTrack) !== getTrackOrganizeKey(track)
		) {
			flushRun();
		}
		currentRun.push(track);
	}
	flushRun();

	return {
		tracks: changed ? nextTracks : tracks,
		changed,
		elementTrackMap,
	};
}

function compactCompatibleTracks<TTrack extends TimelineTrack>({
	tracks,
}: {
	tracks: TTrack[];
}): {
	lanes: Array<TrackLane<TTrack>>;
	changed: boolean;
} {
	const elementsWithSource = tracks.flatMap((track) =>
		track.elements.map((element) => ({
			element,
			sourceTrackId: track.id,
		})),
	);

	if (elementsWithSource.length === 0) {
		return {
			lanes: tracks.map((track) => ({
				track,
				elements: [...track.elements],
			})),
			changed: false,
		};
	}

	const sortedElements = [...elementsWithSource].sort((first, second) => {
		const timeDelta = first.element.startTime - second.element.startTime;
		if (timeDelta !== 0) return timeDelta;
		return first.element.id.localeCompare(second.element.id);
	});
	const lanes: Array<TrackLane<TTrack>> = [];
	const sourceTrackById = new Map(tracks.map((track) => [track.id, track]));

	for (const { element, sourceTrackId } of sortedElements) {
		let targetLane = lanes.find((lane) =>
			canPlaceElementOnLane({ lane, element }),
		);

		if (!targetLane) {
			const laneTrack =
				tracks[lanes.length] ?? sourceTrackById.get(sourceTrackId);
			if (!laneTrack) continue;
			targetLane = {
				track: laneTrack,
				elements: [],
			};
			lanes.push(targetLane);
		}

		targetLane.elements.push(element);
	}

	const changed =
		lanes.length < tracks.length ||
		lanes.some((lane) =>
			lane.elements.some((element) => {
				const sourceTrack = sourceTrackById.get(lane.track.id);
				return !sourceTrack?.elements.some(
					(sourceElement) => sourceElement.id === element.id,
				);
			}),
		);

	return { lanes, changed };
}

function canPlaceElementOnLane({
	lane,
	element,
}: {
	lane: TrackLane<TimelineTrack>;
	element: TimelineElement;
}): boolean {
	const startTime = element.startTime;
	const endTime = element.startTime + element.duration;
	return lane.elements.every((laneElement) => {
		const laneElementEnd = laneElement.startTime + laneElement.duration;
		return startTime >= laneElementEnd || endTime <= laneElement.startTime;
	});
}

function withTrackElements({
	track,
	elements,
}: {
	track: OverlayTrack | AudioTrack;
	elements: TimelineElement[];
}): OverlayTrack | AudioTrack {
	switch (track.type) {
		case "audio":
			return {
				...track,
				elements: ensureTrackElements({
					elements,
					isElement: isAudioElement,
				}),
			};
		case "video":
			return {
				...track,
				elements: ensureTrackElements({
					elements,
					isElement: isVideoTrackElement,
				}),
			};
		case "text":
			return {
				...track,
				elements: ensureTrackElements({
					elements,
					isElement: isTextTrackElement,
				}),
			};
		case "graphic":
			return {
				...track,
				elements: ensureTrackElements({
					elements,
					isElement: isGraphicTrackElement,
				}),
			};
		case "effect":
			return {
				...track,
				elements: ensureTrackElements({
					elements,
					isElement: isEffectElement,
				}),
			};
	}
}

function getTrackOrganizeKey(track: TimelineTrack): string {
	switch (track.type) {
		case "audio":
			return `${track.type}:muted:${track.muted}`;
		case "video":
			return `${track.type}:muted:${track.muted}:hidden:${track.hidden}`;
		case "text":
		case "graphic":
		case "effect":
			return `${track.type}:hidden:${track.hidden}`;
	}
}

function ensureTrackElements<TElement extends TimelineElement>({
	elements,
	isElement,
}: {
	elements: TimelineElement[];
	isElement: (element: TimelineElement) => element is TElement;
}): TElement[] {
	const typedElements = elements.filter(isElement);
	if (typedElements.length !== elements.length) {
		throw new Error("Organized track received an incompatible element");
	}
	return typedElements;
}

function isAudioElement(element: TimelineElement): element is AudioElement {
	return element.type === "audio";
}

function isVideoTrackElement(
	element: TimelineElement,
): element is VideoTrack["elements"][number] {
	return element.type === "video" || element.type === "image";
}

function isTextTrackElement(
	element: TimelineElement,
): element is TextTrack["elements"][number] {
	return element.type === "text" || element.type === "subtitle";
}

function isGraphicTrackElement(
	element: TimelineElement,
): element is GraphicTrack["elements"][number] {
	return element.type === "sticker" || element.type === "graphic";
}

function isEffectElement(
	element: TimelineElement,
): element is EffectTrack["elements"][number] & EffectElement {
	return element.type === "effect";
}
