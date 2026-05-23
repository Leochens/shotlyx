import { clampAnimationsToDuration, splitAnimationsAtTime } from "@/animation";
import { getSourceSpanAtClipTime } from "@/retime";
import {
	type SceneTracks,
	type TimelineElement,
	type TimelineTrack,
	isRetimableElement,
} from "@/timeline";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	type MediaTime,
	roundMediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type { SilenceCutRange, SilenceCutTarget } from "./types";

type TrackWithElements = TimelineTrack & { elements: TimelineElement[] };

interface NormalizedCutRange {
	startTime: MediaTime;
	endTime: MediaTime;
}

export function buildSilenceCutTracks({
	tracks,
	targets,
}: {
	tracks: SceneTracks;
	targets: SilenceCutTarget[];
}): SceneTracks {
	if (targets.length === 0) {
		return tracks;
	}

	const targetMap = buildTargetMap({ tracks, targets });
	if (targetMap.size === 0) {
		return tracks;
	}

	return {
		overlay: tracks.overlay.map((track) =>
			buildSilenceCutTrack({ track, targetMap }),
		),
		main: buildSilenceCutTrack({ track: tracks.main, targetMap }),
		audio: tracks.audio.map((track) =>
			buildSilenceCutTrack({ track, targetMap }),
		),
	};
}

function buildSilenceCutTrack<TTrack extends TrackWithElements>({
	track,
	targetMap,
}: {
	track: TTrack;
	targetMap: Map<string, NormalizedCutRange[]>;
}): TTrack {
	const trackCutRanges = normalizeRanges({
		ranges: track.elements.flatMap(
			(element) =>
				targetMap.get(
					targetKey({ trackId: track.id, elementId: element.id }),
				) ?? [],
		),
	});

	if (trackCutRanges.length === 0) {
		return track;
	}

	const elements = track.elements
		.flatMap((element) => {
			const cutRanges =
				targetMap.get(
					targetKey({ trackId: track.id, elementId: element.id }),
				) ?? [];
			if (cutRanges.length === 0) {
				return [
					shiftElementStart({
						element,
						trackCutRanges,
					}),
				];
			}

			return cutElementByRanges({
				element,
				cutRanges,
				trackCutRanges,
			});
		})
		.sort((left, right) => left.startTime - right.startTime);

	return { ...track, elements } as TTrack;
}

function buildTargetMap({
	tracks,
	targets,
}: {
	tracks: SceneTracks;
	targets: SilenceCutTarget[];
}): Map<string, NormalizedCutRange[]> {
	const result = new Map<string, NormalizedCutRange[]>();
	const targetsByKey = new Map<string, SilenceCutTarget[]>();
	for (const target of targets) {
		const key = targetKey(target);
		targetsByKey.set(key, [...(targetsByKey.get(key) ?? []), target]);
	}

	for (const track of [tracks.main, ...tracks.overlay, ...tracks.audio]) {
		for (const element of track.elements) {
			const key = targetKey({ trackId: track.id, elementId: element.id });
			const matchingTargets = targetsByKey.get(key);
			if (!matchingTargets) {
				continue;
			}

			const elementStart = element.startTime;
			const elementEnd = addMediaTime({
				a: element.startTime,
				b: element.duration,
			});
			const ranges = normalizeRanges({
				ranges: matchingTargets.flatMap((target) =>
					target.ranges.map((range) => ({
						startTime: maxMediaTime({
							left: range.startTime,
							right: elementStart,
						}),
						endTime: minMediaTime({
							left: range.endTime,
							right: elementEnd,
						}),
					})),
				),
			});

			if (ranges.length > 0) {
				result.set(key, ranges);
			}
		}
	}

	return result;
}

function cutElementByRanges({
	element,
	cutRanges,
	trackCutRanges,
}: {
	element: TimelineElement;
	cutRanges: NormalizedCutRange[];
	trackCutRanges: NormalizedCutRange[];
}): TimelineElement[] {
	const elementEnd = addMediaTime({
		a: element.startTime,
		b: element.duration,
	});
	const keepRanges: NormalizedCutRange[] = [];
	let cursor = element.startTime;

	for (const cutRange of cutRanges) {
		if (cutRange.startTime > cursor) {
			keepRanges.push({
				startTime: cursor,
				endTime: cutRange.startTime,
			});
		}
		cursor = maxMediaTime({ left: cursor, right: cutRange.endTime });
	}

	if (cursor < elementEnd) {
		keepRanges.push({
			startTime: cursor,
			endTime: elementEnd,
		});
	}

	return keepRanges.map((keepRange, index) =>
		buildElementSlice({
			element,
			keepRange,
			trackCutRanges,
			shouldKeepOriginalId: index === 0,
		}),
	);
}

