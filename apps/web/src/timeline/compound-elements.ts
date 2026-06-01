import type { TimelineElement } from "./types";
import { addMediaTime } from "@/wasm";

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

	return element.compound.elements.flatMap((childElement) =>
		expandCompoundElement({
			element: {
				...childElement,
				startTime: addMediaTime({
					a: element.startTime,
					b: childElement.startTime,
				}),
			} as TimelineElement,
		}),
	);
}
