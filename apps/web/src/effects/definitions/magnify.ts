import type { EffectDefinition, EffectPass } from "@/effects/types";

export const MAGNIFY_SHADER = "magnify";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

export function normalizeMagnifyZoom({ zoom }: { zoom: number }): number {
	if (!Number.isFinite(zoom)) return 2;
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

function parseZoom(effectParams: Record<string, unknown>): number {
	const raw = effectParams.zoom;
	return normalizeMagnifyZoom({
		zoom: typeof raw === "number" ? raw : Number.parseFloat(String(raw)),
	});
}

function easeInOut({ progress }: { progress: number }): number {
	const clamped = Math.max(0, Math.min(1, progress));
	return clamped * clamped * (3 - 2 * clamped);
}

export function getMagnifyAnimatedZoom({
	targetZoom,
	localTime,
	duration,
}: {
	targetZoom: number;
	localTime?: number;
	duration?: number;
}): number {
	const zoom = normalizeMagnifyZoom({ zoom: targetZoom });
	if (
		localTime === undefined ||
		duration === undefined ||
		!Number.isFinite(localTime) ||
		!Number.isFinite(duration) ||
		duration <= 0
	) {
		return zoom;
	}

	const progress = Math.max(0, Math.min(1, localTime / duration));
	const ramp = 0.22;
	const envelope =
		progress < ramp
			? easeInOut({ progress: progress / ramp })
			: progress > 1 - ramp
				? easeInOut({ progress: (1 - progress) / ramp })
				: 1;

	return 1 + (zoom - 1) * envelope;
}

export function buildMagnifyPass({
	zoom,
	center,
}: {
	zoom: number;
	center: [number, number];
}): EffectPass {
	return {
		shader: MAGNIFY_SHADER,
		uniforms: {
			u_zoom: normalizeMagnifyZoom({ zoom }),
			u_center: center,
		},
	};
}

export const magnifyEffectDefinition: EffectDefinition = {
	type: "magnify",
	name: "Magnifier",
	keywords: ["magnify", "magnifier", "zoom", "lens", "loupe"],
	params: [
		{
			key: "zoom",
			label: "Strength",
			type: "number",
			default: 2,
			min: MIN_ZOOM,
			max: MAX_ZOOM,
			step: 0.1,
		},
	],
	renderer: {
		passes: [
			{
				shader: MAGNIFY_SHADER,
				uniforms: ({ effectParams, width, height, localTime, duration }) => ({
					u_zoom: getMagnifyAnimatedZoom({
						targetZoom: parseZoom(effectParams),
						localTime,
						duration,
					}),
					u_center: [width / 2, height / 2],
				}),
			},
		],
		buildPasses: ({ effectParams, width, height, localTime, duration }) => [
			buildMagnifyPass({
				zoom: getMagnifyAnimatedZoom({
					targetZoom: parseZoom(effectParams),
					localTime,
					duration,
				}),
				center: [width / 2, height / 2],
			}),
		],
	},
};
