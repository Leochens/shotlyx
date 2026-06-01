declare module "omggif" {
	export interface GifFrameInfo {
		data_length: number;
		data_offset: number;
		delay: number;
		disposal: number;
		has_local_palette: boolean;
		height: number;
		interlaced: boolean;
		palette_offset: number;
		palette_size: number;
		transparent_index: number | null;
		width: number;
		x: number;
		y: number;
	}

	export class GifReader {
		constructor(buffer: Uint8Array);

		readonly width: number;
		readonly height: number;

		decodeAndBlitFrameRGBA(
			frameNumber: number,
			pixels: Uint8ClampedArray,
		): void;
		frameInfo(frameNumber: number): GifFrameInfo;
		loopCount(): number | null;
		numFrames(): number;
	}
}
