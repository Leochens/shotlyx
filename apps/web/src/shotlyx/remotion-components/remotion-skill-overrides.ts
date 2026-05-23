export interface RemotionSkillOverrides {
	/**
	 * Disable official rules that are not usable in Shotlyx yet.
	 * Keep this empty unless a rule repeatedly hurts generation quality.
	 */
	disabledRuleIds: string[];
	/**
	 * Add local trigger words without editing the official skill snapshot.
	 */
	extraTriggersByRuleId: Record<string, string[]>;
	/**
	 * Add Shotlyx-specific instructions after the official rule directives.
	 */
	extraAdapterNotesByRuleId: Record<string, string[]>;
	/**
	 * Notes appended to every generated skill context.
	 */
	globalAdapterNotes: string[];
}

// Edit this file to tune how Shotlyx applies the official Remotion Skill.
// Do not edit official-remotion-skill.ts unless refreshing the upstream snapshot.
export const REMOTION_SKILL_OVERRIDES: RemotionSkillOverrides = {
	disabledRuleIds: [],
	extraTriggersByRuleId: {
		"text-animations": ["中文标题", "大字标题", "字卡", "科普标题"],
		subtitles: ["旁白字幕", "口播字幕", "双语字幕"],
	},
	extraAdapterNotesByRuleId: {
		"text-animations": [
			"For Chinese text, prefer shorter lines, high contrast, and stable safe-area placement over decorative motion.",
		],
		subtitles: [
			"For Chinese subtitles, keep line length conservative and avoid covering the primary subject.",
		],
	},
	globalAdapterNotes: [
		"Generated MG components should feel like editable video graphics, not a standalone web page.",
		"When in doubt, choose fewer stronger motions instead of many small unrelated effects.",
	],
};
