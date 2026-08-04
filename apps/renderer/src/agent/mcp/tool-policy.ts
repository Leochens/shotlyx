import type { Tool, ToolConfirmation, ToolEffect, ToolPolicy } from "./types";

const DESTRUCTIVE_TOOL_NAMES = new Set([
	"effects_remove_clip_effect",
	"project_clear_cover",
	"project_clear_watermark",
	"rough_cut_apply_review",
	"scene_delete",
	"silence_apply_cut_plan",
	"subtitles_cut_filler_words",
	"timeline_delete_clip",
	"timeline_delete_elements",
	"timeline_remove_keyframe",
	"timeline_remove_mask",
	"timeline_remove_track",
]);

const EXTERNAL_TOOL_PREFIXES = [
	"agent_generate_",
	"creative_generate_",
	"stock_",
	"video_semantic_index_analyze",
	"vision_",
	"web_",
] as const;

function inferEffect({
	name,
	mutating,
}: {
	name: string;
	mutating?: boolean;
}): ToolEffect {
	if (DESTRUCTIVE_TOOL_NAMES.has(name)) return "destructive";
	if (EXTERNAL_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) {
		return "external";
	}
	return mutating ? "write" : "read";
}

function inferConfirmation(effect: ToolEffect): ToolConfirmation {
	if (effect === "destructive") return "always";
	if (effect === "external") return "explicit-user-intent";
	return "never";
}

export function resolveToolPolicy({
	name,
	mutating,
	effect,
	confirmation,
	idempotent,
}: Pick<
	Tool,
	"name" | "mutating" | "effect" | "confirmation" | "idempotent"
>): ToolPolicy {
	const resolvedEffect = effect ?? inferEffect({ name, mutating });
	return {
		effect: resolvedEffect,
		confirmation: confirmation ?? inferConfirmation(resolvedEffect),
		idempotent: idempotent ?? resolvedEffect === "read",
	};
}

export function resolveSchemaToolPolicy({
	name,
	policy,
}: {
	name: string;
	policy?: ToolPolicy;
}): ToolPolicy {
	return (
		policy ??
		resolveToolPolicy({
			name,
			mutating: !name.includes("_get_") && !name.startsWith("get_"),
		})
	);
}

export function riskFromToolPolicy(
	policy: ToolPolicy,
): "none" | "destructive" | "irreversible" {
	return policy.effect === "destructive" ? "destructive" : "none";
}
