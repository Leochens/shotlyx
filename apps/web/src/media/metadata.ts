import type { CloudMediaAssetMetadata } from "@/auth/client";
import type { MediaType } from "@/media/types";
import { readVideoFile } from "./mediabunny";
import { renderThumbnailDataUrl } from "./thumbnail";

function readMediaElementDuration({ file }: { file: File }): Promise<number> {
	return new Promise((resolve, reject) => {
		const element: HTMLMediaElement = file.type.startsWith("video/")
			? document.createElement("video")
			: document.createElement("audio");
		const objectUrl = URL.createObjectURL(file);

		element.addEventListener("loadedmetadata", () => {
			resolve(element.duration);
			URL.revokeObjectURL(objectUrl);
			element.remove();
		});

		element.addEventListener("error", () => {
			reject(new Error("Could not load media metadata"));
			URL.revokeObjectURL(objectUrl);
			element.remove();
		});

		element.src = objectUrl;
		element.load();
	});
}

function generateImageMetadata({
	file,
}: {
	file: File;
}): Promise<CloudMediaAssetMetadata> {
	return new Promise((resolve, reject) => {
		const image = new window.Image();
		const objectUrl = URL.createObjectURL(file);

		image.addEventListener("load", () => {
			try {
				resolve({
					width: image.naturalWidth,
					height: image.naturalHeight,
					thumbnailUrl: renderThumbnailDataUrl({
						width: image.naturalWidth,
						height: image.naturalHeight,
						draw: ({ context, width, height }) => {
							context.drawImage(image, 0, 0, width, height);
						},
					}),
				});
			} catch (error) {
				reject(error instanceof Error ? error : new Error("thumbnail_failed"));
			} finally {
				URL.revokeObjectURL(objectUrl);
				image.remove();
			}
		});

		image.addEventListener("error", () => {
			URL.revokeObjectURL(objectUrl);
			image.remove();
			reject(new Error("image_metadata_failed"));
		});

		image.src = objectUrl;
	});
}

export async function deriveCloudMediaAssetMetadata({
	file,
	type,
}: {
	file: File;
	type: MediaType;
}): Promise<CloudMediaAssetMetadata> {
	if (type === "image") {
		return generateImageMetadata({ file });
	}

	if (type === "video") {
		const video = await readVideoFile({ file });
		return {
			width: video.width,
			height: video.height,
			duration: video.duration,
			fps: Number.isFinite(video.fps) ? Math.round(video.fps) : undefined,
			hasAudio: video.hasAudio,
			thumbnailUrl: video.thumbnailUrl ?? undefined,
		};
	}

	if (type === "audio") {
		return {
			duration: await readMediaElementDuration({ file }),
		};
	}

	return {};
}
