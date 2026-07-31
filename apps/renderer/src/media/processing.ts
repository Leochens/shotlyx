import { toast } from "sonner";
import { getMediaTypeFromFile } from "@/media/media-utils";
import { formatStorageBytes } from "@/services/storage/quota";
import { storageService } from "@/services/storage/service";
import type { MediaAsset } from "@/media/types";
import { readVideoFile } from "./mediabunny";
import type { VideoFileData } from "./mediabunny";
import { renderThumbnailDataUrl } from "./thumbnail";
import { getDesktopFileSource } from "./desktop-file-source";

export type ProcessedMediaAsset = Omit<MediaAsset, "id">;

const DESKTOP_VIDEO_PREPARE_ENDPOINT = "/api/desktop/media/prepare-video";
const MAX_DESKTOP_PREPARE_VIDEO_BYTES = 512 * 1024 * 1024;

const getUnsupportedVideoDescription = ({
	codec,
}: {
	codec: VideoFileData["codec"];
}): string => {
	const codecLabel = codec ? codec.toUpperCase() : "this video codec";

	return codec === "hevc"
		? `${codecLabel} cannot be decoded in this browser, so this clip may not preview correctly. Convert it to H.264 MP4 or try importing it in Safari.`
		: `${codecLabel} cannot be decoded in this browser, so this clip may not preview correctly. Convert it to H.264 MP4 and reimport it.`;
};

const getStorageLimitDescription = ({
	fileSize,
	availableBytes,
}: {
	fileSize: number;
	availableBytes: number | null;
}): string => {
	const fileSizeLabel = formatStorageBytes({ bytes: fileSize });

	if (availableBytes === null) {
		return `File size is ${fileSizeLabel}.`;
	}

	return `File size is ${fileSizeLabel}, but only ${formatStorageBytes({
		bytes: availableBytes,
	})} is safely available in browser storage.`;
};

function isDesktopMode(): boolean {
	return process.env.VITE_SHOTLYX_DESKTOP === "1";
}

function getPreparedVideoFileName({
	contentType,
	fileName,
}: {
	contentType: string;
	fileName: string;
}): string {
	const dotIndex = fileName.lastIndexOf(".");
	const baseName =
		dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName || "video";
	const extension = contentType === "video/webm" ? "webm" : "mp4";
	return `${baseName || "video"}.${extension}`;
}

async function prepareVideoForDesktopPreview({
	file,
}: {
	file: File;
}): Promise<File> {
	const params = new URLSearchParams({ name: file.name });
	const response = await fetch(`${DESKTOP_VIDEO_PREPARE_ENDPOINT}?${params}`, {
		body: file,
		headers: file.type ? { "Content-Type": file.type } : undefined,
		method: "POST",
	});
	if (!response.ok) {
		let message = `Video preparation failed: ${response.status}`;
		try {
			const body = await response.json();
			if (typeof body === "object" && body !== null) {
				const bodyMessage = Reflect.get(body, "message");
				const bodyError = Reflect.get(body, "error");
				message =
					(typeof bodyMessage === "string" && bodyMessage) ||
					(typeof bodyError === "string" && bodyError) ||
					message;
			}
		} catch {
			// Keep the status-based message.
		}
		throw new Error(message);
	}

	const blob = await response.blob();
	const encodedName = response.headers.get("X-Shotlyx-Filename");
	const contentType =
		blob.type || response.headers.get("Content-Type") || "video/mp4";
	const name = encodedName
		? decodeURIComponent(encodedName)
		: getPreparedVideoFileName({ contentType, fileName: file.name });
	return new File([blob], name, {
		lastModified: file.lastModified,
		type: contentType,
	});
}

async function readPreviewableVideoFile({ file }: { file: File }): Promise<{
	file: File;
	videoData: VideoFileData;
	wasPrepared: boolean;
}> {
	const videoData = await readVideoFile({ file });
	if (videoData.canDecode || !isDesktopMode()) {
		return { file, videoData, wasPrepared: false };
	}
	if (file.size > MAX_DESKTOP_PREPARE_VIDEO_BYTES) {
		console.info(
			`Skipping desktop preview preparation for large video: ${file.name}`,
		);
		return { file, videoData, wasPrepared: false };
	}

	try {
		const preparedFile = await prepareVideoForDesktopPreview({ file });
		const preparedVideoData = await readVideoFile({ file: preparedFile });
		return {
			file: preparedFile,
			videoData: preparedVideoData,
			wasPrepared: true,
		};
	} catch (error) {
		console.warn("Failed to prepare video for desktop preview:", error);
		return { file, videoData, wasPrepared: false };
	}
}

