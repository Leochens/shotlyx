import type { EditorCore } from "@/core";
import { useAgentContextStore } from "@/agent/context/store";
import type { Tool } from "./types";
import type { MediaTime } from "@/wasm";
import type {
	CreateTimelineElement,
	RetimeConfig,
} from "@/timeline";
import type { ParamValue } from "@/params";
import {
	requireStringParam,
	requireNumberParam,
	optionalNumberParam,
	optionalStringParam,
	optionalBooleanParam,
} from "./validation";
import { DEFAULT_RETIME_RATE, buildConstantRetime } from "@/retime";
import type { AnimationInterpolation } from "@/animation/types";
import { motionGraphicDefinitions } from "@/graphics/definitions/motion-graphics";
import {
	buildCalloutGraphicElement,
	buildMosaicEffectElement,
} from "@/callouts/presets";
import { frameRateToFloat } from "@/fps/utils";
import {
	buildTimelineCoverInsertion,
	resolveTimelineCoverDurationSeconds,
} from "@/timeline/cover";

const TRACK_TYPES = ["video", "text", "audio", "graphic", "effect"] as const;
type TrackType = (typeof TRACK_TYPES)[number];
const VISUAL_EFFECT_KINDS = ["arrow", "box", "circle", "mosaic"] as const;
type VisualEffectKind = (typeof VISUAL_EFFECT_KINDS)[number];
type MediaInsertTrackType = "video" | "audio";

function isTrackType(value: unknown): value is TrackType {
	return typeof value === "string" && TRACK_TYPES.some((t) => t === value);
}

function isVisualEffectKind(value: unknown): value is VisualEffectKind {
	return (
		typeof value === "string" &&
		VISUAL_EFFECT_KINDS.some((kind) => kind === value)
	);
}

function buildRetimeForRate({
	rate,
	maintainPitch,
}: {
	rate: number;
	maintainPitch: boolean;
}): RetimeConfig | undefined {
	const retime = buildConstantRetime({ rate, maintainPitch });
	if (retime.rate === DEFAULT_RETIME_RATE && !retime.maintainPitch) {
		return undefined;
	}
	return retime;
}

function getMediaInsertTrackType({
	assetType,
}: {
	assetType: "audio" | "image" | "video";
}): MediaInsertTrackType {
	return assetType === "audio" ? "audio" : "video";
}

function getProjectFpsOrDefault(editor: EditorCore): number {
	const fps = editor.project.getActiveOrNull()?.settings.fps;
	if (!fps) return 30;
	const value = frameRateToFloat(fps);
	return Number.isFinite(value) && value > 0 ? value : 30;
}

function resolveCoverDurationSeconds({
	editor,
	params,
}: {
	editor: EditorCore;
	params: Record<string, unknown>;
}): number {
	return resolveTimelineCoverDurationSeconds({
		durationFrames: optionalNumberParam(params, "durationFrames"),
		durationSeconds: optionalNumberParam(params, "durationSeconds"),
		fps: getProjectFpsOrDefault(editor),
	});
}

function isElementRefArray(value: unknown): value is Array<{
	trackId: string;
	elementId: string;
}> {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item !== null &&
				typeof item === "object" &&
				"trackId" in item &&
				"elementId" in item &&
				typeof item.trackId === "string" &&
				typeof item.elementId === "string",
		)
	);
}

function resolveTrackIdForElement(
	editor: EditorCore,
	elementId: string,
): string | null {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) return null;
	if (scene.tracks.main.elements.some((e) => e.id === elementId)) {
		return scene.tracks.main.id;
	}
	for (const track of scene.tracks.overlay) {
		if (track.elements.some((e) => e.id === elementId)) {
			return track.id;
		}
	}
	for (const track of scene.tracks.audio) {
		if (track.elements.some((e) => e.id === elementId)) {
			return track.id;
		}
	}
	return null;
}

interface ResolvedElement {
	trackId: string;
	elementId: string;
}

function getPrimaryTimelineElementReference(): ResolvedElement | null {
	const state = useAgentContextStore.getState();
	const reference = state.draftReferences.find(
		(item) => item.id === state.primaryReferenceId,
	);
	if (reference?.kind !== "timeline-element") return null;
	const payload = reference.payload;
	return {
		trackId: payload.trackId,
		elementId: payload.elementId,
	};
}

function getPrimaryMediaAssetId(): string | null {
	const state = useAgentContextStore.getState();
	const primary = state.draftReferences.find(
		(item) => item.id === state.primaryReferenceId,
	);
	if (primary?.kind === "media-asset") {
		return primary.payload.mediaAssetId;
	}
	const firstMedia = state.draftReferences.find(
		(item) => item.kind === "media-asset",
	);
	return firstMedia?.kind === "media-asset"
		? firstMedia.payload.mediaAssetId
		: null;
}

/**
 * Unified element resolution: elementId > name fuzzy match > current selection.
 * All element-operating tools should use this instead of requiring trackId/elementId directly.
 */
function resolveElementFromParams(
	editor: EditorCore,
	params: Record<string, unknown>,
): ResolvedElement {
	const elementId = optionalStringParam(params, "elementId");
	const trackId = optionalStringParam(params, "trackId");
	const nameQuery = optionalStringParam(params, "name");

	// 1. Direct ID lookup
	if (elementId) {
		const resolved = trackId || resolveTrackIdForElement(editor, elementId);
		if (!resolved) {
			throw new Error(`片段不存在：找不到 ID 为 "${elementId}" 的片段`);
		}
		return { trackId: resolved, elementId };
	}

	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		throw new Error("状态错误：未加载场景");
	}

	const allTracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];

	// 2. Name fuzzy match
	if (nameQuery) {
		const query = nameQuery.toLowerCase();
		let bestMatch: {
			trackId: string;
			elementId: string;
			score: number;
		} | null = null;
		for (const t of allTracks) {
			for (const el of t.elements) {
				const elName = el.name.toLowerCase();
				let score = 0;
				if (elName === query) {
					score = 3;
				} else if (elName.includes(query) || query.includes(elName)) {
					score = 2;
				} else {
					const mediaId = (el as { mediaId?: string }).mediaId;
					if (mediaId) {
						const asset = editor.media
							.getAssets()
							.find((a) => a.id === mediaId);
						const fileName = asset?.file?.name?.toLowerCase() ?? "";
						if (
							fileName.includes(query) ||
							query.includes(fileName.replace(/\.[^.]+$/, ""))
						) {
							score = 1;
						}
					}
				}
				if (score > 0 && (!bestMatch || score > bestMatch.score)) {
					bestMatch = { trackId: t.id, elementId: el.id, score };
				}
			}
		}
		if (!bestMatch) {
			const allNames = allTracks.flatMap((t) =>
				t.elements.map((el) => `"${el.name}"`),
			);
			throw new Error(
				`找不到名称匹配 "${nameQuery}" 的片段。当前时间线上的片段: ${allNames.join(", ") || "无"}`,
			);
		}
		return { trackId: bestMatch.trackId, elementId: bestMatch.elementId };
	}

	// 3. Agent context primary reference fallback
	const primaryReference = getPrimaryTimelineElementReference();
	if (primaryReference) {
		return primaryReference;
	}

	// 4. Current selection fallback
	const selected = editor.selection.getSelectedElements();
	if (selected.length > 0) {
		return { trackId: selected[0].trackId, elementId: selected[0].elementId };
	}

	// 5. Nothing found
	const allNames = allTracks.flatMap((t) =>
		t.elements.map((el) => `"${el.name}"`),
	);
	throw new Error(
		`无法确定目标片段：未提供 elementId 或 name，且当前无选中元素。时间线上的片段: ${allNames.join(", ") || "无"}`,
	);
}

