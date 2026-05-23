import type {
	AgentBrandKitReference,
	AgentContextReference,
	AgentMediaAssetReference,
	AgentTimelineElementReference,
	AgentTimelineTrackReference,
	CompactAgentReferences,
} from "./types";

const MAX_COMPACT_REFERENCES = 8;
const BLOCKED_KEYS = new Set([
	"file",
	"blob",
	"url",
	"previewUrl",
	"thumbnailUrl",
	"downloadUrl",
	"sourceUrl",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAgentContextReference(
	value: unknown,
): value is AgentContextReference {
	if (!isRecord(value)) return false;
	if (
		typeof value.id !== "string" ||
		typeof value.kind !== "string" ||
		typeof value.label !== "string" ||
		typeof value.source !== "string" ||
		typeof value.createdAt !== "number" ||
		!isRecord(value.payload)
	) {
		return false;
	}

	if (value.kind === "media-asset") {
		return typeof value.payload.mediaAssetId === "string";
	}
	if (value.kind === "timeline-element") {
		return (
			typeof value.payload.trackId === "string" &&
			typeof value.payload.elementId === "string"
		);
	}
	if (value.kind === "timeline-track") {
		return typeof value.payload.trackId === "string";
	}
	if (value.kind === "brand-kit") {
		return typeof value.payload.brandKitId === "string";
	}
	return false;
}

function sanitizeValue(value: unknown): unknown {
	if (typeof value === "string") {
		if (value.startsWith("data:")) return "[hidden data url]";
		if (value.length > 500) return `${value.slice(0, 500)}...`;
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(sanitizeValue);
	}

	if (isRecord(value)) {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			if (BLOCKED_KEYS.has(key)) continue;
			result[key] = sanitizeValue(item);
		}
		return result;
	}

	return value;
}

function compactMediaAsset(payload: AgentMediaAssetReference) {
	return {
		mediaAssetId: payload.mediaAssetId,
		name: payload.name,
		type: payload.type,
		durationSeconds: payload.durationSeconds,
		width: payload.width,
		height: payload.height,
		sizeBytes: payload.sizeBytes,
	};
}

function compactTimelineElement(payload: AgentTimelineElementReference) {
	return {
		trackId: payload.trackId,
		elementId: payload.elementId,
		trackName: payload.trackName,
		name: payload.name,
		type: payload.type,
		startTimeSeconds: payload.startTimeSeconds,
		durationSeconds: payload.durationSeconds,
		mediaAssetId: payload.mediaAssetId,
	};
}

function compactTimelineTrack(payload: AgentTimelineTrackReference) {
	return {
		trackId: payload.trackId,
		name: payload.name,
		type: payload.type,
		elementCount: payload.elementCount,
	};
}

function compactBrandKit(payload: AgentBrandKitReference) {
	return {
		brandKitId: payload.brandKitId,
		name: payload.name,
		colors: payload.colors,
		fonts: payload.fonts,
		logoMediaAssetIds: payload.logoMediaAssetIds,
		imageMediaAssetIds: payload.imageMediaAssetIds,
		styleGuide: payload.styleGuide,
	};
}

function compactPayload(reference: AgentContextReference) {
	if (reference.kind === "media-asset") {
		return compactMediaAsset(reference.payload);
	}
	if (reference.kind === "timeline-element") {
		return compactTimelineElement(reference.payload);
	}
	if (reference.kind === "timeline-track") {
		return compactTimelineTrack(reference.payload);
	}
	return compactBrandKit(reference.payload);
}

export function getReferenceTargetKey(reference: AgentContextReference): string {
	if (reference.kind === "media-asset") {
		return `media:${reference.payload.mediaAssetId}`;
	}
	if (reference.kind === "timeline-element") {
		return `timeline-element:${reference.payload.trackId}:${reference.payload.elementId}`;
	}
	if (reference.kind === "timeline-track") {
		return `timeline-track:${reference.payload.trackId}`;
	}
	return `brand-kit:${reference.payload.brandKitId}`;
}

export function formatReferenceForChip(reference: AgentContextReference): string {
	if (reference.kind === "media-asset") return reference.label;
	if (reference.kind === "timeline-element") return reference.label;
	if (reference.kind === "timeline-track") return reference.label;
	return reference.label || "品牌套件";
}

export function compactReferenceForModel(
	reference: AgentContextReference,
): Record<string, unknown> {
	const compact = sanitizeValue({
		id: reference.id,
		kind: reference.kind,
		label: reference.label,
		source: reference.source,
		...compactPayload(reference),
	});
	return isRecord(compact) ? compact : {};
}

export function compactReferencesForModel({
	references,
	primaryReferenceId,
	maxReferences = MAX_COMPACT_REFERENCES,
}: {
	references: AgentContextReference[];
	primaryReferenceId: string | null;
	maxReferences?: number;
}): CompactAgentReferences {
	const primary = primaryReferenceId
		? references.find((reference) => reference.id === primaryReferenceId)
		: null;
	const ordered = [
		...(primary ? [primary] : []),
		...references.filter((reference) => reference.id !== primary?.id),
	].slice(0, maxReferences);

	return {
		primaryReferenceId: primary?.id ?? references[0]?.id ?? null,
		references: ordered.map(compactReferenceForModel),
	};
}

export function sanitizeAgentContextPayload(payload: unknown): unknown {
	return sanitizeValue(payload);
}
