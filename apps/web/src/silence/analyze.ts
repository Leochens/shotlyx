import {
	audioBufferToMonoSamples,
	createAudioContext,
	resolveAudioBufferForAsset,
} from "@/media/audio";
import { mediaSupportsAudio } from "@/media/media-utils";
import type { MediaAsset } from "@/media/types";
import { getClipTimeAtSourceTime, getSourceSpanAtClipTime } from "@/retime";
import {
	hasMediaId,
	isRetimableElement,
	type TimelineElement,
	type TimelineTrack,
} from "@/timeline";
import {
	addMediaTime,
	maxMediaTime,
	mediaTimeFromSeconds,
	minMediaTime,
	roundMediaTime,
	subMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import { detectSilenceSegments } from "@/wasm/audio-analysis";
import type {
	SilenceAnalysisResult,
	SilenceAnalysisSegment,
	SilenceAnalysisTarget,
	SilenceDetectionOptions,
} from "./types";
import { DEFAULT_SILENCE_DETECTION_OPTIONS } from "./constants";

export { DEFAULT_SILENCE_DETECTION_OPTIONS } from "./constants";

export async function analyzeSilenceForElements({
	elements,
	mediaAssets,
	options = DEFAULT_SILENCE_DETECTION_OPTIONS,
	audioContext,
}: {
	elements: Array<{ track: TimelineTrack; element: TimelineElement }>;
	mediaAssets: MediaAsset[];
	options?: SilenceDetectionOptions;
	audioContext?: AudioContext;
}): Promise<SilenceAnalysisResult> {
	const context = audioContext ?? createAudioContext();
	const mediaMap = new Map(mediaAssets.map((asset) => [asset.id, asset]));
	const targets: SilenceAnalysisTarget[] = [];
	let totalSilenceDuration: MediaTime = ZERO_MEDIA_TIME;

	for (const { track, element } of elements) {
		if (!hasMediaId(element) || !canAnalyzeElement({ element })) {
			continue;
		}

		const asset = mediaMap.get(element.mediaId);
		if (!asset || !mediaSupportsAudio({ media: asset })) {
			continue;
		}

		const buffer = await resolveAudioBufferForAsset({
			asset,
			audioContext: context,
		});
		if (!buffer) {
			continue;
		}

		const samples = audioBufferToMonoSamples({ buffer });
		const wasmSegments = detectSilenceSegments({
			samples,
			options: {
				sampleRate: buffer.sampleRate,
				thresholdDb: options.thresholdDb,
				minSilenceMs: options.minSilenceMs,
				paddingMs: options.paddingMs,
				windowMs: options.windowMs,
				mergeGapMs: options.mergeGapMs,
			},
		});
		const segments = wasmSegments.flatMap((segment) =>
			mapSourceSegmentToTimeline({
				element,
				startSeconds: segment.startSeconds,
				endSeconds: segment.endSeconds,
			}),
		);

		if (segments.length === 0) {
			continue;
		}

		for (const segment of segments) {
			totalSilenceDuration = addMediaTime({
				a: totalSilenceDuration,
				b: subMediaTime({
					a: segment.endTime,
					b: segment.startTime,
				}),
			});
		}

		targets.push({
			trackId: track.id,
			elementId: element.id,
			elementName: element.name,
			segments,
		});
	}

	return {
		targets,
		totalSilenceDuration,
	};
}

function canAnalyzeElement({ element }: { element: TimelineElement }): boolean {
	return element.type === "video" || element.type === "audio";
}

function mapSourceSegmentToTimeline({
	element,
	startSeconds,
	endSeconds,
}: {
	element: TimelineElement;
	startSeconds: number;
	endSeconds: number;
}): SilenceAnalysisSegment[] {
	if (!isRetimableElement(element)) {
		return [];
	}

	const segmentSourceStart = mediaTimeFromSeconds({ seconds: startSeconds });
	const segmentSourceEnd = mediaTimeFromSeconds({ seconds: endSeconds });
	const sourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: element.duration,
			retime: element.retime,
		}),
	});
	const elementSourceStart = element.trimStart;
	const elementSourceEnd = addMediaTime({
		a: element.trimStart,
		b: sourceSpan,
	});

	const overlapStart = maxMediaTime({
		a: segmentSourceStart,
		b: elementSourceStart,
	});
	const overlapEnd = minMediaTime({
		a: segmentSourceEnd,
		b: elementSourceEnd,
	});

	if (overlapEnd <= overlapStart) {
		return [];
	}

	const localSourceStart = subMediaTime({
		a: overlapStart,
		b: elementSourceStart,
	});
	const localSourceEnd = subMediaTime({
		a: overlapEnd,
		b: elementSourceStart,
	});
	const localStart = roundMediaTime({
		time: getClipTimeAtSourceTime({
			sourceTime: localSourceStart,
			retime: element.retime,
		}),
	});
	const localEnd = roundMediaTime({
		time: getClipTimeAtSourceTime({
			sourceTime: localSourceEnd,
			retime: element.retime,
		}),
	});
	const startTime = addMediaTime({
		a: element.startTime,
		b: localStart,
	});
	const endTime = addMediaTime({
		a: element.startTime,
		b: localEnd,
	});

	if (endTime <= startTime) {
		return [];
	}

	return [{ startTime, endTime }];
}
