import type { ShotlyxMGGenerationRequest } from "./generation-request";
import type { ShotlyxMGMotionSpec, ShotlyxMGVisualDNA } from "./types";

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

// eslint-disable-next-line shotlyx/prefer-object-params -- Compact deterministic math helper.
function axis(seed: number, shift: number, min: number, max: number): number {
	const value = ((seed >>> shift) & 0xff) / 255;
	return Number((min + value * (max - min)).toFixed(3));
}

// eslint-disable-next-line shotlyx/prefer-object-params -- Compact color-conversion math helper.
function hslToHex(hue: number, saturation: number, lightness: number): string {
	const s = saturation / 100;
	const l = lightness / 100;
	const chroma = (1 - Math.abs(2 * l - 1)) * s;
	const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
	const match = l - chroma / 2;
	let red = 0;
	let green = 0;
	let blue = 0;
	if (hue < 60) [red, green] = [chroma, x];
	else if (hue < 120) [red, green] = [x, chroma];
	else if (hue < 180) [green, blue] = [chroma, x];
	else if (hue < 240) [green, blue] = [x, chroma];
	else if (hue < 300) [red, blue] = [x, chroma];
	else [red, blue] = [chroma, x];
	return `#${[red, green, blue]
		.map((channel) =>
			Math.round((channel + match) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

function derivePalette({
	request,
	seed,
}: {
	request: ShotlyxMGGenerationRequest;
	seed: number;
}): ShotlyxMGVisualDNA["colors"] {
	const requested = request.preferences.colors;
	const hue = seed % 360;
	const primary = requested[0] ?? hslToHex(hue, 68, 48);
	const secondary = requested[1] ?? hslToHex(hue, 34, 72);
	const darkBackground = axis(seed, 8, 0, 1) > 0.48;
	return {
		primary,
		secondary,
		foreground: requested[2] ?? (darkBackground ? "#f7f5f2" : "#161514"),
		background: requested[3] ?? (darkBackground ? "#151412" : "#f4f1eb"),
		userLocked: request.preferences.colorsSource === "locked" ? requested : [],
	};
}

function compositionSummary(visualDNA: ShotlyxMGVisualDNA): string {
	const position =
		visualDNA.composition.focusX < 0.42
			? "左侧主视觉"
			: visualDNA.composition.focusX > 0.58
				? "右侧主视觉"
				: "居中主视觉";
	const density = visualDNA.composition.density < 0.45 ? "低密度" : "层次丰富";
	const type = visualDNA.typography.contrast > 0.68 ? "大字强对比" : "清晰字阶";
	const motion =
		visualDNA.motion.energy > 0.68
			? "快速入场、利落收束"
			: "稳健入场、自然收束";
	return `${position} · ${visualDNA.colors.primary} 强调 · ${type}${density} · ${motion}`;
}

export function createShotlyxMGVisualDNA({
	request,
	avoidFingerprints = [],
}: {
	request: ShotlyxMGGenerationRequest;
	avoidFingerprints?: string[];
}): ShotlyxMGVisualDNA {
	let variation = 0;
	let seed = 0;
	let fingerprint = "";
	do {
		seed = hashString(
			`${request.prompt}|${request.aspectRatio}|${request.durationSeconds}|${variation}`,
		);
		fingerprint = seed.toString(36).padStart(7, "0").slice(-7);
		variation += 1;
	} while (avoidFingerprints.includes(fingerprint) && variation < 12);
	const visualDNA: ShotlyxMGVisualDNA = {
		version: 1,
		summary: "",
		fingerprint,
		contentKind: request.contentKind,
		sources: {
			colors: request.preferences.colorsSource,
			typography: request.preferences.fontSource,
			layout: request.preferences.styleGuide ? "derived" : "auto",
			motion: request.preferences.styleGuide ? "derived" : "auto",
		},
		composition: {
			focusX: axis(seed, 0, 0.3, 0.7),
			focusY: axis(seed, 7, 0.4, 0.6),
			asymmetry: axis(seed, 14, 0.35, 0.82),
			density: axis(seed, 21, 0.28, 0.68),
			safeMargin: request.aspectRatio === "9:16" ? 0.075 : 0.055,
			decorationBudget: request.contentKind === "effect" ? 0.58 : 0.24,
		},
		colors: derivePalette({ request, seed }),
		typography: {
			fontFamilies:
				request.preferences.fontFamilies.length > 0
					? request.preferences.fontFamilies
					: ['"Noto Sans CJK SC"', '"PingFang SC"', "sans-serif"],
			contrast: axis(seed, 5, 0.58, 0.9),
			maxLines: request.aspectRatio === "9:16" ? 3 : 2,
			maxTextWidth: request.aspectRatio === "9:16" ? 0.82 : 0.7,
		},
		motion: {
			energy: axis(seed, 3, 0.42, 0.82),
			elasticity: axis(seed, 11, 0.05, 0.42),
			continuity: axis(seed, 18, 0.38, 0.72),
			entryShare: 0.24,
			holdShare: 0.58,
			exitShare: 0.18,
			loop: /循环|loop/i.test(request.prompt),
		},
		depth: {
			texture: axis(seed, 2, 0.02, 0.3),
			shadow: axis(seed, 10, 0.08, 0.42),
			glow: axis(seed, 17, 0, 0.22),
		},
	};
	visualDNA.summary = compositionSummary(visualDNA);
	return visualDNA;
}

export function createShotlyxMGMotionSpec({
	request,
	visualDNA,
}: {
	request: ShotlyxMGGenerationRequest;
	visualDNA: ShotlyxMGVisualDNA;
}): ShotlyxMGMotionSpec {
	const hasText = request.textPolicy !== "forbidden";
	const hasData = ["metric", "chart", "comparison"].includes(
		request.contentKind,
	);
	const elements: ShotlyxMGMotionSpec["elements"] = [
		{
			id: "hero",
			role: "hero",
			contentSource: hasText ? "user" : "none",
			priority: 1,
			...(hasText
				? {
						maxLines: visualDNA.typography.maxLines,
						maxWidth: visualDNA.typography.maxTextWidth,
					}
				: {}),
		},
	];
	if (hasText) {
		elements.push({
			id: "support-copy",
			role: "support",
			contentSource: "derived",
			priority: 2,
			maxLines: 2,
			maxWidth: Math.min(0.82, visualDNA.typography.maxTextWidth + 0.08),
		});
	}
	if (hasData) {
		elements.push({
			id: "data-display",
			role: "data",
			contentSource: "user",
			priority: 2,
		});
	}
	if (visualDNA.composition.decorationBudget > 0.15) {
		elements.push({
			id: "supporting-geometry",
			role: "decoration",
			contentSource: "none",
			priority: 4,
		});
	}
	return {
		version: 1,
		textPolicy: request.textPolicy,
		readingOrder: elements
			.filter((element) => element.role !== "decoration")
			.map((element) => element.id),
		elements,
		beats: [
			{ id: "build", label: "建立主体", start: 0, end: 0.24 },
			{ id: "hold", label: "保持可读", start: 0.24, end: 0.82 },
			{ id: "resolve", label: "完成收束", start: 0.82, end: 1 },
		],
		constraints: [
			`safe-margin:${visualDNA.composition.safeMargin}`,
			`decoration-budget:${visualDNA.composition.decorationBudget}`,
			"no-unplanned-primary-elements",
			"avoid-timeline-controls-area",
			"keep-hero-readable-during-hold",
		],
	};
}

export function formatShotlyxMGDesignContract({
	visualDNA,
	motionSpec,
}: {
	visualDNA: ShotlyxMGVisualDNA;
	motionSpec: ShotlyxMGMotionSpec;
}): string {
	return [
		`VisualDNA fingerprint: ${visualDNA.fingerprint}`,
		`Visual direction: ${visualDNA.summary}`,
		`VisualDNA JSON: ${JSON.stringify(visualDNA)}`,
		`MotionSpec JSON: ${JSON.stringify(motionSpec)}`,
		"Treat locked colors/fonts and user/data elements as immutable. Repairs may change layout, lightness, outline, spacing, or background, but must not replace a locked hue, font, text, number, or logo.",
		"Design the hero/most complete static frame first. Then animate it with the build-hold-resolve beats. Do not add decorative circles, cards, grids, gradients, or glow unless they have an explicit supporting role within the decoration budget.",
		"Use at most two local or bundled font families with coverage for every requested character. Never fetch a font or silently substitute an explicitly locked font.",
	].join("\n");
}
