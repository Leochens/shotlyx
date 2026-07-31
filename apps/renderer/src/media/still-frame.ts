import type { MediaAsset } from "@/media/types";

export function buildStillFrameAsset({
	blob,
	filename,
	width,
	height,
	thumbnailUrl,
	name,
	now = Date.now,
	createObjectUrl = URL.createObjectURL,
}: {
	blob: Blob;
	filename: string;
	width: number;
	height: number;
	thumbnailUrl: string;
	name?: string;
	now?: () => number;
	createObjectUrl?: (blob: Blob) => string;
}): Omit<MediaAsset, "id"> {
	const safeFilename = filename.trim() || "still-frame.png";
	const file = new File([blob], safeFilename, {
		type: blob.type || "image/png",
		lastModified: now(),
	});

	return {
		name: name?.trim() || safeFilename,
		type: "image",
		file,
		url: createObjectUrl(file),
		thumbnailUrl,
		width,
		height,
	};
}
