import { GifReader, type GifFrameInfo } from "omggif";
import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface ImageNodeParams extends VisualNodeParams {
	url: string;
	file?: File;
	maxSourceSize?: number;
	animated?: boolean;
	animatedMimeType?: string;
}

export interface CachedImageSource {
	source: CanvasImageSource;
	version?: string;
	width: number;
	height: number;
}

export interface CachedAnimatedImageSource {
	frames: AnimatedImageFrame[];
	width: number;
	height: number;
}

export interface AnimatedImageFrame {
	durationSeconds: number;
	source: OffscreenCanvas;
}

const imageSourceCache = new Map<string, Promise<CachedImageSource>>();
const animatedImageSourceCache = new Map<
	string,
	Promise<CachedAnimatedImageSource | null>
>();

const DEFAULT_ANIMATED_IMAGE_FRAME_DURATION_SECONDS = 0.1;
const MAX_DECODED_ANIMATED_IMAGE_FRAMES = 600;

function attachAnimatedImageToDocument({
	image,
}: {
	image: HTMLImageElement;
}): void {
	if (typeof document === "undefined" || !document.body) return;

	image.dataset.shotlyxAnimatedImageSource = "true";
	image.setAttribute("aria-hidden", "true");
	image.style.position = "fixed";
	image.style.left = "0";
	image.style.top = "0";
	image.style.width = "2px";
	image.style.height = "2px";
	image.style.opacity = "0.001";
	image.style.pointerEvents = "none";
	image.style.zIndex = "0";
	document.body.appendChild(image);
}

function findAnimatedImageElementForUrl({
	url,
}: {
	url: string;
}): HTMLImageElement | null {
	if (typeof document === "undefined") return null;

	for (const image of Array.from(document.images)) {
		if (image.currentSrc === url || image.src === url) {
			return image;
		}
	}

	return null;
}

function copyPixels({
	pixels,
}: {
	pixels: Uint8ClampedArray;
}): Uint8ClampedArray {
	const next = new Uint8ClampedArray(pixels.length);
	next.set(pixels);
	return next;
}

function clearFrameRect({
	frame,
	pixels,
	width,
}: {
	frame: GifFrameInfo;
	pixels: Uint8ClampedArray;
	width: number;
}): void {
	for (let y = frame.y; y < frame.y + frame.height; y += 1) {
		const start = (y * width + frame.x) * 4;
		const end = start + frame.width * 4;
		pixels.fill(0, start, end);
	}
}

function drawPixelsToCanvas({
	height,
	maxSourceSize,
	pixels,
	width,
}: {
	height: number;
	maxSourceSize?: number;
	pixels: Uint8ClampedArray;
	width: number;
}): OffscreenCanvas {
	const sourceCanvas = new OffscreenCanvas(width, height);
	const sourceContext = sourceCanvas.getContext("2d");
	if (!sourceContext) {
		throw new Error("Failed to get 2d context for GIF frame");
	}
	sourceContext.putImageData(
		new ImageData(copyPixels({ pixels }), width, height),
		0,
		0,
	);

	const targetDimensions = getTargetImageDimensions({
		height,
		maxSourceSize,
		width,
	});
	if (targetDimensions.width === width && targetDimensions.height === height) {
		return sourceCanvas;
	}

	const targetCanvas = new OffscreenCanvas(
		targetDimensions.width,
		targetDimensions.height,
	);
	const targetContext = targetCanvas.getContext("2d");
	if (!targetContext) {
		throw new Error("Failed to get 2d context for scaled GIF frame");
	}
	targetContext.drawImage(
		sourceCanvas,
		0,
		0,
		targetDimensions.width,
		targetDimensions.height,
	);
	return targetCanvas;
}

function getGifFrameDurationSeconds({ delay }: { delay: number }): number {
	return delay > 0
		? delay / 100
		: DEFAULT_ANIMATED_IMAGE_FRAME_DURATION_SECONDS;
}

function getImageFileType({ file }: { file: File }): string | null {
	if (file.type.startsWith("image/")) return file.type;

	const lowerName = file.name.toLowerCase();
	if (lowerName.endsWith(".gif")) return "image/gif";
	if (lowerName.endsWith(".webp")) return "image/webp";
	if (lowerName.endsWith(".png")) return "image/png";
	if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
		return "image/jpeg";
	}

	return null;
}

