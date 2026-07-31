import type {
	AgentBrandKitReference,
	AgentContextReference,
	AgentMediaAssetReference,
	AgentSourceMaterialReference,
	AgentTimelineElementReference,
	AgentTimelineTrackReference,
	AgentTopicWorkbenchReference,
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
const MAX_SOURCE_MATERIAL_CONTENT_LENGTH = 6000;
const MAX_TOPIC_WORKBENCH_CONTENT_LENGTH = 8000;

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
	if (value.kind === "source-material") {
		return typeof value.payload.materialId === "string";
	}
	if (value.kind === "topic-workbench") {
		return (
			typeof value.payload.eventId === "string" &&
			typeof value.payload.content === "string"
		);
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

function compactSourceMaterial(payload: AgentSourceMaterialReference) {
	const content = payload.content?.trim();
	return {
		materialId: payload.materialId,
		materialType: payload.materialType,
		name: payload.name,
		summary: payload.summary,
		content:
			content && content.length > MAX_SOURCE_MATERIAL_CONTENT_LENGTH
				? `${content.slice(0, MAX_SOURCE_MATERIAL_CONTENT_LENGTH)}... [truncated ${content.length} chars]`
				: content,
		mediaAssetId: payload.mediaAssetId,
		mediaType: payload.mediaType,
		durationSeconds: payload.durationSeconds,
		sizeBytes: payload.sizeBytes,
	};
}

function compactTopicWorkbench(payload: AgentTopicWorkbenchReference) {
	const content = payload.content.trim();
	return {
		eventId: payload.eventId,
		eventSource: payload.eventSource,
		name: payload.name,
		summary: payload.summary,
		content:
			content.length > MAX_TOPIC_WORKBENCH_CONTENT_LENGTH
				? `${content.slice(0, MAX_TOPIC_WORKBENCH_CONTENT_LENGTH)}... [truncated ${content.length} chars]`
				: content,
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
	if (reference.kind === "source-material") {
		return compactSourceMaterial(reference.payload);
	}
	if (reference.kind === "topic-workbench") {
		return compactTopicWorkbench(reference.payload);
	}
	return compactBrandKit(reference.payload);
}

export function getReferenceTargetKey(
	reference: AgentContextReference,
): string {
	if (reference.kind === "media-asset") {
		return `media:${reference.payload.mediaAssetId}`;
	}
	if (reference.kind === "timeline-element") {
		return `timeline-element:${reference.payload.trackId}:${reference.payload.elementId}`;
	}
	if (reference.kind === "timeline-track") {
		return `timeline-track:${reference.payload.trackId}`;
	}
	if (reference.kind === "source-material") {
		return `source-material:${reference.payload.materialId}`;
	}
	if (reference.kind === "topic-workbench") {
		return `topic-workbench:${reference.payload.eventId}`;
	}
	return `brand-kit:${reference.payload.brandKitId}`;
}

export function formatReferenceForChip(
	reference: AgentContextReference,
): string {
	if (reference.kind === "media-asset") return reference.label;
	if (reference.kind === "timeline-element") return reference.label;
	if (reference.kind === "timeline-track") return reference.label;
	if (reference.kind === "source-material") return reference.label;
	if (reference.kind === "topic-workbench") return reference.label;
	return reference.label || "品牌套件";
}

export function compactReferenceForModel(
	reference: AgentContextReference,
): Record<string, unknown> {
	const payload = compactPayload(reference);
	const compact = sanitizeValue({
		id: reference.id,
		kind: reference.kind,
		label: reference.label,
		source: reference.source,
		...payload,
	});
	if (!isRecord(compact)) return {};
	if (
		reference.kind === "source-material" &&
		isRecord(payload) &&
		typeof payload.content === "string"
	) {
		compact.content = payload.content.startsWith("data:")
			? "[hidden data url]"
			: payload.content;
	}
	if (
		reference.kind === "topic-workbench" &&
		isRecord(payload) &&
		typeof payload.content === "string"
	) {
		compact.content = payload.content;
	}
	return compact;
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
