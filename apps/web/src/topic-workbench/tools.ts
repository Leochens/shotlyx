import type { FunctionSchema } from "@/agent/mcp/schema";
import type { ToolResult } from "@/agent/mcp/types";
import { useTopicWorkbenchStore } from "./store";
import type {
	ResearchSourceDraft,
	TopicCandidateDraft,
	VideoStructureOptionDraft,
} from "./model";
import type { ResearchPlatform, TopicPlatform, TopicStage } from "./types";

export const TOPIC_WORKBENCH_TOOL_NAMES = new Set([
	"topic_workbench_set_candidates",
	"topic_workbench_set_research_sources",
	"topic_workbench_set_structure_options",
	"topic_workbench_reset_stage",
]);

function stringParam({
	description,
	optional = false,
}: {
	description: string;
	optional?: boolean;
}) {
	return { type: "string", description, optional };
}

function arrayParam({
	description,
	optional = false,
}: {
	description: string;
	optional?: boolean;
}) {
	return { type: "array", description, optional };
}

export function getTopicWorkbenchToolSchemas(): FunctionSchema[] {
	return [
		{
			name: "topic_workbench_set_candidates",
			description:
				"Write candidate topic proposals into the right-side topic workbench. Use this after discussing or revising topic ideas; do not leave candidate topics only in prose.",
			parameters: {
				type: "object",
				required: ["candidates"],
				properties: {
					prompt: stringParam({
						description:
							"The source prompt or current direction these candidates are based on.",
						optional: true,
					}),
					candidates: arrayParam({
						description:
							"Array of topic candidates. Each item should include title, summary, coreViewpoint, audience, platforms, durationMinutes, rationale, and risks when available.",
					}),
				},
			},
		},
		{
			name: "topic_workbench_set_research_sources",
			description:
				"Write same-topic research sources, inspiration references, and fact-check materials into the topic workbench.",
			parameters: {
				type: "object",
				required: ["sources"],
				properties: {
					sources: arrayParam({
						description:
							"Array of sources with platform, title, url, sourceName, angle, whyRelevant, and confidence.",
					}),
				},
			},
		},
		{
			name: "topic_workbench_set_structure_options",
			description:
				"Write selectable video structure templates into the topic workbench after research is complete.",
			parameters: {
				type: "object",
				required: ["structures"],
				properties: {
					structures: arrayParam({
						description:
							"Array of structure options. Each item should include name, bestFor, rationale, and flow steps with label and description.",
					}),
				},
			},
		},
		{
			name: "topic_workbench_reset_stage",
			description:
				"Reset the topic workbench to an earlier stage when the user confirms they want to redo topic ideation, research, or structure.",
			parameters: {
				type: "object",
				required: ["stage"],
				properties: {
					stage: stringParam({
						description:
							"Target stage: ideation, research, structure, or package.",
					}),
				},
			},
		},
	];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
}

function isTopicPlatform(value: string): value is TopicPlatform {
	switch (value) {
		case "bilibili":
		case "youtube":
		case "xiaohongshu":
		case "douyin":
		case "video-account":
			return true;
		default:
			return false;
	}
}

function isResearchPlatform(value: string): value is ResearchPlatform {
	switch (value) {
		case "youtube":
		case "bilibili":
		case "web":
		case "official":
			return true;
		default:
			return false;
	}
}

function isTopicStage(value: string): value is TopicStage {
	switch (value) {
		case "ideation":
		case "research":
		case "structure":
		case "package":
			return true;
		default:
			return false;
	}
}

function readTopicPlatforms(value: unknown): TopicPlatform[] | undefined {
	const platforms = readStringArray(value).filter(isTopicPlatform);
	return platforms.length > 0 ? platforms : undefined;
}

function readResearchPlatform(value: unknown): ResearchPlatform | undefined {
	const platform = readString(value);
	if (!platform) return undefined;
	return isResearchPlatform(platform) ? platform : undefined;
}

function readNumber(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return value;
}