function checkTrackExists(
	editor: EditorCore,
	trackId: string,
): { ok: true } | { ok: false; error: string; suggestion: string } {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		return {
			ok: false,
			error: "状态错误：未加载场景",
			suggestion: "使用 scene_get_active 检查当前场景状态",
		};
	}
	const allTracks = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	];
	if (!allTracks.some((t) => t.id === trackId)) {
		return {
			ok: false,
			error: `轨道不存在：找不到轨道 "${trackId}"`,
			suggestion: "使用 timeline_get_summary 查看可用轨道",
		};
	}
	return { ok: true };
}

function checkElementExists(
	editor: EditorCore,
	trackId: string,
	elementId: string,
): { ok: true } | { ok: false; error: string; suggestion: string } {
	const trackCheck = checkTrackExists(editor, trackId);
	if (!trackCheck.ok) return trackCheck;

	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene) {
		return {
			ok: false,
			error: "状态错误：未加载场景",
			suggestion: "使用 scene_get_active 检查当前场景状态",
		};
	}

	const track = [
		scene.tracks.main,
		...scene.tracks.overlay,
		...scene.tracks.audio,
	].find((t) => t.id === trackId);

	if (!track || !track.elements.some((e) => e.id === elementId)) {
		return {
			ok: false,
			error: `片段不存在：在轨道 "${trackId}" 中找不到片段 "${elementId}"`,
			suggestion:
				"使用 timeline_get_clip_details 或 timeline_get_summary 查看可用片段",
		};
	}
	return { ok: true };
}