function getTargetImageDimensions({
	height,
	maxSourceSize,
	width,
}: {
	height: number;
	maxSourceSize?: number;
	width: number;
}): { height: number; width: number } {
	const exceedsLimit =
		maxSourceSize && (width > maxSourceSize || height > maxSourceSize);

	if (!exceedsLimit) {
		return { width, height };
	}

	const scale = Math.min(maxSourceSize / width, maxSourceSize / height);
	return {
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
}

function normaliseAnimatedFrameDurationSeconds({
	durationMicroseconds,
}: {
	durationMicroseconds: number | null;
}): number {
	if (
		durationMicroseconds === null ||
		!Number.isFinite(durationMicroseconds) ||
		durationMicroseconds <= 0
	) {
		return DEFAULT_ANIMATED_IMAGE_FRAME_DURATION_SECONDS;
	}

	const durationSeconds = durationMicroseconds / 1_000_000;
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		return DEFAULT_ANIMATED_IMAGE_FRAME_DURATION_SECONDS;
	}

	return durationSeconds;
}

async function decodeGifImageSource({
	file,
	maxSourceSize,
}: {
	file: File;
	maxSourceSize?: number;
}): Promise<CachedAnimatedImageSource | null> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const reader = new GifReader(bytes);
	const decodedFrameCount = Math.min(
		reader.numFrames(),
		MAX_DECODED_ANIMATED_IMAGE_FRAMES,
	);
	if (decodedFrameCount <= 0) return null;

	const width = reader.width;
	const height = reader.height;
	const targetDimensions = getTargetImageDimensions({
		height,
		maxSourceSize,
		width,
	});
	const pixels = new Uint8ClampedArray(width * height * 4);
	const frames: AnimatedImageFrame[] = [];
	let previousFrame: GifFrameInfo | null = null;
	let restorePixels: Uint8ClampedArray | null = null;

	for (let frameIndex = 0; frameIndex < decodedFrameCount; frameIndex += 1) {
		if (previousFrame?.disposal === 2) {
			clearFrameRect({ frame: previousFrame, pixels, width });
		} else if (previousFrame?.disposal === 3 && restorePixels) {
			pixels.set(restorePixels);
		}

		const frame = reader.frameInfo(frameIndex);
		restorePixels = frame.disposal === 3 ? copyPixels({ pixels }) : null;
		reader.decodeAndBlitFrameRGBA(frameIndex, pixels);
		frames.push({
			durationSeconds: getGifFrameDurationSeconds({ delay: frame.delay }),
			source: drawPixelsToCanvas({
				height,
				maxSourceSize,
				pixels,
				width,
			}),
		});
		previousFrame = frame;
	}

	if (frames.length === 0) return null;

	return {
		frames,
		width: targetDimensions.width,
		height: targetDimensions.height,
	};
}

function drawDecodedFrameToCanvas({
	frame,
	height,
	width,
}: {
	frame: VideoFrame;
	height: number;
	width: number;
}): OffscreenCanvas {
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Failed to get 2d context for animated image frame");
	}

	context.clearRect(0, 0, width, height);
	context.drawImage(frame, 0, 0, width, height);
	return canvas;
}

export function selectAnimatedImageFrameIndex({
	frameDurationsSeconds,
	localTimeSeconds,
}: {
	frameDurationsSeconds: readonly number[];
	localTimeSeconds: number;
}): number {
	if (frameDurationsSeconds.length <= 1) return 0;

	const totalDurationSeconds = frameDurationsSeconds.reduce(
		(total, durationSeconds) => total + Math.max(0, durationSeconds),
		0,
	);
	if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
		return 0;
	}

	const loopTimeSeconds =
		((localTimeSeconds % totalDurationSeconds) + totalDurationSeconds) %
		totalDurationSeconds;
	let elapsedSeconds = 0;

	for (let index = 0; index < frameDurationsSeconds.length; index += 1) {
		elapsedSeconds += Math.max(0, frameDurationsSeconds[index] ?? 0);
		if (loopTimeSeconds < elapsedSeconds) return index;
	}

	return frameDurationsSeconds.length - 1;
}

