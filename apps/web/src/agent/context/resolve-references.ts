import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import { mediaTimeToSeconds } from "@/wasm";
import type { ProjectBrandKit } from "@/brand-kit/types";
import { compactBrandKit } from "@/brand-kit/compact";
import type {
	AgentContextReference,
	AgentContextReferenceSource,
} from "./types";

function createReferenceId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `ref_${crypto.randomUUID()}`;
	}
	return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getMediaAssetSize(asset: MediaAsset): number | undefined {
	return asset.file?.size;
}

export function createMediaAssetReference({
	asset,
	source,
}: {
	asset: MediaAsset;
	source: AgentContextReferenceSource;
}): AgentContextReference {
	return {
		id: createReferenceId(),
		kind: "media-asset",
		label: asset.name,
		source,
		createdAt: Date.now(),
		payload: {
			mediaAssetId: asset.id,
			name: asset.name,
			type: asset.type,
			durationSeconds: asset.duration,
			width: asset.width,
			height: asset.height,
			sizeBytes: getMediaAssetSize(asset),
		},
	};
}

export function createTimelineElementReference({
	editor,
	trackId,
	elementId,
	source,
}: {
	editor: EditorCore;
	trackId: string;
	elementId: string;
	source: AgentContextReferenceSource;
}): AgentContextReference | null {
	const [resolved] = editor.timeline.getElementsWithTracks({
		elements: [{ trackId, elementId }],
	});
	if (!resolved) return null;

	const mediaId =
		"mediaId" in resolved.element ? resolved.element.mediaId : undefined;

	return {
		id: createReferenceId(),
		kind: "timeline-element",
		label: resolved.element.name,
		source,
		createdAt: Date.now(),
		payload: {
			trackId: resolved.track.id,
			elementId: resolved.element.id,
			trackName: resolved.track.name,
			name: resolved.element.name,
			type: resolved.element.type,
			startTimeSeconds: mediaTimeToSeconds({
				time: resolved.element.startTime,
			}),
			durationSeconds: mediaTimeToSeconds({
				time: resolved.element.duration,
			}),
			mediaAssetId: mediaId,
		},
	};
}

export function createTimelineTrackReference({
	editor,
	trackId,
	source,
}: {
	editor: EditorCore;
	trackId: string;
	source: AgentContextReferenceSource;
}): AgentContextReference | null {
	const track = editor.timeline.getTrackById({ trackId });
	if (!track) return null;

	return {
		id: createReferenceId(),
		kind: "timeline-track",
		label: track.name,
		source,
		createdAt: Date.now(),
		payload: {
			trackId: track.id,
			name: track.name,
			type: track.type,
			elementCount: track.elements.length,
		},
	};
}

export function createBrandKitReference({
	kit,
	source,
}: {
	kit: ProjectBrandKit;
	source: AgentContextReferenceSource;
}): AgentContextReference {
	const compact = compactBrandKit({ kit });
	return {
		id: createReferenceId(),
		kind: "brand-kit",
		label: kit.name,
		source,
		createdAt: Date.now(),
		payload: {
			brandKitId: compact.id,
			name: compact.name,
			colors: compact.colors,
			fonts: compact.fonts,
			logoMediaAssetIds: compact.logoMediaAssetIds,
			imageMediaAssetIds: compact.imageMediaAssetIds,
			styleGuide: compact.styleGuide,
		},
	};
}
