import type { EditorCore } from "@/core";
import {
	ANIMATED_STICKER_PRESETS,
	buildAnimatedStickerProgressAnimation,
	getAnimatedStickerParams,
	getAnimatedStickerPreset,
	type AnimatedStickerPreset,
} from "@/graphics/definitions/animated-stickers";
import type { ParamValues } from "@/params";
import type { AnimatedStickerAsset } from "@/services/storage/types";
import {
	insertAnimatedStickerLibraryItem,
	type AnimatedStickerLibraryItem,
} from "@/stickers/animated-user-stickers";
import type { MediaTime } from "@/wasm/media-time";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireNumberParam,
} from "./validation";

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.max(min, Math.min(max, value));
}

function resolveDurationSeconds({ value }: { value: number | undefined }) {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		return 2.5;
	}
	return clamp({ value, min: 0.4, max: 30 });
}

function buildDefaultGraphicElementParams(): ParamValues {
	return {
		"transform.positionX": 0,
		"transform.positionY": 0,
		"transform.scaleX": 1,
		"transform.scaleY": 1,
		"transform.rotate": 0,
		opacity: 1,
		blendMode: "normal",
	};
}

function listBuiltInPreset({ preset }: { preset: AnimatedStickerPreset }) {
	return {
		id: preset.id,
		name: preset.name,
		keywords: preset.keywords,
		useCases: preset.useCases,
		source: "built-in",
	};
}

function listUploadedItem({ item }: { item: AnimatedStickerAsset }) {
	return {
		id: item.id,
		name: item.name,
		type: item.type,
		duration: item.duration,
		width: item.width,
		height: item.height,
		mimeType: item.file.type,
		source: "uploaded",
	};
}

function scoreCandidate({
	query,
	name,
	keywords = [],
}: {
	query: string;
	name: string;
	keywords?: string[];
}): number {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) return 0;
	const normalizedName = name.toLowerCase();
	if (normalizedName === normalizedQuery) return 4;
	if (normalizedName.includes(normalizedQuery)) return 3;
	if (keywords.some((keyword) => keyword.toLowerCase() === normalizedQuery)) {
		return 2;
	}
	if (keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery))) {
		return 1;
	}
	return 0;
}

function resolveUploadedItem({
	items,
	stickerId,
	query,
}: {
	items: AnimatedStickerLibraryItem[];
	stickerId?: string;
	query?: string;
}): AnimatedStickerLibraryItem | null {
	if (stickerId) {
		return items.find((item) => item.id === stickerId) ?? null;
	}
	if (!query) return null;
	let best: { item: AnimatedStickerLibraryItem; score: number } | null = null;
	for (const item of items) {
		const score = scoreCandidate({ query, name: item.name });
		if (score > 0 && (!best || score > best.score)) {
			best = { item, score };
		}
	}
	return best?.item ?? null;
}

function resolveBuiltInPreset({
	stickerId,
	query,
}: {
	stickerId?: string;
	query?: string;
}): AnimatedStickerPreset | null {
	if (stickerId) {
		return getAnimatedStickerPreset({ presetId: stickerId }) ?? null;
	}
	if (!query) return null;
	let best: { preset: AnimatedStickerPreset; score: number } | null = null;
	for (const preset of ANIMATED_STICKER_PRESETS) {
		const score = scoreCandidate({
			query,
			name: preset.name,
			keywords: [...preset.keywords, ...preset.useCases],
		});
		if (score > 0 && (!best || score > best.score)) {
			best = { preset, score };
		}
	}
	return best?.preset ?? null;
}

