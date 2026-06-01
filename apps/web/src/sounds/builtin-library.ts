import type { SoundEffect } from "@/sounds/types";

export type BuiltInSoundKind =
	| "whoosh"
	| "pop"
	| "click"
	| "chime"
	| "riser"
	| "impact"
	| "tick"
	| "camera";

export interface BuiltInSoundEffectDefinition extends SoundEffect {
	synthesis: {
		kind: BuiltInSoundKind;
		seed: number;
	};
}

interface BuiltInSoundSearchOptions {
	query: string;
	page: number;
	pageSize: number;
}

interface BuiltInSoundSearchResult {
	count: number;
	next: string | null;
	previous: string | null;
	results: SoundEffect[];
}

const BUILT_IN_CREATED_AT = "2026-06-01T00:00:00.000Z";
const BUILT_IN_USERNAME = "Shotlyx";
const BUILT_IN_LICENSE = "Shotlyx Built-in";
const BUILT_IN_SAMPLE_RATE = 44_100;
const BUILT_IN_BIT_DEPTH = 16;
const BUILT_IN_CHANNELS = 1;
const BUILT_IN_BITRATE = BUILT_IN_SAMPLE_RATE * BUILT_IN_BIT_DEPTH;

function builtInAudioUrl(id: number) {
	return `/api/sounds/builtin?id=${id}`;
}

function estimateWavFileSize({ duration }: { duration: number }) {
	return 44 + Math.ceil(duration * BUILT_IN_SAMPLE_RATE) * 2;
}

function defineBuiltInSound({
	id,
	name,
	description,
	duration,
	tags,
	downloads,
	rating,
	ratingCount,
	synthesis,
}: {
	id: number;
	name: string;
	description: string;
	duration: number;
	tags: string[];
	downloads: number;
	rating: number;
	ratingCount: number;
	synthesis: BuiltInSoundEffectDefinition["synthesis"];
}): BuiltInSoundEffectDefinition {
	const url = builtInAudioUrl(id);
	return {
		id,
		name,
		description,
		url,
		previewUrl: url,
		downloadUrl: url,
		duration,
		filesize: estimateWavFileSize({ duration }),
		type: "wav",
		channels: BUILT_IN_CHANNELS,
		bitrate: BUILT_IN_BITRATE,
		bitdepth: BUILT_IN_BIT_DEPTH,
		samplerate: BUILT_IN_SAMPLE_RATE,
		username: BUILT_IN_USERNAME,
		tags,
		license: BUILT_IN_LICENSE,
		created: BUILT_IN_CREATED_AT,
		downloads,
		rating,
		ratingCount,
		synthesis,
	};
}

const BUILT_IN_SOUND_EFFECT_DEFINITIONS: BuiltInSoundEffectDefinition[] = [
	defineBuiltInSound({
		id: -10_001,
		name: "Soft Whoosh",
		description: "Short airy transition sweep for cuts and title reveals.",
		duration: 0.72,
		tags: ["whoosh", "transition", "sweep", "motion", "sfx"],
		downloads: 12_400,
		rating: 4.8,
		ratingCount: 96,
		synthesis: { kind: "whoosh", seed: 11 },
	}),
	defineBuiltInSound({
		id: -10_002,
		name: "Clean Pop",
		description: "Compact UI pop for metric reveals, stickers, and callouts.",
		duration: 0.32,
		tags: ["pop", "ui", "accent", "reveal", "sfx"],
		downloads: 10_900,
		rating: 4.7,
		ratingCount: 88,
		synthesis: { kind: "pop", seed: 17 },
	}),
	defineBuiltInSound({
		id: -10_003,
		name: "Digital Click",
		description: "Crisp click for switches, cursors, and data point emphasis.",
		duration: 0.18,
		tags: ["click", "digital", "ui", "data", "tick", "sfx"],
		downloads: 9_650,
		rating: 4.6,
		ratingCount: 74,
		synthesis: { kind: "click", seed: 23 },
	}),
	defineBuiltInSound({
		id: -10_004,
		name: "Bright Ding",
		description: "Small positive chime for completed actions and highlights.",
		duration: 0.86,
		tags: ["ding", "chime", "positive", "notification", "sfx"],
		downloads: 8_880,
		rating: 4.8,
		ratingCount: 81,
		synthesis: { kind: "chime", seed: 31 },
	}),
	defineBuiltInSound({
		id: -10_005,
		name: "Short Riser",
		description: "Subtle build-up for section changes and quick transitions.",
		duration: 1.1,
		tags: ["riser", "transition", "build", "whoosh", "sfx"],
		downloads: 7_920,
		rating: 4.5,
		ratingCount: 67,
		synthesis: { kind: "riser", seed: 37 },
	}),
	defineBuiltInSound({
		id: -10_006,
		name: "Soft Impact",
		description: "Rounded hit for title landings and key visual beats.",
		duration: 0.58,
		tags: ["impact", "hit", "boom", "landing", "sfx"],
		downloads: 7_300,
		rating: 4.6,
		ratingCount: 59,
		synthesis: { kind: "impact", seed: 41 },
	}),
	defineBuiltInSound({
		id: -10_007,
		name: "Data Tick",
		description: "Light ticking cue for charts, counters, and table reveals.",
		duration: 0.24,
		tags: ["tick", "data", "click", "counter", "sfx"],
		downloads: 6_940,
		rating: 4.5,
		ratingCount: 52,
		synthesis: { kind: "tick", seed: 43 },
	}),
	defineBuiltInSound({
		id: -10_008,
		name: "Camera Snap",
		description:
			"Quick shutter-like cue for screenshots and before-after beats.",
		duration: 0.36,
		tags: ["camera", "snap", "shutter", "click", "sfx"],
		downloads: 6_480,
		rating: 4.4,
		ratingCount: 49,
		synthesis: { kind: "camera", seed: 47 },
	}),
];

