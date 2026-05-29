import { loadImageSource } from "./image-node";
import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface ImageSequenceFrame {
	file: File;
	url: string;
}

export interface ImageSequenceNodeParams extends VisualNodeParams {
	frames: ImageSequenceFrame[];
	sourceHeight: number;
	sourceWidth: number;
}

export class ImageSequenceNode extends VisualNode<
	ImageSequenceNodeParams,
	ResolvedVisualSourceNodeState
> {
	private sourceCache = new Map<number, Promise<ResolvedImageFrame>>();

	async getFrameSource({
		frameIndex,
	}: {
		frameIndex: number;
	}): Promise<ResolvedImageFrame | null> {
		const frame = this.params.frames[frameIndex];
		if (!frame) return null;

		const cached = this.sourceCache.get(frameIndex);
		if (cached) return cached;

		const promise = loadImageSource({ url: frame.url });
		this.sourceCache.set(
			frameIndex,
			promise.catch((error: unknown) => {
				this.sourceCache.delete(frameIndex);
				throw error;
			}),
		);
		return promise;
	}
}

type ResolvedImageFrame = Awaited<ReturnType<typeof loadImageSource>>;
