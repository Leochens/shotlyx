import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/timeline";

export type ExportFastPathBlockReason =
	| "main-track-hidden"
	| "main-video-element-count"
	| "main-element-not-video"
	| "compound-element"
	| "retimed-video"
	| "animated-video"
	| "transformed-video"
	| "effect-or-mask"
	| "overlay-elements"
	| "mixed-audio";

export type ExportFastPathAnalysis =
	| {
			eligible: true;
			kind: "single-source-video";
			mediaId: string;
			audioMode: "source" | "none";
			reasons: [];
	  }
	| {
			eligible: false;
			reasons: ExportFastPathBlockReason[];
	  };

export function analyzeExportFastPath({
	includeAudio,
	tracks,
}: {
	includeAudio: boolean;
	tracks: SceneTracks;
}): ExportFastPathAnalysis {
	const reasons = new Set<ExportFastPathBlockReason>();

	if (isTrackHidden(tracks.main)) {
		reasons.add("main-track-hidden");
	}

	const overlayElements = tracks.overlay.flatMap((track) =>
		getVisibleElements({ track }),
	);
	if (overlayElements.length > 0) {
		reasons.add("overlay-elements");
	}

	const mainElements = getVisibleElements({ track: tracks.main });
	if (mainElements.length !== 1) {
		reasons.add("main-video-element-count");
	}

	const candidate = mainElements[0];
	if (candidate && candidate.type !== "video") {
		reasons.add("main-element-not-video");
	}

	if (candidate) {
		if (candidate.compound) reasons.add("compound-element");
		if (hasAnimations({ element: candidate })) reasons.add("animated-video");
		if (hasEffectsOrMasks({ element: candidate })) reasons.add("effect-or-mask");
		if (candidate.type === "video") {
			if (isRetimed({ element: candidate })) reasons.add("retimed-video");
			if (!hasDefaultVisualParams({ element: candidate })) {
				reasons.add("transformed-video");
			}
		}
	}

	if (includeAudio && hasMixedAudio({ tracks })) {
		reasons.add("mixed-audio");
	}

	if (reasons.size > 0 || !candidate || candidate.type !== "video") {
		return {
			eligible: false,
			reasons: [...reasons],
		};
	}

	return {
		eligible: true,
		kind: "single-source-video",
		mediaId: candidate.mediaId,
		audioMode:
			includeAudio &&
			!tracks.main.muted &&
			candidate.isSourceAudioEnabled !== false
				? "source"
				: "none",
		reasons: [],
	};
}

function isTrackHidden(track: TimelineTrack): boolean {
	return "hidden" in track && track.hidden === true;
}

function getVisibleElements({
	track,
}: {
	track: TimelineTrack;
}): TimelineElement[] {
	if (isTrackHidden(track)) return [];
	return track.elements.filter((element) => !isElementHidden({ element }));
}

function isElementHidden({ element }: { element: TimelineElement }): boolean {
	return "hidden" in element && element.hidden === true;
}

function hasAnimations({ element }: { element: TimelineElement }): boolean {
	if (!element.animations || typeof element.animations !== "object") {
		return false;
	}
	return Object.keys(element.animations).length > 0;
}

function hasEffectsOrMasks({ element }: { element: TimelineElement }): boolean {
	const effects = "effects" in element ? element.effects : undefined;
	const masks = "masks" in element ? element.masks : undefined;
	return (effects?.length ?? 0) > 0 || (masks?.length ?? 0) > 0;
}

function isRetimed({ element }: { element: VideoElement }): boolean {
	const rate = element.retime?.rate;
	return typeof rate === "number" && Number.isFinite(rate) && rate !== 1;
}

function hasDefaultVisualParams({ element }: { element: VideoElement }): boolean {
	const params = element.params;
	return (
		readNumberParam({ params, key: "transform.positionX", fallback: 0 }) === 0 &&
		readNumberParam({ params, key: "transform.positionY", fallback: 0 }) === 0 &&
		readNumberParam({ params, key: "transform.scaleX", fallback: 1 }) === 1 &&
		readNumberParam({ params, key: "transform.scaleY", fallback: 1 }) === 1 &&
		readNumberParam({ params, key: "transform.rotate", fallback: 0 }) === 0 &&
		readNumberParam({ params, key: "opacity", fallback: 1 }) === 1 &&
		readStringParam({ params, key: "blendMode", fallback: "normal" }) ===
			"normal"
	);
}

function readNumberParam({
	fallback,
	key,
	params,
}: {
	fallback: number;
	key: string;
	params: Record<string, unknown>;
}): number {
	const value = params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readStringParam({
	fallback,
	key,
	params,
}: {
	fallback: string;
	key: string;
	params: Record<string, unknown>;
}): string {
	const value = params[key];
	return typeof value === "string" ? value : fallback;
}

function hasMixedAudio({ tracks }: { tracks: SceneTracks }): boolean {
	return tracks.audio.some(
		(track) =>
			!track.muted &&
			track.elements.some((element) => !isAudioElementMuted({ element })),
	);
}

function isAudioElementMuted({
	element,
}: {
	element: TimelineElement;
}): boolean {
	const muted = element.params.muted;
	return typeof muted === "boolean" && muted;
}