function buildElementSlice({
	element,
	keepRange,
	trackCutRanges,
	shouldKeepOriginalId,
}: {
	element: TimelineElement;
	keepRange: NormalizedCutRange;
	trackCutRanges: NormalizedCutRange[];
	shouldKeepOriginalId: boolean;
}): TimelineElement {
	const localStart = subMediaTime({
		a: keepRange.startTime,
		b: element.startTime,
	});
	const localEnd = subMediaTime({
		a: keepRange.endTime,
		b: element.startTime,
	});
	const duration = subMediaTime({
		a: keepRange.endTime,
		b: keepRange.startTime,
	});
	const retime = isRetimableElement(element) ? element.retime : undefined;
	const totalSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: element.duration,
			retime,
		}),
	});
	const leftSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: localStart,
			retime,
		}),
	});
	const rightSourceSpan = subMediaTime({
		a: totalSourceSpan,
		b: roundMediaTime({
			time: getSourceSpanAtClipTime({
				clipTime: localEnd,
				retime,
			}),
		}),
	});

	return {
		...element,
		id: shouldKeepOriginalId ? element.id : generateUUID(),
		startTime: shiftTimeLeft({
			time: keepRange.startTime,
			trackCutRanges,
		}),
		duration,
		trimStart: addMediaTime({
			a: element.trimStart,
			b: leftSourceSpan,
		}),
		trimEnd: addMediaTime({
			a: element.trimEnd,
			b: rightSourceSpan,
		}),
		animations: cropAnimations({
			animations: element.animations,
			startOffset: localStart,
			duration,
		}),
	} as TimelineElement;
}

function shiftElementStart({
	element,
	trackCutRanges,
}: {
	element: TimelineElement;
	trackCutRanges: NormalizedCutRange[];
}): TimelineElement {
	const startTime = shiftTimeLeft({
		time: element.startTime,
		trackCutRanges,
	});
	if (startTime === element.startTime) {
		return element;
	}
	return { ...element, startTime };
}

function shiftTimeLeft({
	time,
	trackCutRanges,
}: {
	time: MediaTime;
	trackCutRanges: NormalizedCutRange[];
}): MediaTime {
	const shift = trackCutRanges.reduce((total, range) => {
		if (range.endTime > time) {
			return total;
		}
		return total + (range.endTime - range.startTime);
	}, 0);

	if (shift === 0) {
		return time;
	}

	return subMediaTime({
		a: time,
		b: roundMediaTime({ time: shift }),
	});
}

function cropAnimations({
	animations,
	startOffset,
	duration,
}: {
	animations: TimelineElement["animations"];
	startOffset: MediaTime;
	duration: MediaTime;
}): TimelineElement["animations"] {
	const shiftedAnimations =
		startOffset > ZERO_MEDIA_TIME
			? splitAnimationsAtTime({
					animations,
					splitTime: startOffset,
					shouldIncludeSplitBoundary: true,
				}).rightAnimations
			: animations;

	return clampAnimationsToDuration({
		animations: shiftedAnimations,
		duration,
	});
}

function normalizeRanges({
	ranges,
}: {
	ranges: SilenceCutRange[];
}): NormalizedCutRange[] {
	const sortedRanges = ranges
		.filter((range) => range.endTime > range.startTime)
		.sort((left, right) => left.startTime - right.startTime);

	const normalized: NormalizedCutRange[] = [];
	for (const range of sortedRanges) {
		const previous = normalized[normalized.length - 1];
		if (previous && range.startTime <= previous.endTime) {
			previous.endTime = maxMediaTime({
				left: previous.endTime,
				right: range.endTime,
			});
			continue;
		}
		normalized.push({ ...range });
	}

	return normalized;
}

function targetKey({
	trackId,
	elementId,
}: {
	trackId: string;
	elementId: string;
}): string {
	return `${trackId}:${elementId}`;
}

function minMediaTime({
	left,
	right,
}: {
	left: MediaTime;
	right: MediaTime;
}): MediaTime {
	return left < right ? left : right;
}

function maxMediaTime({
	left,
	right,
}: {
	left: MediaTime;
	right: MediaTime;
}): MediaTime {
	return left > right ? left : right;
}