function parseCandidateDrafts(value: unknown): TopicCandidateDraft[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!isRecord(item)) return [];
		const title = readString(item.title);
		if (!title) return [];
		return [
			{
				title,
				summary: readString(item.summary),
				coreViewpoint: readString(item.coreViewpoint),
				audience: readString(item.audience),
				platforms: readTopicPlatforms(item.platforms),
				durationMinutes: readNumber(item.durationMinutes),
				rationale: readString(item.rationale),
				risks: readStringArray(item.risks),
			},
		];
	});
}

function parseResearchSourceDrafts(value: unknown): ResearchSourceDraft[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!isRecord(item)) return [];
		const title = readString(item.title);
		const url = readString(item.url);
		if (!title || !url) return [];
		return [
			{
				platform: readResearchPlatform(item.platform),
				title,
				url,
				sourceName: readString(item.sourceName),
				angle: readString(item.angle),
				whyRelevant: readString(item.whyRelevant),
				confidence:
					item.confidence === "high" ||
					item.confidence === "medium" ||
					item.confidence === "low"
						? item.confidence
						: undefined,
			},
		];
	});
}

function parseStructureDrafts(value: unknown): VideoStructureOptionDraft[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!isRecord(item)) return [];
		const name = readString(item.name);
		if (!name) return [];
		const rawFlow = Array.isArray(item.flow) ? item.flow : [];
		const flow = rawFlow.flatMap((step) => {
			if (!isRecord(step)) return [];
			const label = readString(step.label);
			const description = readString(step.description);
			if (!label || !description) return [];
			return [{ label, description }];
		});
		if (flow.length === 0) return [];
		return [
			{
				name,
				bestFor: readString(item.bestFor),
				rationale: readString(item.rationale),
				flow,
			},
		];
	});
}

function success(data: Record<string, unknown>): ToolResult {
	return {
		status: "success",
		data,
		verified: true,
	};
}

function paramError(error: string): ToolResult {
	return {
		status: "error",
		error,
		errorCategory: "param_error",
		suggestion: "请按工具参数 schema 重新提供结构化数据。",
	};
}

export function executeTopicWorkbenchTool({
	toolName,
	params,
	editorProjectId,
}: {
	toolName: string;
	params: Record<string, unknown>;
	editorProjectId: string;
}): ToolResult {
	const store = useTopicWorkbenchStore.getState();

	if (toolName === "topic_workbench_set_candidates") {
		const candidates = parseCandidateDrafts(params.candidates);
		if (candidates.length === 0) {
			return paramError("至少需要一个包含 title 的候选选题。");
		}
		const project = store.replaceCandidates({
			editorProjectId,
			prompt: readString(params.prompt),
			candidates,
		});
		return success({
			message: "候选选题已写入右侧选题工作台。",
			stage: project?.stage,
			candidateCount: project?.candidates.length ?? candidates.length,
		});
	}

	if (toolName === "topic_workbench_set_research_sources") {
		const sources = parseResearchSourceDrafts(params.sources);
		if (sources.length === 0) {
			return paramError("至少需要一个包含 title 和 url 的资料来源。");
		}
		const project = store.applyResearchSources({ sources });
		return success({
			message: "调研资料已写入右侧选题工作台。",
			stage: project?.stage,
			sourceCount: project?.researchSources.length ?? sources.length,
		});
	}

	if (toolName === "topic_workbench_set_structure_options") {
		const structures = parseStructureDrafts(params.structures);
		if (structures.length === 0) {
			return paramError("至少需要一个包含 name 和 flow 的结构模板。");
		}
		const project = store.applyStructureOptions({ structures });
		return success({
			message: "视频结构模板已写入右侧选题工作台。",
			stage: project?.stage,
			structureCount: project?.structures.length ?? structures.length,
		});
	}

	if (toolName === "topic_workbench_reset_stage") {
		const stage = readString(params.stage);
		if (!stage || !isTopicStage(stage)) {
			return paramError("stage 必须是 ideation、research、structure 或 package。");
		}
		const project = store.resetToStage({ stage });
		return success({
			message: "选题工作台阶段已重置。",
			stage: project?.stage ?? stage,
		});
	}

	return {
		status: "error",
		error: `工具 "${toolName}" 不存在`,
		errorCategory: "not_found",
	};
}
