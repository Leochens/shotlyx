/* eslint-disable shotlyx/prefer-object-params -- Generated component helpers intentionally use compact math-style signatures. */

export interface ShotlyxMotionPrimitives {
	clamp01(value: number): number;
	progress(frame: number, startFrame: number, endFrame: number): number;
	buildHoldResolve(
		frame: number,
		durationInFrames: number,
	): { build: number; hold: number; resolve: number };
	stagger(
		frame: number,
		index: number,
		stepFrames: number,
		durationFrames: number,
	): number;
	seeded(index: number, seed?: number): number;
	fitText(
		text: string,
		maxWidth: number,
		maxLines?: number,
		preferredSize?: number,
		minSize?: number,
	): number;
	countTo(value: number, progress: number, decimals?: number): number;
}

export function createShotlyxMotionPrimitives(): ShotlyxMotionPrimitives {
	const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
	return {
		clamp01,
		progress(frame, startFrame, endFrame) {
			if (endFrame <= startFrame) return frame >= endFrame ? 1 : 0;
			return clamp01((frame - startFrame) / (endFrame - startFrame));
		},
		buildHoldResolve(frame, durationInFrames) {
			const duration = Math.max(1, durationInFrames);
			const normalized = clamp01(frame / Math.max(1, duration - 1));
			return {
				build: clamp01(normalized / 0.24),
				hold: clamp01((normalized - 0.24) / 0.58),
				resolve: clamp01((normalized - 0.82) / 0.18),
			};
		},
		stagger(frame, index, stepFrames, durationFrames) {
			const start = Math.max(0, index) * Math.max(0, stepFrames);
			return clamp01((frame - start) / Math.max(1, durationFrames));
		},
		seeded(index, seed = 17) {
			const value =
				Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
			return value - Math.floor(value);
		},
		fitText(text, maxWidth, maxLines = 2, preferredSize = 96, minSize = 24) {
			const length = Math.max(1, Array.from(text).length);
			const estimated =
				(Math.max(1, maxWidth) * Math.max(1, maxLines)) / (length * 0.72);
			return Math.max(minSize, Math.min(preferredSize, estimated));
		},
		countTo(value, progress, decimals = 0) {
			const precision = Math.max(0, Math.min(6, Math.floor(decimals)));
			const factor = 10 ** precision;
			return Math.round(value * clamp01(progress) * factor) / factor;
		},
	};
}

export const SHOTLYX_MOTION_RUNTIME_SOURCE = `(() => {
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  return {
    clamp01,
    progress(frame, startFrame, endFrame) {
      if (endFrame <= startFrame) return frame >= endFrame ? 1 : 0;
      return clamp01((frame - startFrame) / (endFrame - startFrame));
    },
    buildHoldResolve(frame, durationInFrames) {
      const duration = Math.max(1, durationInFrames);
      const normalized = clamp01(frame / Math.max(1, duration - 1));
      return {
        build: clamp01(normalized / 0.24),
        hold: clamp01((normalized - 0.24) / 0.58),
        resolve: clamp01((normalized - 0.82) / 0.18),
      };
    },
    stagger(frame, index, stepFrames, durationFrames) {
      const start = Math.max(0, index) * Math.max(0, stepFrames);
      return clamp01((frame - start) / Math.max(1, durationFrames));
    },
    seeded(index, seed = 17) {
      const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      return value - Math.floor(value);
    },
    fitText(text, maxWidth, maxLines = 2, preferredSize = 96, minSize = 24) {
      const length = Math.max(1, Array.from(text).length);
      const estimated = (Math.max(1, maxWidth) * Math.max(1, maxLines)) / (length * 0.72);
      return Math.max(minSize, Math.min(preferredSize, estimated));
    },
    countTo(value, progress, decimals = 0) {
      const precision = Math.max(0, Math.min(6, Math.floor(decimals)));
      const factor = 10 ** precision;
      return Math.round(value * clamp01(progress) * factor) / factor;
    },
  };
})()`;
