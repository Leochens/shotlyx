import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import type { ParamValues } from "@/params";
import {
	requireStringParam,
	requireNumberParam,
} from "./validation";

export function buildEffectsTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "effects_add_clip_effect",
			description:
				"Add an effect to a clip. Common effect types: blur, brightness, contrast, " +
				"saturation, hueRotate, vignette, grain. Use timeline_get_clip_details to check existing effects.",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
				},
				elementId: {
					type: "string",
					description: "Clip element ID to add effect to",
				},
				effectType: {
					type: "string",
					description: "Effect type to add",
				},
				params: {
					type: "object",
					description: "Optional initial effect parameters",
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const { effectsRegistry } = await import("@/effects/registry");
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				const effectType = requireStringParam(params, "effectType");

				if (!effectsRegistry.has(effectType)) {
					const available = effectsRegistry
						.getAll()
						.map((e) => e.type)
						.join("、");
					throw new Error(
						`类型不匹配：效果类型 "${effectType}" 未注册。可用类型：${available}`,
					);
				}

				const effectId = editor.timeline.addClipEffect({
					trackId,
					elementId,
					effectType,
				});

				const patchParams = params.params;
				if (
					typeof patchParams === "object" &&
					patchParams !== null &&
					!Array.isArray(patchParams)
				) {
					editor.timeline.updateClipEffectParams({
						trackId,
						elementId,
						effectId,
						params: patchParams as ParamValues,
					});
				}

				return { effectId, effectType };
			},
		},
		{
			name: "effects_remove_clip_effect",
			description: "Remove an effect from a clip",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
				},
				effectId: {
					type: "string",
					description: "Effect ID to remove",
				},
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				const effectId = requireStringParam(params, "effectId");
				editor.timeline.removeClipEffect({ trackId, elementId, effectId });
				return { removed: true, effectId };
			},
		},
		{
			name: "effects_update_clip_effect",
			description: "Update parameters of an effect on a clip",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
				},
				effectId: {
					type: "string",
					description: "Effect ID to update",
				},
				params: {
					type: "object",
					description: "Effect parameter key-value pairs to update",
				},
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				const effectId = requireStringParam(params, "effectId");
				const patchParams = params.params;
				if (
					typeof patchParams !== "object" ||
					patchParams === null ||
					Array.isArray(patchParams)
				) {
					throw new Error('参数格式错误："params" 必须为对象');
				}
				editor.timeline.updateClipEffectParams({
					trackId,
					elementId,
					effectId,
					params: patchParams as ParamValues,
				});
				return {
					updated: true,
					trackId,
					elementId,
					effectId,
					params: patchParams,
				};
			},
		},
		{
			name: "effects_toggle_clip_effect",
			description: "Toggle enabled state of an effect on a clip",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
				},
				effectId: {
					type: "string",
					description: "Effect ID to toggle",
				},
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				const effectId = requireStringParam(params, "effectId");
				editor.timeline.toggleClipEffect({ trackId, elementId, effectId });
				return { toggled: true, trackId, elementId, effectId };
			},
		},
		{
			name: "effects_reorder_clip_effects",
			description:
				"Reorder effects on a clip by moving an effect from one index to another",
			parameters: {
				trackId: {
					type: "string",
					description: "Track ID containing the clip",
				},
				elementId: {
					type: "string",
					description: "Clip element ID",
				},
				fromIndex: {
					type: "number",
					description: "Current index of the effect to move",
				},
				toIndex: {
					type: "number",
					description: "Target index for the effect",
				},
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				const fromIndex = requireNumberParam(params, "fromIndex");
				const toIndex = requireNumberParam(params, "toIndex");
				editor.timeline.reorderClipEffects({
					trackId,
					elementId,
					fromIndex,
					toIndex,
				});
				return {
					reordered: true,
					trackId,
					elementId,
					fromIndex,
					toIndex,
				};
			},
		},
	];
}
