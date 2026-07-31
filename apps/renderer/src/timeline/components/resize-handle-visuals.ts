export type ResizeHandleVisualVariant = "edge" | "rolling-edge";
export type ResizeHandleRevealPolicy = "ambient" | "force" | "hidden";

export function getResizeHandleVisualVariant({
	isRollingHighlighted,
}: {
	isRollingHighlighted: boolean;
}): ResizeHandleVisualVariant {
	return isRollingHighlighted ? "rolling-edge" : "edge";
}

export function getResizeHandleRevealPolicy({
	isSelected,
	isHighlighted,
	isPeerHighlighted,
}: {
	isSelected: boolean;
	isHighlighted: boolean;
	isPeerHighlighted: boolean;
}): ResizeHandleRevealPolicy {
	if (isHighlighted) {
		return "force";
	}

	if (isPeerHighlighted) {
		return "hidden";
	}

	return isSelected ? "force" : "ambient";
}