export function buildAnimatedStickerTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: {
		mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime;
		loadUploadedStickers?: () => Promise<AnimatedStickerLibraryItem[]>;
	};
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;
	const loadUploadedStickers =
		deps.loadUploadedStickers ??
		(async () => {
			const { storageService } = await import("@/services/storage/service");
			return storageService.loadAnimatedStickerAssets();
		});

	return [
		{
			name: "animated_sticker_list_presets",
			description:
				"List built-in animated stickers and user-uploaded motion stickers. Use before choosing pop effects, reaction GIFs, animated arrows, hearts, confetti, alerts, or transparent motion sticker overlays.",
			parameters: {},
			handler: async () => {
				const uploaded = await loadUploadedStickers();
				return {
					builtIn: ANIMATED_STICKER_PRESETS.map((preset) =>
						listBuiltInPreset({ preset }),
					),
					uploaded: uploaded.map((item) => listUploadedItem({ item })),
				};
			},
		},
		{
			name: "animated_sticker_insert",
			description:
				"Insert a built-in animated sticker or a user-uploaded motion sticker/GIF/video overlay. Use for short-video emphasis, reactions, pop effects, arrows, alerts, confetti, hearts, and visual beats.",
			parameters: {
				source: {
					type: "string",
					description:
						"Optional source: built-in or uploaded. Omit to search both.",
					optional: true,
				},
				stickerId: {
					type: "string",
					description:
						"Sticker ID from animated_sticker_list_presets. Optional if query is provided.",
					optional: true,
				},
				query: {
					type: "string",
					description:
						"Search text when stickerId is not known, such as sparkle, confetti, heart, arrow, GIF name, or uploaded sticker name.",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description: "Start time in seconds.",
				},
				durationSeconds: {
					type: "number",
					description: "Optional duration in seconds.",
					optional: true,
				},
				positionX: {
					type: "number",
					description:
						"Optional normalized X offset. 0 is center; negative is left, positive is right.",
					optional: true,
				},
				positionY: {
					type: "number",
					description:
						"Optional normalized Y offset. 0 is center; negative is up, positive is down.",
					optional: true,
				},
				scale: {
					type: "number",
					description: "Optional uniform scale multiplier.",
					optional: true,
				},
				trackId: {
					type: "string",
					description:
						"Optional target track ID. Built-ins use graphic tracks; uploaded motion stickers use video tracks.",
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const source = optionalStringParam(params, "source");
				if (source && source !== "built-in" && source !== "uploaded") {
					throw new Error("source must be built-in or uploaded");
				}
				const stickerId = optionalStringParam(params, "stickerId");
				const query = optionalStringParam(params, "query");
				if (!stickerId && !query) {
					throw new Error("参数缺失：stickerId 或 query 至少提供一个");
				}
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds = resolveDurationSeconds({
					value: optionalNumberParam(params, "durationSeconds"),
				});
				const trackId = optionalStringParam(params, "trackId");
				const positionX = optionalNumberParam(params, "positionX") ?? 0;
				const positionY = optionalNumberParam(params, "positionY") ?? -0.12;
				const scale = clamp({
					value: optionalNumberParam(params, "scale") ?? 0.72,
					min: 0.1,
					max: 3,
				});
				const startTime = mediaTimeFromSeconds({ seconds: startTimeSeconds });
				const duration = mediaTimeFromSeconds({ seconds: durationSeconds });

				if (source !== "uploaded") {
					const preset = resolveBuiltInPreset({ stickerId, query });
					if (preset) {
						const element = {
							type: "graphic" as const,
							name: preset.name,
							definitionId: preset.definitionId,
							startTime,
							duration,
							trimStart: mediaTimeFromSeconds({ seconds: 0 }),
							trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
							params: {
								...buildDefaultGraphicElementParams(),
								...getAnimatedStickerParams({
									preset,
									overrides: {
										"transform.positionX": positionX,
										"transform.positionY": positionY,
										"transform.scaleX": scale,
										"transform.scaleY": scale,
									},
								}),
							},
							animations: buildAnimatedStickerProgressAnimation({ duration }),
						};
						const insertion = editor.timeline.insertElement({
							element,
							placement: trackId
								? { mode: "explicit", trackId }
								: { mode: "auto", trackType: "graphic" },
						});
						return {
							inserted: true,
							source: "built-in",
							stickerId: preset.id,
							name: preset.name,
							elementId: insertion.elementId,
							trackId: insertion.trackId,
						};
					}
				}

				const uploaded = await loadUploadedStickers();
				const item = resolveUploadedItem({ items: uploaded, stickerId, query });
				if (!item) {
					throw new Error(
						`Unknown animated sticker: ${stickerId ?? query ?? "missing"}`,
					);
				}
				const insertion = await insertAnimatedStickerLibraryItem({
					editor,
					item,
					startTime,
					placement: trackId
						? { mode: "explicit", trackId }
						: { mode: "auto", trackType: "video" },
				});

				return {
					inserted: true,
					source: "uploaded",
					stickerId: item.id,
					name: item.name,
					...insertion,
				};
			},
		},
	];
}