const BUILT_IN_SOUND_EFFECTS: SoundEffect[] =
	BUILT_IN_SOUND_EFFECT_DEFINITIONS.map(
		({ synthesis: _synthesis, ...sound }) => ({
			...sound,
		}),
	);

function normalizeSearchText(value: string) {
	return value.toLowerCase().trim();
}

function tokenizeQuery(query: string) {
	return normalizeSearchText(query)
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function scoreSound({
	sound,
	tokens,
}: {
	sound: SoundEffect;
	tokens: string[];
}) {
	if (tokens.length === 0) return 1;
	const haystacks = [
		sound.name,
		sound.description,
		sound.username,
		sound.tags.join(" "),
	]
		.map(normalizeSearchText)
		.join(" ");

	let score = 0;
	for (const token of tokens) {
		if (!haystacks.includes(token)) return 0;
		if (normalizeSearchText(sound.name).includes(token)) score += 3;
		if (sound.tags.some((tag) => normalizeSearchText(tag) === token))
			score += 2;
		score += 1;
	}
	return score;
}

function buildPaginationUrl({
	query,
	page,
	pageSize,
}: {
	query: string;
	page: number;
	pageSize: number;
}) {
	const params = new URLSearchParams({
		page: page.toString(),
		page_size: pageSize.toString(),
		sort: "downloads",
		type: "effects",
	});
	if (query.trim()) params.set("q", query.trim());
	return `/api/sounds/search?${params.toString()}`;
}

export function getBuiltInSoundEffects(): SoundEffect[] {
	return BUILT_IN_SOUND_EFFECTS;
}

export function getBuiltInSoundEffectDefinitions(): BuiltInSoundEffectDefinition[] {
	return BUILT_IN_SOUND_EFFECT_DEFINITIONS;
}

export function getBuiltInSoundEffectById(id: number): SoundEffect | null {
	return BUILT_IN_SOUND_EFFECTS.find((sound) => sound.id === id) ?? null;
}

export function getBuiltInSoundEffectDefinitionById(
	id: number,
): BuiltInSoundEffectDefinition | null {
	return (
		BUILT_IN_SOUND_EFFECT_DEFINITIONS.find((sound) => sound.id === id) ?? null
	);
}

export function searchBuiltInSoundEffects({
	query,
	page,
	pageSize,
}: BuiltInSoundSearchOptions): BuiltInSoundSearchResult {
	const safePage = Math.max(1, Math.floor(page));
	const safePageSize = Math.max(1, Math.floor(pageSize));
	const tokens = tokenizeQuery(query);
	const scored = BUILT_IN_SOUND_EFFECTS.map((sound, index) => ({
		sound,
		index,
		score: scoreSound({ sound, tokens }),
	})).filter(({ score }) => score > 0);
	const filtered = scored
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map(({ sound }) => sound);
	const startIndex = (safePage - 1) * safePageSize;
	const endIndex = startIndex + safePageSize;
	const results = filtered.slice(startIndex, endIndex);

	return {
		count: filtered.length,
		next:
			endIndex < filtered.length
				? buildPaginationUrl({
						query,
						page: safePage + 1,
						pageSize: safePageSize,
					})
				: null,
		previous:
			safePage > 1 && filtered.length > 0
				? buildPaginationUrl({
						query,
						page: safePage - 1,
						pageSize: safePageSize,
					})
				: null,
		results,
	};
}
