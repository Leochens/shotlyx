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

function generateVideoElementMetadata({
	file,
}: {
	file: File;
}): Promise<CloudMediaAssetMetadata> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		const objectUrl = URL.createObjectURL(file);
		let settled = false;

		const cleanup = () => {
			URL.revokeObjectURL(objectUrl);
			video.removeAttribute("src");
			video.load();
			video.remove();
		};

		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};

		const finish = () => {
			if (settled) return;
			try {
				const width = video.videoWidth || undefined;
				const height = video.videoHeight || undefined;
				const duration = Number.isFinite(video.duration)
					? video.duration
					: undefined;
				const thumbnailUrl =
					width && height
						? renderThumbnailDataUrl({
								width,
								height,
								draw: ({ context, width: targetWidth, height: targetHeight }) => {
									context.drawImage(video, 0, 0, targetWidth, targetHeight);
								},
							})
						: undefined;
				settled = true;
				cleanup();
				resolve({ width, height, duration, thumbnailUrl });
			} catch (error) {
				fail(error instanceof Error ? error : new Error("video_thumbnail_failed"));
			}
		};

		video.muted = true;
		video.playsInline = true;
		video.preload = "metadata";
		video.addEventListener("error", () => fail(new Error("video_metadata_failed")));
		video.addEventListener("loadeddata", finish, { once: true });
		video.addEventListener(
			"loadedmetadata",
			() => {
				const duration = Number.isFinite(video.duration) ? video.duration : 0;
				const targetTime = Math.min(0.1, Math.max(0, duration / 2));
				if (targetTime > 0) {
					video.currentTime = targetTime;
				} else {
					finish();
				}
			},
			{ once: true },
		);
		video.addEventListener("seeked", finish, { once: true });
		video.src = objectUrl;
		video.load();
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
		try {
			const video = await readVideoFile({ file });
			return {
				width: video.width,
				height: video.height,
				duration: video.duration,
				fps: Number.isFinite(video.fps) ? Math.round(video.fps) : undefined,
				hasAudio: video.hasAudio,
				thumbnailUrl: video.thumbnailUrl ?? undefined,
			};
		} catch (error) {
			console.warn("Falling back to browser video metadata:", error);
			return generateVideoElementMetadata({ file });
		}
	}

	if (type === "audio") {
		return {
			duration: await readMediaElementDuration({ file }),
		};
	}

	return {};
}
