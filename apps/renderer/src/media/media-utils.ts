import type { MediaAsset, MediaType, TimelineMediaType } from "@/media/types";

export const SUPPORTS_AUDIO: readonly TimelineMediaType[] = ["audio", "video"];

export function mediaSupportsAudio({
	media,
}: {
	media: MediaAsset | null | undefined;
}): boolean {
	if (!media) return false;
	return media.type === "audio" || media.type === "video";
}

export const getMediaTypeFromFile = ({
	file,
}: {
	file: File;
}): MediaType | null => {
	const { type } = file;
	const name = file.name.toLowerCase();

	if (type.startsWith("image/")) {
		return "image";
	}
	if (type.startsWith("video/")) {
		return "video";
	}
	if (type.startsWith("audio/")) {
		return "audio";
	}
	if (
		type === "text/vtt" ||
		name.endsWith(".srt") ||
		name.endsWith(".vtt") ||
		name.endsWith(".ass") ||
		name.endsWith(".ssa")
	) {
		return "subtitle";
	}
	if (type.startsWith("text/") || name.endsWith(".txt")) {
		return "text";
	}

	return null;
};

export function isTimelineMediaType(
	type: MediaType,
): type is TimelineMediaType {
	return type === "image" || type === "video" || type === "audio";
}