async function decodeAnimatedImageSource({
	file,
	maxSourceSize,
	typeHint,
}: {
	file: File;
	maxSourceSize?: number;
	typeHint?: string;
}): Promise<CachedAnimatedImageSource | null> {
	const type = getImageFileType({ file }) ?? typeHint ?? null;
	if (!type) return null;

	if (type === "image/gif") {
		return decodeGifImageSource({ file, maxSourceSize });
	}

	if (typeof ImageDecoder === "undefined") {
		return null;
	}

	const supported = await ImageDecoder.isTypeSupported(type);
	if (!supported) return null;

	const decoder = new ImageDecoder({
		data: new Uint8Array(await file.arrayBuffer()),
		preferAnimation: true,
		type,
	});

	try {
		await decoder.tracks.ready;
		if (!decoder.tracks.selectedTrack && decoder.tracks.length > 0) {
			decoder.tracks[0].selected = true;
		}

		const selectedTrack = decoder.tracks.selectedTrack;
		const frameCount =
			selectedTrack &&
			Number.isFinite(selectedTrack.frameCount) &&
			selectedTrack.frameCount > 0
				? Math.min(selectedTrack.frameCount, MAX_DECODED_ANIMATED_IMAGE_FRAMES)
				: MAX_DECODED_ANIMATED_IMAGE_FRAMES;
		const frames: AnimatedImageFrame[] = [];
		let targetDimensions: { height: number; width: number } | null = null;

		for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
			let decoded: ImageDecodeResult;
			try {
				decoded = await decoder.decode({ frameIndex });
			} catch (error) {
				if (frameIndex === 0) throw error;
				break;
			}

			try {
				targetDimensions ??= getTargetImageDimensions({
					height: decoded.image.displayHeight,
					maxSourceSize,
					width: decoded.image.displayWidth,
				});
				frames.push({
					durationSeconds: normaliseAnimatedFrameDurationSeconds({
						durationMicroseconds: decoded.image.duration,
					}),
					source: drawDecodedFrameToCanvas({
						frame: decoded.image,
						height: targetDimensions.height,
						width: targetDimensions.width,
					}),
				});
			} finally {
				decoded.image.close();
			}
		}

		if (frames.length === 0 || !targetDimensions) {
			return null;
		}

		return {
			frames,
			width: targetDimensions.width,
			height: targetDimensions.height,
		};
	} finally {
		decoder.close();
	}
}

export function getAnimatedImageFrameSource({
	localTimeSeconds,
	source,
}: {
	localTimeSeconds: number;
	source: CachedAnimatedImageSource;
}): CachedImageSource {
	const frameIndex = selectAnimatedImageFrameIndex({
		frameDurationsSeconds: source.frames.map((frame) => frame.durationSeconds),
		localTimeSeconds,
	});
	const frame = source.frames[frameIndex];

	return {
		source: frame.source,
		version: `frame:${frameIndex}`,
		width: source.width,
		height: source.height,
	};
}

export function loadAnimatedImageSource({
	file,
	maxSourceSize,
	typeHint,
	url,
}: {
	file: File;
	maxSourceSize?: number;
	typeHint?: string;
	url: string;
}): Promise<CachedAnimatedImageSource | null> {
	const cacheKey = `${url}::${file.name}:${file.size}:${file.lastModified}::${maxSourceSize ?? "full"}::${typeHint ?? "auto"}::decoded-animation`;

	const cached = animatedImageSourceCache.get(cacheKey);
	if (cached) return cached;

	const promise = decodeAnimatedImageSource({
		file,
		maxSourceSize,
		typeHint,
	}).catch(() => null);

	animatedImageSourceCache.set(cacheKey, promise);
	return promise;
}

export function loadImageSource({
	url,
	maxSourceSize,
	animated = false,
}: {
	url: string;
	maxSourceSize?: number;
	animated?: boolean;
}): Promise<CachedImageSource> {
	const cacheKey = `${url}::${maxSourceSize ?? "full"}::${animated ? "animated" : "static"}`;

	const cached = imageSourceCache.get(cacheKey);
	if (cached) return cached;

	const promise = (async (): Promise<CachedImageSource> => {
		const image = animated
			? (findAnimatedImageElementForUrl({ url }) ?? new Image())
			: new Image();
		if (animated && !image.isConnected) {
			attachAnimatedImageToDocument({ image });
		}

		await new Promise<void>((resolve, reject) => {
			if (image.complete && image.naturalWidth > 0) {
				resolve();
				return;
			}
			image.onload = () => resolve();
			image.onerror = () => reject(new Error("Image load failed"));
			if (image.src !== url) {
				image.src = url;
			}
		});

		const naturalWidth = image.naturalWidth;
		const naturalHeight = image.naturalHeight;
		const targetDimensions = getTargetImageDimensions({
			height: naturalHeight,
			maxSourceSize: animated ? undefined : maxSourceSize,
			width: naturalWidth,
		});

		if (
			targetDimensions.width !== naturalWidth ||
			targetDimensions.height !== naturalHeight
		) {
			const offscreen = new OffscreenCanvas(
				targetDimensions.width,
				targetDimensions.height,
			);
			const ctx = offscreen.getContext("2d");

			if (ctx) {
				ctx.drawImage(
					image,
					0,
					0,
					targetDimensions.width,
					targetDimensions.height,
				);
				return {
					source: offscreen,
					width: targetDimensions.width,
					height: targetDimensions.height,
				};
			}
		}

		return { source: image, width: naturalWidth, height: naturalHeight };
	})();

	imageSourceCache.set(cacheKey, promise);
	return promise;
}

export class ImageNode extends VisualNode<
	ImageNodeParams,
	ResolvedVisualSourceNodeState
> {}
