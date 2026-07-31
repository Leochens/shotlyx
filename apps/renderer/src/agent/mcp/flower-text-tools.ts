import type { EditorCore } from "@/core";
import {
	FLOWER_TEXT_PRESETS,
	buildFlowerTextProgressAnimation,
	getFlowerTextParams,
	getFlowerTextPreset,
	type FlowerTextPreset,
} from "@/graphics/definitions/flower-text";
import type { ParamValues } from "@/params";
import type { MediaTime } from "@/wasm";
import type { Tool } from "./types";
import {
	optionalNumberParam,
	optionalStringParam,
	requireNumberParam,
	requireStringParam,
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

function getDefaultPlacement({ preset }: { preset: FlowerTextPreset }): {
	positionX: number;
	positionY: number;
	scale: number;
} {
	if (preset.id.includes("number")) {
		return { positionX: 0.18, positionY: -0.12, scale: 0.78 };
	}
	if (preset.id.includes("bubble")) {
		return { positionX: 0.22, positionY: -0.18, scale: 0.7 };
	}
	if (preset.id.includes("price")) {
		return { positionX: 0.18, positionY: 0.28, scale: 0.68 };
	}
	if (preset.id.includes("arrow")) {
		return { positionX: 0.18, positionY: -0.04, scale: 0.72 };
	}
	return { positionX: 0, positionY: -0.18, scale: 0.74 };
}

function resolveDurationSeconds({ value }: { value: number | undefined }) {
	if (value === undefined || !Number.isFinite(value) || value <= 0) {
		return 2.8;
	}
	return clamp({ value, min: 0.4, max: 30 });
}

function listPresetForAi({ preset }: { preset: FlowerTextPreset }) {
	return {
		id: preset.id,
		name: preset.name,
		defaultText: preset.defaultText,
		keywords: preset.keywords,
		aliases: preset.aliases,
		useCases: preset.useCases,
		editableParams: Object.keys(preset.params),
	};
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

export function buildFlowerTextTools({
	editor,
	deps,
}: {
	editor: EditorCore;
	deps: { mediaTimeFromSeconds: (args: { seconds: number }) => MediaTime };
}): Tool[] {
	const { mediaTimeFromSeconds } = deps;

	return [
		{
			name: "flower_text_list_presets",
			description:
				"List editable flower text sticker presets for Jianying/CapCut-style pop text, emphasis labels, speech bubbles, price tags, and callouts.",
			parameters: {},
			handler: () => ({
				presets: FLOWER_TEXT_PRESETS.map((preset) =>
					listPresetForAi({ preset }),
				),
			}),
		},
		{
			name: "flower_text_insert",
			description:
				"Insert an editable flower text graphic into the timeline. Use for explicit 花字/sticker text requests or short-video key-point emphasis, not routine subtitles or trimming.",
			parameters: {
				presetId: {
					type: "string",
					description:
						"Flower text preset ID from flower_text_list_presets, such as emphasis-pop or speech-bubble.",
				},
				content: {
					type: "string",
					description:
						"Short text to display, preferably 2-12 Chinese characters or 1-4 English words.",
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
				accentColor: {
					type: "string",
					description: "Optional accent color such as #ff3b30.",
					optional: true,
				},
				textColor: {
					type: "string",
					description: "Optional text fill color such as #ffffff.",
					optional: true,
				},
				trackId: {
					type: "string",
					description:
						"Optional target graphic track ID. Omit to auto-place on a graphic track.",
					optional: true,
				},
			},
			mutating: true,
			handler: (params) => {
				const presetId = requireStringParam(params, "presetId");
				const preset = getFlowerTextPreset({ presetId });
				if (!preset) {
					throw new Error(`Unknown flower text preset: ${presetId}`);
				}

				const content = requireStringParam(params, "content").trim();
				if (!content) {
					throw new Error("参数缺失：content 不能为空");
				}
				const startTimeSeconds = requireNumberParam(params, "startTimeSeconds");
				const durationSeconds = resolveDurationSeconds({
					value: optionalNumberParam(params, "durationSeconds"),
				});
				const trackId = optionalStringParam(params, "trackId");
				if (trackId) {
					const track = editor.timeline.getTrackById({ trackId });
					if (!track) {
						throw new Error(`轨道不存在：找不到轨道 "${trackId}"`);
					}
					if (track.type !== "graphic") {
						throw new Error(`类型不匹配：无法将花字插入 ${track.type} 轨道`);
					}
				}

				const defaults = getDefaultPlacement({ preset });
				const positionX =
					optionalNumberParam(params, "positionX") ?? defaults.positionX;
				const positionY =
					optionalNumberParam(params, "positionY") ?? defaults.positionY;
				const scale = clamp({
					value: optionalNumberParam(params, "scale") ?? defaults.scale,
					min: 0.1,
					max: 3,
				});
				const accentColor = optionalStringParam(params, "accentColor");
				const textColor = optionalStringParam(params, "textColor");
				const duration = mediaTimeFromSeconds({ seconds: durationSeconds });

				const paramOverrides: Partial<ParamValues> = {
					content,
					"transform.positionX": positionX,
					"transform.positionY": positionY,
					"transform.scaleX": scale,
					"transform.scaleY": scale,
				};
				if (accentColor) {
					paramOverrides.accentColor = accentColor;
				}
				if (textColor) {
					paramOverrides.textColor = textColor;
				}

				const element = {
					type: "graphic" as const,
					name: preset.name,
					definitionId: preset.definitionId,
					startTime: mediaTimeFromSeconds({ seconds: startTimeSeconds }),
					duration,
					trimStart: mediaTimeFromSeconds({ seconds: 0 }),
					trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
					params: {
						...buildDefaultGraphicElementParams(),
						...getFlowerTextParams({
							preset,
							overrides: paramOverrides,
						}),
					},
					animations: buildFlowerTextProgressAnimation({ duration }),
				};
				const insertion = editor.timeline.insertElement({
					element,
					placement: trackId
						? { mode: "explicit", trackId }
						: { mode: "auto", trackType: "graphic" },
				});
				const selectedElement = editor.selection.getSelectedElements()[0];

				return {
					inserted: true,
					trackId: insertion.trackId ?? selectedElement?.trackId ?? trackId,
					elementId: insertion.elementId ?? selectedElement?.elementId,
					presetId: preset.id,
					name: preset.name,
					content,
					startTime: startTimeSeconds,
					duration: durationSeconds,
					params: element.params,
				};
			},
		},
	];
}
