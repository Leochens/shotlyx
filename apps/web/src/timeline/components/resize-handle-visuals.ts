export type ResizeHandleVisualVariant = "edge" | "rolling";

export function getResizeHandleVisualVariant({
	isRollingHighlighted,
}: {
	isRollingHighlighted: boolean;
}): ResizeHandleVisualVariant {
	return isRollingHighlighted ? "rolling" : "edge";
}
