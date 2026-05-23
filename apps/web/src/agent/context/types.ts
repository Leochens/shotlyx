import type { MediaType } from "@/media/types";
import type { ElementType, TrackType } from "@/timeline";

export type AgentContextReferenceKind =
	| "media-asset"
	| "timeline-element"
	| "timeline-track"
	| "brand-kit";

export type AgentContextReferenceSource =
	| "manual-add"
	| "mention"
	| "point-select"
	| "active-brand-kit";

export interface AgentMediaAssetReference {
	mediaAssetId: string;
	name: string;
	type: MediaType;
	durationSeconds?: number;
	width?: number;
	height?: number;
	sizeBytes?: number;
}

export interface AgentTimelineElementReference {
	trackId: string;
	elementId: string;
	trackName: string;
	name: string;
	type: ElementType;
	startTimeSeconds: number;
	durationSeconds: number;
	mediaAssetId?: string;
}

export interface AgentTimelineTrackReference {
	trackId: string;
	name: string;
	type: TrackType;
	elementCount: number;
}

export interface AgentBrandKitReference {
	brandKitId: string;
	name: string;
	colors: string[];
	fonts: string[];
	logoMediaAssetIds: string[];
	imageMediaAssetIds: string[];
	styleGuide?: string;
}

interface BaseAgentContextReference<
	TKind extends AgentContextReferenceKind,
	TPayload,
> {
	id: string;
	kind: TKind;
	label: string;
	source: AgentContextReferenceSource;
	createdAt: number;
	payload: TPayload;
}

export type AgentContextReference =
	| BaseAgentContextReference<"media-asset", AgentMediaAssetReference>
	| BaseAgentContextReference<"timeline-element", AgentTimelineElementReference>
	| BaseAgentContextReference<"timeline-track", AgentTimelineTrackReference>
	| BaseAgentContextReference<"brand-kit", AgentBrandKitReference>;

export interface CompactAgentReferences {
	primaryReferenceId: string | null;
	references: Array<Record<string, unknown>>;
}
