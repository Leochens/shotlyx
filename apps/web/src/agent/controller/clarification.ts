import type { ClarificationRequest } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isClarificationRequest(
	value: unknown,
): value is ClarificationRequest {
	if (!isRecord(value) || !Array.isArray(value.options)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.title === "string" &&
		typeof value.question === "string" &&
		(value.reason === undefined || typeof value.reason === "string") &&
		typeof value.targetSlot === "string" &&
		value.blocking === true &&
		typeof value.allowOther === "boolean" &&
		value.options.every(
			(option) =>
				isRecord(option) &&
				typeof option.id === "string" &&
				typeof option.label === "string" &&
				typeof option.value === "string" &&
				(option.description === undefined ||
					typeof option.description === "string") &&
				(option.recommended === undefined ||
					typeof option.recommended === "boolean"),
		)
	);
}
