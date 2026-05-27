import type { ParamValues } from "@/params";
import type { GraphicElement, SceneTracks } from "@/timeline/types";

interface NumericOpacityKey {
	time: number;
	value: number;
	segmentToNext?: string;
}

export function getShotlyxMGTrackZIndexMap({
	tracks,
}: {
	tracks: SceneTracks;
}): Map<string, number> {
	const visibleTracksTopToBottom = [
		...tracks.overlay.filter((track) => !("hidden" in track && track.hidden)),
		...(!tracks.main.hidden ? [tracks.main] : []),
	];
	return new Map(
		visibleTracksTopToBottom.map((track, index) => [
			track.id,
			visibleTracksTopToBottom.length - index,
		]),
	);
}

function readOpacity({ params }: { params: ParamValues }): number {
	const value = params.opacity;
	return typeof value === "number" ? value : 1;
}

function resolveLocalTime({
	currentTime,
	element,
}: {
	currentTime: number;
	element: GraphicElement;
}): number {
	const localTime = currentTime - element.startTime;
	if (localTime <= 0) return 0;
	if (localTime >= element.duration) return element.duration;
	return localTime;
}

function isNumericOpacityKey(value: unknown): value is NumericOpacityKey {
	return (
		typeof value === "object" &&
		value !== null &&
		"time" in value &&
		typeof value.time === "number" &&
		"value" in value &&
		typeof value.value === "number"
	);
}

export function resolveShotlyxMGPreviewOpacity({
	element,
	currentTime,
}: {
	element: GraphicElement;
	currentTime: number;
}): number {
	const baseOpacity = readOpacity({ params: element.params });
	const channel = element.animations?.opacity;
	const keys =
		channel &&
		typeof channel === "object" &&
		"keys" in channel &&
		Array.isArray(channel.keys)
			? (channel.keys as unknown[])
					.filter(isNumericOpacityKey)
					.sort((left, right) => Number(left.time) - Number(right.time))
			: [];
	if (keys.length === 0) return baseOpacity;

	const localTime = resolveLocalTime({ currentTime, element });
	const firstKey = keys[0];
	const lastKey = keys[keys.length - 1];
	if (!firstKey || !lastKey) return baseOpacity;
	if (localTime <= Number(firstKey.time)) return firstKey.value;
	if (localTime >= Number(lastKey.time)) return lastKey.value;

	for (let index = 0; index < keys.length - 1; index += 1) {
		const left = keys[index];
		const right = keys[index + 1];
		if (!left || !right) continue;
		const leftTime = Number(left.time);
		const rightTime = Number(right.time);
		if (localTime < leftTime || localTime > rightTime) continue;
		if (left.segmentToNext === "hold" || rightTime <= leftTime) {
			return left.value;
		}
		const progress = (localTime - leftTime) / (rightTime - leftTime);
		return left.value + (right.value - left.value) * progress;
	}
	return baseOpacity;
}
