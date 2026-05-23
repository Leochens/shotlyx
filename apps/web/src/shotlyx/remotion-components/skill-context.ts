import {
	OFFICIAL_REMOTION_SKILL_RULES,
	OFFICIAL_REMOTION_SKILL_SOURCE,
	getOfficialRemotionSkillRuleSourceUrl,
	type OfficialRemotionSkillRule,
} from "./official-remotion-skill";
import { REMOTION_SKILL_OVERRIDES } from "./remotion-skill-overrides";

export type RemotionSkillRule = OfficialRemotionSkillRule;

const ALWAYS_ON_RULE_IDS = new Set(["shotlyx-runtime-adapter", "animations"]);

function normalizeText({ prompt, styleGuide }: RemotionSkillRequest): string {
	return `${prompt} ${styleGuide ?? ""}`.toLowerCase();
}

function scoreRule({
	rule,
	text,
}: {
	rule: RemotionSkillRule;
	text: string;
}): number {
	const triggers = [
		...rule.triggers,
		...(REMOTION_SKILL_OVERRIDES.extraTriggersByRuleId[rule.id] ?? []),
	];
	return triggers.reduce((score, trigger) => {
		return text.includes(trigger.toLowerCase()) ? score + 1 : score;
	}, 0);
}

export interface RemotionSkillRequest {
	prompt: string;
	styleGuide?: string;
	maxRules?: number;
}

export interface RemotionSkillContextSummary {
	source: {
		repository: string;
		commit: string;
		skillPath: string;
	};
	selectedRules: Array<{
		id: string;
		sourcePath: string;
		sourceUrl: string;
	}>;
	overrideFile: string;
	globalAdapterNotes: string[];
}

export function selectRemotionSkillRules({
	prompt,
	styleGuide,
	maxRules = 8,
}: RemotionSkillRequest): RemotionSkillRule[] {
	const text = normalizeText({ prompt, styleGuide });
	const enabledRules = OFFICIAL_REMOTION_SKILL_RULES.filter(
		(rule) => !REMOTION_SKILL_OVERRIDES.disabledRuleIds.includes(rule.id),
	);
	const alwaysOnRules = enabledRules.filter((rule) =>
		ALWAYS_ON_RULE_IDS.has(rule.id),
	);
	const scoredRules = enabledRules
		.filter((rule) => !alwaysOnRules.includes(rule))
		.map((rule) => ({ rule, score: scoreRule({ rule, text }) }))
		.filter(({ score }) => score > 0)
		.sort((left, right) => {
			if (right.score !== left.score) return right.score - left.score;
			const impactOrder = { critical: 0, high: 1, medium: 2, low: 3 };
			const impactDelta =
				impactOrder[left.rule.impact] - impactOrder[right.rule.impact];
			if (impactDelta !== 0) return impactDelta;
			return (
				OFFICIAL_REMOTION_SKILL_RULES.indexOf(left.rule) -
				OFFICIAL_REMOTION_SKILL_RULES.indexOf(right.rule)
			);
		})
		.map(({ rule }) => rule);

	return [...alwaysOnRules, ...scoredRules].slice(0, Math.max(1, maxRules));
}

export function buildRemotionSkillContextSummary({
	prompt,
	styleGuide,
	maxRules,
}: RemotionSkillRequest): RemotionSkillContextSummary {
	const rules = selectRemotionSkillRules({
		prompt,
		styleGuide,
		maxRules,
	});
	return {
		source: {
			repository: OFFICIAL_REMOTION_SKILL_SOURCE.repository,
			commit: OFFICIAL_REMOTION_SKILL_SOURCE.commit,
			skillPath: OFFICIAL_REMOTION_SKILL_SOURCE.skillPath,
		},
		selectedRules: rules.map((rule) => ({
			id: rule.id,
			sourcePath: rule.sourcePath,
			sourceUrl: getOfficialRemotionSkillRuleSourceUrl({ rule }),
		})),
		overrideFile:
			"apps/web/src/shotlyx/remotion-components/remotion-skill-overrides.ts",
		globalAdapterNotes: REMOTION_SKILL_OVERRIDES.globalAdapterNotes,
	};
}

export function formatRemotionSkillSummary({
	summary,
}: {
	summary: RemotionSkillContextSummary;
}): string {
	return [
		`official=${summary.source.repository}@${summary.source.commit.slice(0, 7)}`,
		`rules=${summary.selectedRules.map((rule) => rule.id).join(", ")}`,
		`override=${summary.overrideFile}`,
	].join(" | ");
}

function formatRule({ rule }: { rule: RemotionSkillRule }): string[] {
	const extraAdapterNotes =
		REMOTION_SKILL_OVERRIDES.extraAdapterNotesByRuleId[rule.id] ?? [];
	return [
		`Rule: ${rule.description} (${rule.id})`,
		`Official source: ${getOfficialRemotionSkillRuleSourceUrl({ rule })}`,
		"Official directives:",
		...rule.officialDirectives.map((line) => `- ${line}`),
		"Shotlyx adapter:",
		...[...rule.shotlyxAdapterNotes, ...extraAdapterNotes].map(
			(line) => `- ${line}`,
		),
	];
}

export function buildRemotionSkillContext({
	prompt,
	styleGuide,
	maxRules,
}: RemotionSkillRequest): string {
	const rules = selectRemotionSkillRules({
		prompt,
		styleGuide,
		maxRules,
	});
	return [
		"Shotlyx Remotion skill context:",
		`Official skill: ${OFFICIAL_REMOTION_SKILL_SOURCE.repository}/tree/${OFFICIAL_REMOTION_SKILL_SOURCE.commit}/${OFFICIAL_REMOTION_SKILL_SOURCE.skillPath}`,
		`Install command: ${OFFICIAL_REMOTION_SKILL_SOURCE.installCommand}`,
		"Editable Shotlyx override file: apps/web/src/shotlyx/remotion-components/remotion-skill-overrides.ts",
		"Use the selected official Remotion Skill rules below, then apply the Shotlyx adapter notes where the official full-project examples conflict with the current generated-component runtime.",
		"Global Shotlyx adapter notes:",
		...REMOTION_SKILL_OVERRIDES.globalAdapterNotes.map((line) => `- ${line}`),
		...rules.flatMap((rule) => formatRule({ rule })),
	].join("\n");
}