export function buildTimelineTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime };
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;

	return [
		{
			name: "timeline_add_track",
			description: "Add a new track to the timeline",
			parameters: {
				type: {
					type: "string",
					description: "Track type: video, text, audio, graphic, effect",
				},
				index: {
					type: "number",
					description: "Insert position (optional)",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				if (!isTrackType(params.type)) {
					throw new Error(
						`类型不匹配：无效的轨道类型 "${String(params.type)}"`,
					);
				}
				const index =
					params.index === undefined ? undefined : Number(params.index);
				return editor.timeline.addTrack({ type: params.type, index });
			},
		},
		{
			name: "timeline_move_clip",
			description: "Move a clip to a new start time on the same track",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to move",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				newStartTimeSeconds: {
					type: "number",
					description: "New start time in seconds",
				},
			},
			mutating: true,
			handler: (params) => {
				const seconds = requireNumberParam(params, "newStartTimeSeconds");
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const startTime = mediaTimeFromSeconds({ seconds });
				editor.timeline.updateElements({
					updates: [{ trackId, elementId, patch: { startTime } }],
				});
				return { trackId, elementId, newStartTime: seconds };
			},
		},
		{
			name: "timeline_trim_clip",
			description: "Trim a clip's in and out points",
			parameters: {
				elementId: {
					type: "string",
					description: "Clip element ID to trim",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				trimStartSeconds: {
					type: "number",
					description: "New trim start in seconds (offset from clip beginning)",
				},
				trimEndSeconds: {
					type: "number",
					description: "New trim end in seconds (offset from clip end)",
				},
			},
			mutating: true,
			handler: (params) => {
				const trimStartSec = requireNumberParam(params, "trimStartSeconds");
				const trimEndSec = requireNumberParam(params, "trimEndSeconds");
				const { elementId } = resolveElementFromParams(editor, params);
				const trimStart = mediaTimeFromSeconds({ seconds: trimStartSec });
				const trimEnd = mediaTimeFromSeconds({ seconds: trimEndSec });
				editor.timeline.updateElementTrim({
					elementId,
					trimStart,
					trimEnd,
				});
				return { elementId, trimStart: trimStartSec, trimEnd: trimEndSec };
			},
		},
		{
			name: "timeline_split_clip",
			description: "Split a clip at a specific time",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to split",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				splitTimeSeconds: {
					type: "number",
					description:
						"Time to split at, in seconds (relative to timeline start)",
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const seconds = requireNumberParam(params, "splitTimeSeconds");
				const splitTime = mediaTimeFromSeconds({ seconds });
				const result = editor.timeline.splitElements({
					elements: [{ trackId, elementId }],
					splitTime,
					retainSide: "both",
				});
				return {
					trackId,
					elementId,
					splitTime: seconds,
					newElements: result,
				};
			},
		},
		{
			name: "timeline_delete_clip",
			description: "Delete a clip from the timeline (destructive)",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to delete",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				editor.timeline.deleteElements({
					elements: [{ trackId, elementId }],
				});
				return { deleted: true, trackId, elementId };
			},
		},
		{
			name: "timeline_delete_elements",
			description: "Delete multiple elements from the timeline",
			parameters: {
				elementRefs: {
					type: "array",
					description: "Array of { trackId, elementId }",
					items: {
						type: "object",
						description: "Element reference",
						properties: {
							trackId: { type: "string", description: "Track ID" },
							elementId: { type: "string", description: "Element ID" },
						},
					},
				},
			},
			mutating: true,
			handler: (params) => {
				if (!isElementRefArray(params.elementRefs)) {
					throw new Error(
						"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
					);
				}
				editor.timeline.deleteElements({ elements: params.elementRefs });
				return { deleted: params.elementRefs.length };
			},
		},
		{
			name: "timeline_get_summary",
			description:
				"Get a high-level summary of the timeline (track IDs, types, element counts). Does NOT return element details — use timeline_get_track_elements to list elements in a track.",
			parameters: {},
			handler: () => {
				const scene = editor.scenes.getActiveSceneOrNull();
				if (!scene) {
					return { tracks: [], selection: null };
				}
				const tracks = [
					scene.tracks.main,
					...scene.tracks.overlay,
					...scene.tracks.audio,
				];
				return {
					tracks: tracks.map((t) => ({
						id: t.id,
						name: t.name,
						type: t.type,
						elementCount: t.elements.length,
					})),
					selection: editor.selection.getSelectedElements().map((ref) => ({
						trackId: ref.trackId,
						elementId: ref.elementId,
					})),
				};
			},
		},
		{
			name: "timeline_get_track_elements",
			description:
				"List all elements in a specific track with their IDs, names, types, and positions. Use this to discover elementIds when you only know the trackId.",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID to list elements from",
				},
			},
			preconditions: (params) =>
				checkTrackExists(editor, String(params.trackId)),
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const scene = editor.scenes.getActiveSceneOrNull();
				if (!scene) {
					throw new Error("状态错误：未加载场景");
				}
				const track = [
					scene.tracks.main,
					...scene.tracks.overlay,
					...scene.tracks.audio,
				].find((t) => t.id === trackId);
				if (!track) {
					throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
				}
				return {
					trackId: track.id,
					trackName: track.name,
					trackType: track.type,
					elements: track.elements.map((el) => ({
						elementId: el.id,
						name: el.name,
						type: el.type,
						startTime: el.startTime,
						duration: el.duration,
					})),
				};
			},
		},
		{
			name: "timeline_insert_media",
			description:
				"Insert a media asset at a specific time. mediaId can be omitted when the Agent context has a primary media asset reference. " +
				"trackId is optional: omit it for short sound effects or general media insertion so Shotlyx reuses the first compatible track with no overlap and creates a new track only when needed. To insert multiple assets, call this tool once per asset.",
			parameters: {
				trackId: {
					type: "string",
					description:
						"Optional target track ID. Omit for automatic placement, especially for short sound effects.",
					optional: true,
				},
				mediaId: {
					type: "string",
					description: "Media asset ID to insert",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description: "Start time in seconds",
				},
				durationSeconds: {
					type: "number",
					description:
						"Optional custom duration in seconds (defaults to asset duration)",
					optional: true,
				},
			},
			mutating: true,
			preconditions: (params) =>
				typeof params.trackId === "string"
					? checkTrackExists(editor, params.trackId)
					: { ok: true },
			handler: (params) => {
				const trackId = optionalStringParam(params, "trackId");
				const mediaId =
					optionalStringParam(params, "mediaId") ?? getPrimaryMediaAssetId();
				if (!mediaId) {
					throw new Error(
						"参数缺失：mediaId 为空，且 Agent 上下文里没有素材引用",
					);
				}
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds = optionalNumberParam(params, "durationSeconds");

				const asset = editor.media.getAssets().find((a) => a.id === mediaId);
				if (!asset) {
					throw new Error(`片段不存在：找不到媒体资源 "${mediaId}"`);
				}

				if (trackId) {
					const track = editor.timeline.getTrackById({ trackId });
					if (!track) {
						throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
					}

					const trackType = track.type;
					if (asset.type === "audio" && trackType !== "audio") {
						throw new Error(`类型不匹配：无法将音频插入 ${trackType} 轨道`);
					}
					if (
						(asset.type === "video" || asset.type === "image") &&
						trackType !== "video"
					) {
						throw new Error(
							`类型不匹配：无法将 ${asset.type} 插入 ${trackType} 轨道`,
						);
					}
				}

				const startTime = mediaTimeFromSeconds({ seconds: startTimeSeconds });
				const duration =
					durationSeconds !== undefined
						? mediaTimeFromSeconds({ seconds: durationSeconds })
						: mediaTimeFromSeconds({ seconds: asset.duration ?? 5 });

				// Build element based on asset type
				const baseElement = {
					name: asset.name,
					duration,
					startTime,
					trimStart: 0 as MediaTime,
					trimEnd: 0 as MediaTime,
					params: {} as ParamValues,
				};

				let element: CreateTimelineElement;
				if (asset.type === "video") {
					element = {
						...baseElement,
						type: "video",
						mediaId: asset.id,
					};
				} else if (asset.type === "audio") {
					element = {
						...baseElement,
						type: "audio",
						mediaId: asset.id,
						sourceType: "upload",
					};
				} else {
					element = {
						...baseElement,
						type: "image",
						mediaId: asset.id,
					};
				}

				const insertion = editor.timeline.insertElement({
					element,
					placement: trackId
						? { mode: "explicit", trackId }
						: {
								mode: "auto",
								trackType: getMediaInsertTrackType({
									assetType: asset.type,
								}),
							},
				});
				const insertedTrackId = insertion?.trackId ?? trackId ?? null;

				return {
					trackId: insertedTrackId,
					elementId: insertion?.elementId,
					mediaId,
					startTime: startTimeSeconds,
					duration: durationSeconds ?? asset.duration,
					placement: trackId ? "explicit" : "auto",
				};
			},
		},
		{
			name: "timeline_insert_cover",
			description:
				"Insert an image media asset as an exclusive opening cover at timeline start. This shifts every existing element on every track to the right by the cover duration, then inserts the cover image from 0s on the main track.",
			parameters: {
				mediaId: {
					type: "string",
					description:
						"Image media asset ID to use as the cover. Can be omitted when Agent context has a primary image asset reference.",
					optional: true,
				},
				durationFrames: {
					type: "number",
					description:
						"Cover duration in frames. Defaults to 6 frames when durationSeconds is omitted.",
					optional: true,
				},
				durationSeconds: {
					type: "number",
					description:
						"Cover duration in seconds. Takes precedence over durationFrames.",
					optional: true,
				},
				trackId: {
					type: "string",
					description:
						"Optional explicit video track ID. Defaults to the active scene main track.",
					optional: true,
				},
			},
			mutating: true,
			preconditions: (params) =>
				typeof params.trackId === "string"
					? checkTrackExists(editor, params.trackId)
					: { ok: true },
			handler: (params) => {
				const scene = editor.scenes.getActiveSceneOrNull();
				if (!scene) {
					throw new Error("状态错误：未加载场景");
				}

				const mediaId =
					optionalStringParam(params, "mediaId") ?? getPrimaryMediaAssetId();
				if (!mediaId) {
					throw new Error(
						"参数缺失：mediaId 为空，且 Agent 上下文里没有封面图片素材引用",
					);
				}

				const asset = editor.media.getAssets().find((a) => a.id === mediaId);
				if (!asset) {
					throw new Error(`片段不存在：找不到媒体资源 "${mediaId}"`);
				}
				if (asset.type !== "image") {
					throw new Error(
						`类型不匹配：封面必须使用图片素材，当前为 ${asset.type}`,
					);
				}

				const durationSeconds = resolveCoverDurationSeconds({
					editor,
					params,
				});
				const duration = mediaTimeFromSeconds({ seconds: durationSeconds });
				const plan = buildTimelineCoverInsertion({
					asset,
					duration,
					tracks: scene.tracks,
					trackId: optionalStringParam(params, "trackId"),
				});

				if (plan.updates.length > 0) {
					editor.timeline.updateElements({ updates: plan.updates });
				}

				const insertion = editor.timeline.insertElement({
					element: plan.element,
					placement: { mode: "explicit", trackId: plan.trackId },
				});

				return {
					inserted: true,
					mediaId,
					trackId: insertion?.trackId ?? plan.trackId,
					elementId: insertion?.elementId,
					durationSeconds,
					shiftedElementCount: plan.updates.length,
					exclusiveRange: {
						startTimeSeconds: 0,
						durationSeconds,
					},
				};
			},
		},
		{
			name: "timeline_insert_text",
			description:
				"Create a new text element on the timeline. If trackId is omitted, automatically uses or creates a text track.",
			parameters: {
				trackId: {
					type: "string",
					description:
						"Optional target text track ID. Omit to auto-place on a text track.",
					optional: true,
				},
				content: { type: "string", description: "Text content to insert" },
				name: {
					type: "string",
					description: "Optional element name",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description: "Start time in seconds",
				},
				durationSeconds: {
					type: "number",
					description: "Optional text duration in seconds. Defaults to 5.",
					optional: true,
				},
				fontSize: {
					type: "number",
					description: "Optional font size",
					optional: true,
				},
				color: {
					type: "string",
					description: "Optional text color (hex)",
					optional: true,
				},
				fontFamily: {
					type: "string",
					description: "Optional font family",
					optional: true,
				},
				positionX: {
					type: "number",
					description: "Optional canvas X position",
					optional: true,
				},
				positionY: {
					type: "number",
					description: "Optional canvas Y position",
					optional: true,
				},
				scaleX: {
					type: "number",
					description: "Optional horizontal scale",
					optional: true,
				},
				scaleY: {
					type: "number",
					description: "Optional vertical scale",
					optional: true,
				},
				rotate: {
					type: "number",
					description: "Optional rotation in degrees",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const trackId = optionalStringParam(params, "trackId");
				if (trackId) {
					const track = editor.timeline.getTrackById({ trackId });
					if (!track) {
						throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
					}
					if (track.type !== "text") {
						throw new Error(`类型不匹配：无法将文本插入 ${track.type} 轨道`);
					}
				}

				const content = requireStringParam(params, "content");
				if (content.trim().length === 0) {
					throw new Error("参数缺失：content 不能为空");
				}
				const name = optionalStringParam(params, "name");
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds =
					optionalNumberParam(params, "durationSeconds") ?? 5;

				const textParams: ParamValues = {
					content,
					fontSize: 15,
					fontFamily: "Arial",
					color: "#ffffff",
					textAlign: "center",
					fontWeight: "normal",
					fontStyle: "normal",
					textDecoration: "none",
					letterSpacing: 0,
					lineHeight: 1.2,
					"background.enabled": false,
					"background.color": "#000000",
					"background.cornerRadius": 0,
					"background.paddingX": 30,
					"background.paddingY": 42,
					"background.offsetX": 0,
					"background.offsetY": 0,
					"transform.positionX": 0,
					"transform.positionY": 0,
					"transform.scaleX": 1,
					"transform.scaleY": 1,
					"transform.rotate": 0,
					opacity: 1,
					blendMode: "normal",
				};
				const fontSize = optionalNumberParam(params, "fontSize");
				const color = optionalStringParam(params, "color");
				const fontFamily = optionalStringParam(params, "fontFamily");
				const positionX = optionalNumberParam(params, "positionX");
				const positionY = optionalNumberParam(params, "positionY");
				const scaleX = optionalNumberParam(params, "scaleX");
				const scaleY = optionalNumberParam(params, "scaleY");
				const rotate = optionalNumberParam(params, "rotate");

				if (fontSize !== undefined) textParams.fontSize = fontSize;
				if (color !== undefined) textParams.color = color;
				if (fontFamily !== undefined) textParams.fontFamily = fontFamily;
				if (positionX !== undefined)
					textParams["transform.positionX"] = positionX;
				if (positionY !== undefined)
					textParams["transform.positionY"] = positionY;
				if (scaleX !== undefined) textParams["transform.scaleX"] = scaleX;
				if (scaleY !== undefined) textParams["transform.scaleY"] = scaleY;
				if (rotate !== undefined) textParams["transform.rotate"] = rotate;

				const element: CreateTimelineElement = {
					type: "text",
					name: name ?? "Text",
					startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
					duration: mediaTimeFromSeconds({ seconds: durationSeconds }),
					trimStart: mediaTimeFromSeconds({ seconds: 0 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
					params: textParams,
				};

				const insertion = editor.timeline.insertElement({
					element,
					placement: trackId
						? { mode: "explicit", trackId }
						: { mode: "auto", trackType: "text" },
				});
				const selectedElement = editor.selection.getSelectedElements()[0];

				return {
					inserted: true,
					trackId: insertion.trackId ?? selectedElement?.trackId ?? trackId,
					elementId: insertion.elementId ?? selectedElement?.elementId,
					content,
					startTime: startTimeSeconds,
					duration: durationSeconds,
					fontSize,
					color,
					fontFamily,
					positionX,
					positionY,
					scaleX,
					scaleY,
					rotate,
				};
			},
		},
		{
			name: "timeline_insert_visual_effect",
			description:
				"Insert a timed visual effect preset on the timeline. Use this for subtitle-timed arrows, highlight boxes, highlight circles, or a local mosaic/pixelate region. For arrow/box/circle, this creates editable graphic elements with built-in pop/fade animation. For mosaic, this creates a transformable effect-track element.",
			parameters: {
				kind: {
					type: "string",
					description: "Effect preset: arrow, box, circle, or mosaic",
				},
				trackId: {
					type: "string",
					description:
						"Optional target track ID. Use a graphic track for arrow/box/circle, or an effect track for mosaic.",
					optional: true,
				},
				startTimeSeconds: {
					type: "number",
					description:
						"Timeline start time in seconds. Use the matched subtitle cue/token start time when available.",
				},
				durationSeconds: {
					type: "number",
					description:
						"Optional duration in seconds. Defaults to a short callout duration.",
					optional: true,
				},
				color: {
					type: "string",
					description: "Optional callout stroke/fill color, e.g. #facc15",
					optional: true,
				},
				fill: {
					type: "string",
					description:
						"Optional callout fill color. Omit for transparent yellow highlight fill.",
					optional: true,
				},
				positionX: {
					type: "number",
					description: "Optional canvas X offset",
					optional: true,
				},
				positionY: {
					type: "number",
					description: "Optional canvas Y offset",
					optional: true,
				},
				scaleX: {
					type: "number",
					description: "Optional horizontal scale",
					optional: true,
				},
				scaleY: {
					type: "number",
					description: "Optional vertical scale",
					optional: true,
				},
				rotate: {
					type: "number",
					description: "Optional rotation in degrees",
					optional: true,
				},
				strokeWidth: {
					type: "number",
					description: "Optional stroke width for arrow/box/circle",
					optional: true,
				},
				blockSize: {
					type: "number",
					description: "Optional mosaic block size for kind=mosaic",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const kindValue = requireStringParam(params, "kind");
				if (!isVisualEffectKind(kindValue)) {
					throw new Error(
						`类型不匹配：kind 必须是 ${VISUAL_EFFECT_KINDS.join("、")} 之一`,
					);
				}

				const trackId = optionalStringParam(params, "trackId");
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds = optionalNumberParam(params, "durationSeconds");
				const color = optionalStringParam(params, "color");
				const fill = optionalStringParam(params, "fill");
				const positionX = optionalNumberParam(params, "positionX");
				const positionY = optionalNumberParam(params, "positionY");
				const scaleX = optionalNumberParam(params, "scaleX");
				const scaleY = optionalNumberParam(params, "scaleY");
				const rotate = optionalNumberParam(params, "rotate");
				const strokeWidth = optionalNumberParam(params, "strokeWidth");
				const blockSize = optionalNumberParam(params, "blockSize");

				if (trackId) {
					const track = editor.timeline.getTrackById({ trackId });
					if (!track) {
						throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
					}
					const expectedTrackType =
						kindValue === "mosaic" ? "effect" : "graphic";
					if (track.type !== expectedTrackType) {
						throw new Error(
							`类型不匹配：${kindValue} 需要插入 ${expectedTrackType} 轨道，当前是 ${track.type} 轨道`,
						);
					}
				}

				const element =
					kindValue === "mosaic"
						? buildMosaicEffectElement({
								startTimeSeconds,
								durationSeconds,
								blockSize,
								...(positionX !== undefined ? { positionX } : {}),
								...(positionY !== undefined ? { positionY } : {}),
								...(scaleX !== undefined ? { scaleX } : {}),
								...(scaleY !== undefined ? { scaleY } : {}),
								...(rotate !== undefined ? { rotate } : {}),
							})
						: buildCalloutGraphicElement({
								kind: kindValue,
								startTimeSeconds,
								durationSeconds,
								...(color !== undefined ? { color } : {}),
								...(fill !== undefined ? { fill } : {}),
								...(positionX !== undefined ? { positionX } : {}),
								...(positionY !== undefined ? { positionY } : {}),
								...(scaleX !== undefined ? { scaleX } : {}),
								...(scaleY !== undefined ? { scaleY } : {}),
								...(rotate !== undefined ? { rotate } : {}),
								...(strokeWidth !== undefined ? { strokeWidth } : {}),
							});
				const insertion = editor.timeline.insertElement({
					element,
					placement: trackId
						? { mode: "explicit", trackId }
						: {
								mode: "auto",
								trackType: kindValue === "mosaic" ? "effect" : "graphic",
							},
				});

				return {
					inserted: true,
					kind: kindValue,
					trackId: insertion.trackId ?? trackId,
					elementId: insertion.elementId,
					startTime: startTimeSeconds,
					duration: durationSeconds,
				};
			},
		},
		{
			name: "timeline_duplicate_clip",
			description: "Duplicate a clip on the timeline",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to duplicate",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const result = editor.timeline.duplicateElements({
					elements: [{ trackId, elementId }],
				});
				return {
					duplicated: result.length,
					newElements: result,
				};
			},
		},
		{
			name: "timeline_remove_track",
			description: "Remove a track from the timeline",
			parameters: {
				trackId: { type: "string", description: "Track ID to remove" },
			},
			mutating: true,
			preconditions: (params) =>
				checkTrackExists(editor, String(params.trackId)),
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				editor.timeline.removeTrack({ trackId });
				return { removed: true, trackId };
			},
		},
		{
			name: "timeline_get_clip_details",
			description:
				"Get full details of a specific clip (params, effects, keyframes).",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
			},
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);

				const result = editor.timeline.getElementsWithTracks({
					elements: [{ trackId, elementId }],
				});
				const item = result[0];
				if (!item) {
					throw new Error(
						`片段不存在：轨道 "${trackId}" 上找不到片段 "${elementId}"`,
					);
				}

				const { element } = item;
				const graphicDefinition =
					element.type === "graphic"
						? (motionGraphicDefinitions.find(
								(definition) => definition.id === element.definitionId,
							) ?? null)
						: null;
				return {
					id: element.id,
					name: element.name,
					type: element.type,
					definitionId:
						element.type === "graphic" ? element.definitionId : undefined,
					graphicCategory: graphicDefinition?.category,
					startTime: element.startTime,
					duration: element.duration,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
					params: element.params,
					editableGraphicParams: graphicDefinition?.params.map((param) => ({
						key: param.key,
						label: param.label,
						type: param.type,
					})),
					effects:
						(
							element as {
								effects?: Array<{ id: string; type: string; enabled: boolean }>;
							}
						).effects?.map((e) => ({
							id: e.id,
							type: e.type,
							enabled: e.enabled,
						})) ?? [],
					hasKeyframes: Object.values(element.animations ?? {}).some(
						(arr) => Array.isArray(arr) && arr.length > 0,
					),
					hidden: (element as { hidden?: boolean }).hidden ?? false,
				};
			},
		},
		{
			name: "timeline_move_clip_to_track",
			description: "Move a clip to a different track and/or time position",
			parameters: {
				trackId: {
					type: "string",
					description: "Current track ID",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to move",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				targetTrackId: { type: "string", description: "Target track ID" },
				newStartTimeSeconds: {
					type: "number",
					description:
						"New start time in seconds (optional, keeps current if omitted)",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const targetTrackId = requireStringParam(params, "targetTrackId");
				const newStartTimeSeconds = optionalNumberParam(
					params,
					"newStartTimeSeconds",
				);

				const sourceTrack = editor.timeline.getTrackById({ trackId });
				if (!sourceTrack) {
					throw new Error(`轨道不存在：找不到源轨道 "${trackId}"`);
				}

				const element = sourceTrack.elements.find((e) => e.id === elementId);
				if (!element) {
					throw new Error(
						`片段不存在：轨道 "${trackId}" 上找不到片段 "${elementId}"`,
					);
				}

				const newStartTime =
					newStartTimeSeconds !== undefined
						? mediaTimeFromSeconds({ seconds: newStartTimeSeconds })
						: element.startTime;

				editor.timeline.moveElements({
					moves: [
						{
							sourceTrackId: trackId,
							targetTrackId,
							elementId,
							newStartTime,
						},
					],
				});

				return {
					trackId,
					elementId,
					targetTrackId,
					newStartTime: newStartTimeSeconds,
				};
			},
		},
		{
			name: "timeline_update_clip_speed",
			description:
				"Update a video or audio clip playback speed. Use this for requests like 2x speed, half speed, slow motion, fast motion, or reset clip speed. " +
				"rate is the playback multiplier: 1 = normal speed, 2 = twice as fast, 0.5 = half speed. " +
				"maintainPitch preserves audio pitch when possible.",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID to retime",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				rate: {
					type: "number",
					description:
						"Playback speed multiplier. Use 1 for normal, 2 for 2x, 0.5 for half speed.",
				},
				maintainPitch: {
					type: "boolean",
					description:
						"Whether to preserve audio pitch when retiming. Defaults to false.",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const rate = requireNumberParam(params, "rate");
				const maintainPitch =
					optionalBooleanParam(params, "maintainPitch") ?? false;
				const retime = buildRetimeForRate({ rate, maintainPitch });

				editor.timeline.updateElementRetime({
					trackId,
					elementId,
					retime,
				});

				return {
					updated: true,
					trackId,
					elementId,
					rate: retime?.rate ?? DEFAULT_RETIME_RATE,
					maintainPitch: retime?.maintainPitch ?? false,
					retime,
				};
			},
		},
		{
			name: "timeline_update_element_params",
			description:
				"Update appearance/style parameters of a timeline element. " +
				"For position, scale, and rotation, use timeline_transform_element instead (it handles coordinates and bounds automatically). " +
				'IMPORTANT: You must pass trackId, elementId, AND a nested "params" object. ' +
				"Supported keys: opacity, blendMode, volume, muted, " +
				"content, fontSize, color, textAlign, fontWeight, fontStyle, textDecoration, letterSpacing, lineHeight, " +
				"background.enabled, background.color, background.cornerRadius, background.paddingX, background.paddingY, background.offsetX, background.offsetY. " +
				'CORRECT call: { "trackId": "xxx", "elementId": "yyy", "params": { "opacity": 0.5, "fontSize": 24 } }. ' +
				'WRONG call: { "trackId": "xxx", "elementId": "yyy", "opacity": 0.5 } — this will fail.',
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the element",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Element ID to update",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				params: {
					type: "object",
					description:
						'Nested object with parameter key-value pairs. Example: { "opacity": 0.5, "fontSize": 24 }. ' +
						"Do NOT put these keys at the top level — they MUST be inside this params object.",
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const patchParams = params.params;
				if (
					typeof patchParams !== "object" ||
					patchParams === null ||
					Array.isArray(patchParams)
				) {
					throw new Error(
						'参数格式错误："params" 必须为嵌套对象。' +
							'正确格式: { "trackId": "...", "elementId": "...", "params": { "opacity": 0.5 } }。' +
							"不要把 opacity 等键放在顶层。",
					);
				}

				// Validate all values are valid ParamValue types
				for (const [key, value] of Object.entries(patchParams)) {
					if (
						value !== undefined &&
						typeof value !== "number" &&
						typeof value !== "string" &&
						typeof value !== "boolean"
					) {
						throw new Error(
							`类型不匹配：参数 "${key}" 必须为 number、string 或 boolean`,
						);
					}
					if (typeof value === "number" && Number.isNaN(value)) {
						throw new Error(`类型不匹配：参数 "${key}" 不能为 NaN`);
					}
				}

				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId,
							patch: {
								params: patchParams as ParamValues,
							},
						},
					],
				});

				return {
					updated: true,
					trackId,
					elementId,
					params: patchParams,
				};
			},
		},
		{
			name: "timeline_transform_element",
			description:
				"Move, scale, or rotate a timeline element on the canvas. " +
				"Handles coordinate system and bounds automatically — you do NOT need to calculate positions manually. " +
				"Use 'anchor' for common positions (center, top-left, top-right, bottom-left, bottom-right, top-center, bottom-center, left-center, right-center). " +
				"Or use positionX/positionY for precise placement (origin is canvas center, X+ is right, Y+ is down). " +
				"The tool auto-clamps positions to keep the element fully within the canvas. " +
				"Element lookup: provide elementId directly, OR provide 'name' to fuzzy-match by element name (e.g. 'logo', '字幕'). " +
				"If neither is provided, falls back to the current selection.",
			parameters: {
				elementId: {
					type: "string",
					description:
						"Element ID to transform. Optional if 'name' is provided.",
					optional: true,
				},
				name: {
					type: "string",
					description:
						"Element name to fuzzy-match (e.g. 'logo', '背景音乐'). Used when elementId is unknown.",
					optional: true,
				},
				anchor: {
					type: "string",
					description:
						"Semantic position: center, top-left, top-right, bottom-left, bottom-right, top-center, bottom-center, left-center, right-center",
					optional: true,
				},
				positionX: {
					type: "number",
					description:
						"X position (0 = center, positive = right, negative = left). Clamped to canvas bounds.",
					optional: true,
				},
				positionY: {
					type: "number",
					description:
						"Y position (0 = center, positive = down, negative = up). Clamped to canvas bounds.",
					optional: true,
				},
				scaleX: {
					type: "number",
					description: "Horizontal scale factor (1.0 = original size)",
					optional: true,
				},
				scaleY: {
					type: "number",
					description: "Vertical scale factor (1.0 = original size)",
					optional: true,
				},
				rotate: {
					type: "number",
					description: "Rotation in degrees (clockwise)",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);

				const project = editor.project.getActiveOrNull();
				if (!project) {
					throw new Error("状态错误：未加载项目");
				}
				const { canvasSize } = project.settings;
				const canvasW = canvasSize.width;
				const canvasH = canvasSize.height;

				const track = editor.timeline.getTrackById({ trackId });
				const element = track?.elements.find((e) => e.id === elementId);
				if (!element) {
					throw new Error(`片段不存在：找不到片段 "${elementId}"`);
				}

				const mediaId = (element as { mediaId?: string }).mediaId;
				let elemW = canvasW;
				let elemH = canvasH;
				if (mediaId) {
					const asset = editor.media.getAssets().find((a) => a.id === mediaId);
					if (asset?.width && asset?.height) {
						elemW = asset.width;
						elemH = asset.height;
					}
				}

				const currentParams = element.params ?? {};
				const scaleX =
					optionalNumberParam(params, "scaleX") ??
					(currentParams["transform.scaleX"] as number | undefined) ??
					1;
				const scaleY =
					optionalNumberParam(params, "scaleY") ??
					(currentParams["transform.scaleY"] as number | undefined) ??
					1;
				const scaledW = elemW * scaleX;
				const scaledH = elemH * scaleY;

				const maxX = Math.max(0, (canvasW - scaledW) / 2);
				const maxY = Math.max(0, (canvasH - scaledH) / 2);

				let posX: number | undefined;
				let posY: number | undefined;

				const anchor = optionalStringParam(params, "anchor");
				if (anchor) {
					const anchorMap: Record<string, [number, number]> = {
						center: [0, 0],
						"top-left": [-maxX, -maxY],
						"top-right": [maxX, -maxY],
						"bottom-left": [-maxX, maxY],
						"bottom-right": [maxX, maxY],
						"top-center": [0, -maxY],
						"bottom-center": [0, maxY],
						"left-center": [-maxX, 0],
						"right-center": [maxX, 0],
					};
					const pos = anchorMap[anchor];
					if (!pos) {
						throw new Error(
							`参数错误：无效的 anchor "${anchor}"。可选值: ${Object.keys(anchorMap).join(", ")}`,
						);
					}
					[posX, posY] = pos;
				} else {
					posX = optionalNumberParam(params, "positionX");
					posY = optionalNumberParam(params, "positionY");
				}

				if (posX !== undefined) {
					posX = Math.max(-maxX, Math.min(maxX, posX));
				}
				if (posY !== undefined) {
					posY = Math.max(-maxY, Math.min(maxY, posY));
				}

				const patchParams: Record<string, ParamValue> = {};
				if (posX !== undefined) patchParams["transform.positionX"] = posX;
				if (posY !== undefined) patchParams["transform.positionY"] = posY;
				if (optionalNumberParam(params, "scaleX") !== undefined) {
					patchParams["transform.scaleX"] = optionalNumberParam(
						params,
						"scaleX",
					)!;
				}
				if (optionalNumberParam(params, "scaleY") !== undefined) {
					patchParams["transform.scaleY"] = optionalNumberParam(
						params,
						"scaleY",
					)!;
				}
				if (optionalNumberParam(params, "rotate") !== undefined) {
					patchParams["transform.rotate"] = optionalNumberParam(
						params,
						"rotate",
					)!;
				}

				if (Object.keys(patchParams).length === 0) {
					throw new Error(
						"参数缺失：至少需要提供 anchor/positionX/positionY/scaleX/scaleY/rotate 中的一个",
					);
				}

				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId,
							patch: { params: patchParams as ParamValues },
						},
					],
				});

				return {
					updated: true,
					trackId,
					elementId,
					appliedParams: patchParams,
					canvasSize: { width: canvasW, height: canvasH },
					elementSize: { width: elemW, height: elemH },
					bounds: { maxX, maxY },
				};
			},
		},
		{
			name: "timeline_update_text_content",
			description:
				"Quickly update text content and optionally text styling for a text element.",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the text element",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Text element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				content: { type: "string", description: "New text content" },
				fontSize: {
					type: "number",
					description: "Optional font size",
					optional: true,
				},
				color: {
					type: "string",
					description: "Optional text color (hex)",
					optional: true,
				},
				fontFamily: {
					type: "string",
					description: "Optional font family",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const content = requireStringParam(params, "content");
				const fontSize = optionalNumberParam(params, "fontSize");
				const color = optionalStringParam(params, "color");
				const fontFamily = optionalStringParam(params, "fontFamily");

				const patchParams: Record<string, ParamValue> = {
					content,
				};
				if (fontSize !== undefined) patchParams.fontSize = fontSize;
				if (color !== undefined) patchParams.color = color;
				if (fontFamily !== undefined) patchParams.fontFamily = fontFamily;

				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId,
							patch: {
								params: patchParams as ParamValues,
							},
						},
					],
				});

				return {
					updated: true,
					trackId,
					elementId,
					content,
					fontSize,
					color,
					fontFamily,
				};
			},
		},
		{
			name: "timeline_toggle_track_mute",
			description: "Toggle mute state of an audio track",
			parameters: {
				trackId: { type: "string", description: "Audio track ID" },
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				editor.timeline.toggleTrackMute({ trackId });
				return { toggled: true, trackId };
			},
		},
		{
			name: "timeline_toggle_track_visibility",
			description: "Toggle visibility of a track (hide/show)",
			parameters: {
				trackId: { type: "string", description: "Track ID" },
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				editor.timeline.toggleTrackVisibility({ trackId });
				return { toggled: true, trackId };
			},
		},
		{
			name: "timeline_toggle_clip_mute",
			description:
				"Toggle mute state of clip(s). Provide elementRefs array, OR use elementId/name to target a single clip.",
			parameters: {
				elementRefs: {
					type: "array",
					description: "Array of { trackId, elementId } to toggle",
					items: {
						type: "object",
						description: "Element reference",
						properties: {
							trackId: { type: "string", description: "Track ID" },
							elementId: { type: "string", description: "Element ID" },
						},
					},
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Single element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				let refs: Array<{ trackId: string; elementId: string }>;
				if (params.elementRefs !== undefined) {
					if (!isElementRefArray(params.elementRefs)) {
						throw new Error(
							"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
						);
					}
					refs = params.elementRefs;
				} else {
					const resolved = resolveElementFromParams(editor, params);
					refs = [resolved];
				}
				editor.timeline.toggleElementsMuted({ elements: refs });
				return { toggled: refs.length };
			},
		},
		{
			name: "timeline_toggle_clip_visibility",
			description:
				"切换片段显示/隐藏状态。可传 elementRefs 数组，或用 elementId/name 指定单个片段。",
			parameters: {
				elementRefs: {
					type: "array",
					description: "要切换的 { trackId, elementId } 数组",
					items: {
						type: "object",
						description: "片段引用",
						properties: {
							trackId: { type: "string", description: "轨道 ID" },
							elementId: { type: "string", description: "片段 ID" },
						},
					},
					optional: true,
				},
				elementId: {
					type: "string",
					description: "单个片段 ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "片段名称模糊匹配",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				let refs: Array<{ trackId: string; elementId: string }>;
				if (params.elementRefs !== undefined) {
					if (!isElementRefArray(params.elementRefs)) {
						throw new Error(
							"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
						);
					}
					refs = params.elementRefs;
				} else {
					const resolved = resolveElementFromParams(editor, params);
					refs = [resolved];
				}
				editor.timeline.toggleElementsVisibility({ elements: refs });
				return { toggled: refs.length };
			},
		},
		// ------------------------------------------------------------------
		// Keyframes
		// ------------------------------------------------------------------
		{
			name: "timeline_upsert_keyframe",
			description:
				"Add or update a keyframe on a clip property. " +
				"Supported paths: transform.positionX/Y, transform.scaleX/Y, transform.rotate, " +
				"opacity, volume, color, background.color, background.paddingX/Y, background.offsetX/Y, background.cornerRadius. " +
				'Interpolation: "linear", "hold".',
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				propertyPath: {
					type: "string",
					description: "Property path, e.g. transform.positionX",
				},
				timeSeconds: {
					type: "number",
					description: "Keyframe time in seconds (relative to element start)",
				},
				value: {
					type: "number",
					description: "Keyframe value (number, string, or boolean)",
				},
				interpolation: {
					type: "string",
					description:
						'Interpolation type: "linear" or "hold" (default: "linear")',
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const propertyPath = requireStringParam(params, "propertyPath");
				const timeSeconds = requireNumberParam(params, "timeSeconds");
				const value = params.value as ParamValue;
				if (
					value !== undefined &&
					typeof value !== "number" &&
					typeof value !== "string" &&
					typeof value !== "boolean"
				) {
					throw new Error(
						'类型不匹配："value" 必须为 number、string 或 boolean',
					);
				}
				const interpolation = (optionalStringParam(params, "interpolation") ??
					"linear") as AnimationInterpolation;
				if (interpolation !== "linear" && interpolation !== "hold") {
					throw new Error(
						'类型不匹配："interpolation" 必须为 "linear" 或 "hold"',
					);
				}

				const time = mediaTimeFromSeconds({ seconds: timeSeconds });
				editor.timeline.upsertKeyframes({
					keyframes: [
						{
							trackId,
							elementId,
							propertyPath,
							time,
							value,
							interpolation,
						},
					],
				});

				return {
					trackId,
					elementId,
					propertyPath,
					time: timeSeconds,
					value,
					interpolation,
				};
			},
		},
		{
			name: "timeline_remove_keyframe",
			description: "Remove a keyframe from a clip property",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				propertyPath: {
					type: "string",
					description: "Property path of the keyframe",
				},
				keyframeId: { type: "string", description: "Keyframe ID to remove" },
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const propertyPath = requireStringParam(params, "propertyPath");
				const keyframeId = requireStringParam(params, "keyframeId");
				editor.timeline.removeKeyframes({
					keyframes: [{ trackId, elementId, propertyPath, keyframeId }],
				});
				return { removed: true, trackId, elementId, propertyPath, keyframeId };
			},
		},
		{
			name: "timeline_get_keyframes",
			description:
				"Get all keyframes for a clip, optionally filtered by property path",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				propertyPath: {
					type: "string",
					description: "Optional property path filter",
					optional: true,
				},
			},
			handler: async (params) => {
				const { getElementKeyframes } =
					await import("@/animation/keyframe-query");
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const filterPath = optionalStringParam(params, "propertyPath");

				const track = editor.timeline.getTrackById({ trackId });
				if (!track) {
					throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
				}
				const element = track.elements.find((e) => e.id === elementId);
				if (!element) {
					throw new Error(
						`片段不存在：轨道 "${trackId}" 上找不到片段 "${elementId}"`,
					);
				}

				let keyframes = getElementKeyframes({
					animations: element.animations,
				});
				if (filterPath) {
					keyframes = keyframes.filter((k) => k.propertyPath === filterPath);
				}

				return {
					keyframes: keyframes.map((k) => ({
						id: k.id,
						propertyPath: k.propertyPath,
						time: k.time,
						value: k.value,
						interpolation: k.interpolation,
					})),
					count: keyframes.length,
				};
			},
		},
		// ------------------------------------------------------------------
		// Masks
		// ------------------------------------------------------------------
		{
			name: "timeline_add_mask",
			description:
				"Add a mask to a clip. Supported mask types: rectangle, ellipse, split, cinematic-bars, heart, diamond, star, text, freeform. " +
				"Only one mask per clip is supported currently.",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				maskType: {
					type: "string",
					description: "Mask type",
				},
			},
			handler: async (params) => {
				const { buildDefaultMaskInstance } = await import("@/masks");
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const maskType = requireStringParam(params, "maskType");

				const track = editor.timeline.getTrackById({ trackId });
				if (!track) {
					throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
				}
				const element = track.elements.find((e) => e.id === elementId);
				if (!element) {
					throw new Error(
						`片段不存在：轨道 "${trackId}" 上找不到片段 "${elementId}"`,
					);
				}

				const existingMasks = (element as { masks?: unknown[] }).masks ?? [];
				if (existingMasks.length > 0) {
					throw new Error("操作受限：每个片段仅支持一个蒙版，请先移除现有蒙版");
				}

				const mask = buildDefaultMaskInstance({ maskType: maskType as never });
				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId,
							patch: { masks: [mask] } as Partial<
								import("@/timeline").TimelineElement
							>,
						},
					],
				});

				return { maskId: mask.id, maskType };
			},
		},
		{
			name: "timeline_update_mask",
			description: "Update mask parameters on a clip",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				maskId: { type: "string", description: "Mask ID to update" },
				params: {
					type: "object",
					description: "Mask parameter key-value pairs to update",
				},
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const maskId = requireStringParam(params, "maskId");
				const patchParams = params.params;
				if (
					typeof patchParams !== "object" ||
					patchParams === null ||
					Array.isArray(patchParams)
				) {
					throw new Error('参数格式错误："params" 必须为对象');
				}

				const track = editor.timeline.getTrackById({ trackId });
				if (!track) {
					throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
				}
				const element = track.elements.find((e) => e.id === elementId);
				if (!element) {
					throw new Error(
						`片段不存在：轨道 "${trackId}" 上找不到片段 "${elementId}"`,
					);
				}

				const masks =
					(
						element as {
							masks?: Array<{ id: string; params: Record<string, unknown> }>;
						}
					).masks ?? [];
				const mask = masks.find((m) => m.id === maskId);
				if (!mask) {
					throw new Error(
						`片段不存在：片段 "${elementId}" 上找不到蒙版 "${maskId}"`,
					);
				}

				const updatedMask = {
					...mask,
					params: { ...mask.params, ...patchParams },
				};
				const updatedMasks = masks.map((m) =>
					m.id === maskId ? updatedMask : m,
				);

				editor.timeline.updateElements({
					updates: [
						{
							trackId,
							elementId,
							patch: { masks: updatedMasks } as Partial<
								import("@/timeline").TimelineElement
							>,
						},
					],
				});

				return { updated: true, maskId, params: patchParams };
			},
		},
		{
			name: "timeline_remove_mask",
			description: "Remove a mask from a clip",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
					optional: true,
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
					optional: true,
				},
				name: {
					type: "string",
					description: "Element name to fuzzy-match",
					optional: true,
				},
				maskId: { type: "string", description: "Mask ID to remove" },
			},
			mutating: true,
			handler: (params) => {
				const { trackId, elementId } = resolveElementFromParams(editor, params);
				const maskId = requireStringParam(params, "maskId");
				editor.timeline.removeMask({ trackId, elementId, maskId });
				return { removed: true, maskId };
			},
		},
		// ------------------------------------------------------------------
		// Batch operations (Phase 7)
		// ------------------------------------------------------------------
		{
			name: "timeline_batch_update",
			description:
				"批量更新多个片段的参数。只需提供 elementId，系统会自动查找所在轨道。",
			parameters: {
				updates: {
					type: "array",
					description: "更新项数组，每项包含 elementId 和 params",
					items: {
						type: "object",
						description: "更新项",
						properties: {
							elementId: {
								type: "string",
								description: "片段 ID",
							},
							params: {
								type: "object",
								description: "参数键值对",
							},
						},
					},
				},
			},
			mutating: true,
			handler: (params) => {
				const updates = params.updates;
				if (!Array.isArray(updates)) {
					throw new Error('参数缺失："updates" 必须为数组');
				}
				if (updates.length === 0) {
					return { updated: 0 };
				}

				const resolvedUpdates: Array<{
					trackId: string;
					elementId: string;
					patch: { params: ParamValues };
				}> = [];

				for (const update of updates) {
					if (
						typeof update !== "object" ||
						update === null ||
						typeof update.elementId !== "string" ||
						typeof update.params !== "object" ||
						update.params === null ||
						Array.isArray(update.params)
					) {
						throw new Error(
							"参数格式错误：每个更新项必须包含 elementId (string) 和 params (object)",
						);
					}

					const trackId = resolveTrackIdForElement(editor, update.elementId);
					if (!trackId) {
						throw new Error(
							`片段不存在：找不到 ID 为 "${update.elementId}" 的片段`,
						);
					}

					// Validate all param values
					for (const [key, value] of Object.entries(update.params)) {
						if (
							value !== undefined &&
							typeof value !== "number" &&
							typeof value !== "string" &&
							typeof value !== "boolean"
						) {
							throw new Error(
								`类型不匹配：参数 "${key}" 必须为 number、string 或 boolean`,
							);
						}
						if (typeof value === "number" && Number.isNaN(value)) {
							throw new Error(`类型不匹配：参数 "${key}" 不能为 NaN`);
						}
					}

					resolvedUpdates.push({
						trackId,
						elementId: update.elementId,
						patch: { params: update.params as ParamValues },
					});
				}

				editor.timeline.updateElements({
					updates: resolvedUpdates,
				});

				return { updated: updates.length };
			},
		},
	];
}