async function generateImageThumbnail({
	imageFile,
}: {
	imageFile: File;
}): Promise<{ thumbnailUrl: string; width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new window.Image();
		const objectUrl = URL.createObjectURL(imageFile);

		image.addEventListener("load", () => {
			try {
				const thumbnailUrl = renderThumbnailDataUrl({
					width: image.naturalWidth,
					height: image.naturalHeight,
					draw: ({ context, width, height }) => {
						context.drawImage(image, 0, 0, width, height);
					},
				});
				resolve({
					thumbnailUrl,
					width: image.naturalWidth,
					height: image.naturalHeight,
				});
			} catch (error) {
				reject(
					error instanceof Error ? error : new Error("Could not render image"),
				);
			} finally {
				URL.revokeObjectURL(objectUrl);
				image.remove();
			}
		});

		image.addEventListener("error", () => {
			URL.revokeObjectURL(objectUrl);
			image.remove();
			reject(new Error("Could not load image"));
		});

		image.src = objectUrl;
	});
}

export async function processMediaAssets({
	files,
	onProgress,
}: {
	files: FileList | File[];
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<ProcessedMediaAsset[]> {
	const fileArray = Array.from(files);
	const processedAssets: ProcessedMediaAsset[] = [];

	const total = fileArray.length;
	let completed = 0;

	for (const file of fileArray) {
		const fileType = getMediaTypeFromFile({ file });

		if (!fileType) {
			toast.error(`Unsupported file type: ${file.name}`);
			continue;
		}

		const storageCheck = await storageService.canStoreFile({
			size: file.size,
		});

		if (!storageCheck.canStore) {
			toast.error(`Not enough local storage for ${file.name}`, {
				description: getStorageLimitDescription({
					fileSize: file.size,
					availableBytes: storageCheck.availableBytes,
				}),
			});
			continue;
		}

		let assetFile = file;
		let url = URL.createObjectURL(assetFile);
		let thumbnailUrl: string | undefined;
		let duration: number | undefined;
		let width: number | undefined;
		let height: number | undefined;
		let fps: number | undefined;
		let hasAudio: boolean | undefined;

		try {
			if (fileType === "image") {
				const result = await generateImageThumbnail({ imageFile: file });
				thumbnailUrl = result.thumbnailUrl;
				width = result.width;
				height = result.height;
			} else if (fileType === "video") {
				try {
					const videoResult = await readPreviewableVideoFile({ file });
					if (videoResult.wasPrepared) {
						URL.revokeObjectURL(url);
						assetFile = videoResult.file;
						url = URL.createObjectURL(assetFile);
					}
					const videoData = videoResult.videoData;
					duration = videoData.duration;
					width = videoData.width;
					height = videoData.height;
					fps = Number.isFinite(videoData.fps)
						? Math.round(videoData.fps)
						: undefined;
					hasAudio = videoData.hasAudio;
					thumbnailUrl = videoData.thumbnailUrl ?? undefined;

					if (!videoData.canDecode) {
						toast.error(`Can't preview ${file.name}`, {
							description: getUnsupportedVideoDescription({
								codec: videoData.codec,
							}),
						});
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Could not process video";

					toast.error(`Couldn't process ${file.name}`, {
						description: message,
					});
				}
			} else if (fileType === "audio") {
				duration = await getMediaDuration({ file });
			} else if (fileType === "subtitle" || fileType === "text") {
				await file.text();
			}

			const sourcePath = getDesktopFileSource({ file: assetFile });
			processedAssets.push({
				name: assetFile.name,
				type: fileType,
				file: assetFile,
				url,
				thumbnailUrl,
				duration,
				width,
				height,
				fps,
				hasAudio,
				storage: sourcePath
					? {
							mode: "linked",
							sourcePath,
						}
					: { mode: "managed" },
			});

			await new Promise((resolve) => setTimeout(resolve, 0));

			completed += 1;
			if (onProgress) {
				const percent = Math.round((completed / total) * 100);
				onProgress({ progress: percent });
			}
		} catch (error) {
			console.error("Error processing file:", file.name, error);
			toast.error(`Failed to process ${file.name}`);
			URL.revokeObjectURL(url);
		}
	}

	return processedAssets;
}

const getMediaDuration = ({ file }: { file: File }): Promise<number> => {
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
			reject(new Error("Could not load media"));
			URL.revokeObjectURL(objectUrl);
			element.remove();
		});

		element.src = objectUrl;
		element.load();
	});
};
