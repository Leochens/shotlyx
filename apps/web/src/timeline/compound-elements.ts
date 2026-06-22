import type { TimelineElement } from "./types";
import { addMediaTime, subMediaTime, type MediaTime } from "@/wasm";

export type CompoundTimelineElement = TimelineElement & {
	compound: {
		elements: TimelineElement[];
	};
};

export function isCompoundElement(
	element: TimelineElement,
): element is CompoundTimelineElement {
	return Array.isArray(element.compound?.elements);
}

export function expandCompoundElement({
	element,
}: {
	element: TimelineElement;
}): TimelineElement[] {
	if (!isCompoundElement(element)) {
		return [element];
	}

	const visibleStart = element.trimStart;
	const visibleEnd = addMediaTime({
		a: element.trimStart,
		b: element.duration,
	});

	return element.compound.elements.flatMap((childElement) => {
		const childStart = childElement.startTime;
		const childEnd = addMediaTime({
			a: childElement.startTime,
			b: childElement.duration,
		});
		const overlapStart = maxMediaTime({
			left: childStart,
			right: visibleStart,
		});
		const overlapEnd = minMediaTime({ left: childEnd, right: visibleEnd });

		if (overlapEnd <= overlapStart) {
			return [];
		}

		const leftTrim = subMediaTime({
			a: overlapStart,
			b: childStart,
		});
		const rightTrim = subMediaTime({
			a: childEnd,
			b: overlapEnd,
		});

		return expandCompoundElement({
			element: {
				...childElement,
				startTime: addMediaTime({
					a: element.startTime,
					b: subMediaTime({
						a: overlapStart,
						b: visibleStart,
					}),
				}),
				duration: subMediaTime({
					a: overlapEnd,
					b: overlapStart,
				}),
				trimStart: addMediaTime({
					a: childElement.trimStart,
					b: leftTrim,
				}),
				trimEnd: addMediaTime({
					a: childElement.trimEnd,
					b: rightTrim,
				}),
			} as TimelineElement,
		});
	});
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

function minMediaTime({
	left,
	right,
}: {
	left: MediaTime;
	right: MediaTime;
}): MediaTime {
	return left < right ? left : right;
}
