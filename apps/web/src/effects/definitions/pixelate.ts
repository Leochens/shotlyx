import type { EffectDefinition, EffectPass } from "@/effects/types";

export const PIXELATE_SHADER = "pixelate";

const MIN_BLOCK_SIZE = 1;
const MAX_BLOCK_SIZE = 240;

export function normalizePixelateBlockSize({
	blockSize,
}: {
	blockSize: number;
}): number {
	if (!Number.isFinite(blockSize)) return 16;
	return Math.max(
		MIN_BLOCK_SIZE,
		Math.min(MAX_BLOCK_SIZE, Math.round(blockSize)),
	);
}

function parseBlockSize(effectParams: Record<string, unknown>): number {
	const raw = effectParams.blockSize;
	return normalizePixelateBlockSize({
		blockSize: typeof raw === "number" ? raw : Number.parseFloat(String(raw)),
	});
}

export function buildPixelatePass({
	blockSize,
}: {
	blockSize: number;
}): EffectPass {
	return {
		shader: PIXELATE_SHADER,
		uniforms: {
			u_blockSize: normalizePixelateBlockSize({ blockSize }),
		},
	};
}

export const pixelateEffectDefinition: EffectDefinition = {
	type: "pixelate",
	name: "Mosaic",
	keywords: ["mosaic", "pixelate", "pixelated", "privacy", "censor"],
	params: [
		{
			key: "blockSize",
			label: "Block size",
			type: "number",
			default: 24,
			min: MIN_BLOCK_SIZE,
			max: MAX_BLOCK_SIZE,
			step: 1,
		},
	],
	renderer: {
		passes: [
			{
				shader: PIXELATE_SHADER,
				uniforms: ({ effectParams }) => ({
					u_blockSize: parseBlockSize(effectParams),
				}),
			},
		],
		buildPasses: ({ effectParams }) => [
			buildPixelatePass({ blockSize: parseBlockSize(effectParams) }),
		],
	},
};
