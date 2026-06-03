import type { FunctionSchema } from "@/agent/mcp/schema";
import type { ToolResult } from "@/agent/mcp/types";
import { useTopicWorkbenchStore } from "./store";
import type {
	ProductionPlanDraft,
	ResearchInsightDraft,
	ResearchSourceDraft,
	TopicCandidateDraft,
	VideoStructureOptionDraft,
} from "./model";
import type {
	ProductionPlanAssetType,
	ProductionPlanVideoType,
	ResearchPlatform,
	TopicPlatform,
	TopicStage,
} from "./types";

export const TOPIC_WORKBENCH_TOOL_NAMES = new Set([
	"topic_set_candidates",
	"topic_select_candidate",
	"topic_set_research",
	"topic_set_structures",
	"topic_create_package",
	"topic_create_production_plan",
	"topic_reset_to_stage",
	"topic_workbench_set_candidates",
	"topic_workbench_set_research_sources",
	"topic_workbench_set_structure_options",
	"topic_workbench_reset_stage",
]);

const TOPIC_WORKBENCH_TOOL_ALIASES: Record<string, string> = {
	topic_workbench_set_candidates: "topic_set_candidates",
	topic_workbench_set_research_sources: "topic_set_research",
	topic_workbench_set_structure_options: "topic_set_structures",
	topic_workbench_reset_stage: "topic_reset_to_stage",
};

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
			name: "topic_set_candidates",
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
			name: "topic_select_candidate",
			description:
				"Select one candidate topic in the topic workbench. By default this confirms the choice and advances the current workflow to research, so call it only after the user has chosen a candidate.",
			parameters: {
				type: "object",
				required: [],
				properties: {
					candidateId: stringParam({
						description: "Exact candidate id when available.",
						optional: true,
					}),
					candidateIndex: {
						type: "number",
						description:
							"One-based candidate index shown in the workbench. Zero is also accepted for the first item.",
						optional: true,
					},
					title: stringParam({
						description:
							"Candidate title or a distinctive title fragment when id/index is unavailable.",
						optional: true,
					}),
					advance: {
						type: "boolean",
						description:
							"Whether to confirm the selection and advance to research. Defaults to true.",
						optional: true,
					},
				},
			},
		},
		{
			name: "topic_set_research",
			description:
				"Write same-topic research sources plus synthesized knowledge paragraphs with citations into the topic workbench.",
			parameters: {
				type: "object",
				required: ["sources"],
				properties: {
					sources: arrayParam({
						description:
							"Array of sources with platform, title, url, sourceName, angle, whyRelevant, and confidence.",
					}),
					insights: arrayParam({
						description:
							"Optional array of knowledge paragraphs. Each item should include title, content, and citation bindings via sourceIndexes, sourceUrls, or sourceTitles.",
						optional: true,
					}),
				},
			},
		},
		{
			name: "topic_set_structures",
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
			name: "topic_create_package",
			description:
				"Create a versioned topic package from the selected candidate, research, and selected structure. Use this when the user confirms the package generation step.",
			parameters: {
				type: "object",
				required: [],
				properties: {},
			},
		},
		{
			name: "topic_create_production_plan",
			description:
				"Create a video production plan from the active topic package before handing work to the video editing agent.",
			parameters: {
				type: "object",
				required: [],
				properties: {
					plan: {
						type: "object",
						description:
							"Optional override draft with videoType, targetPlatform, estimatedDurationMinutes, segments, requiredAssets, and nextActions.",
						optional: true,
					},
				},
			},
		},
		{
			name: "topic_reset_to_stage",
			description:
				"Reset the current topic workflow to an earlier stage after the user confirms they want to redo ideation, research, structure, package, or production.",
			parameters: {
				type: "object",
				required: ["stage"],
				properties: {
					stage: stringParam({
						description:
							"Target stage: ideation, research, structure, package, production, or timeline.",
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

function isProductionVideoType(
	value: string,
): value is ProductionPlanVideoType {
	switch (value) {
		case "talking-head":
		case "screen-recording":
		case "tutorial":
		case "review":
		case "vlog":
		case "explainer":
		case "ad":
			return true;
		default:
			return false;
	}
}

function isProductionPlanAssetType(
	value: string,
): value is ProductionPlanAssetType {
	switch (value) {
		case "user-footage":
		case "screen-recording":
		case "broll":
		case "screenshot":
		case "voiceover":
		case "subtitle":
		case "mg":
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
		case "production":
		case "timeline":
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

function readNumberArray(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is number => typeof item === "number" && Number.isFinite(item),
	);
}

function readBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
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

function parseResearchInsightDrafts(value: unknown): ResearchInsightDraft[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		if (!isRecord(item)) return [];
		const content = readString(item.content);
		if (!content) return [];
		return [
			{
				title: readString(item.title),
				content,
				sourceIndexes: readNumberArray(item.sourceIndexes),
				sourceUrls: readStringArray(item.sourceUrls),
				sourceTitles: readStringArray(item.sourceTitles),
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

function parseProductionPlanDraft(
	value: unknown,
): ProductionPlanDraft | undefined {
	if (!isRecord(value)) return undefined;
	const videoType = readString(value.videoType);
	const rawSegments = Array.isArray(value.segments) ? value.segments : [];
	const rawAssets = Array.isArray(value.requiredAssets)
		? value.requiredAssets
		: [];
	const segments = rawSegments.flatMap((segment) => {
		if (!isRecord(segment)) return [];
		return [
			{
				timeRange: readString(segment.timeRange),
				goal: readString(segment.goal),
				script: readString(segment.script),
				visualNeed: readString(segment.visualNeed),
				assetSuggestion: readString(segment.assetSuggestion),
				editSuggestion: readString(segment.editSuggestion),
			},
		];
	});
	const requiredAssets = rawAssets.flatMap((asset) => {
		if (!isRecord(asset)) return [];
		const type = readString(asset.type);
		return [
			{
				type: type && isProductionPlanAssetType(type) ? type : undefined,
				description: readString(asset.description),
				optional: readBoolean(asset.optional),
			},
		];
	});
	return {
		videoType:
			videoType && isProductionVideoType(videoType) ? videoType : undefined,
		targetPlatform: readStringArray(value.targetPlatform),
		estimatedDurationMinutes: readNumber(value.estimatedDurationMinutes),
		segments: segments.length > 0 ? segments : undefined,
		requiredAssets: requiredAssets.length > 0 ? requiredAssets : undefined,
		nextActions: readStringArray(value.nextActions),
	};
}

function normalizeToolName(toolName: string): string {
	return TOPIC_WORKBENCH_TOOL_ALIASES[toolName] ?? toolName;
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
	const normalizedToolName = normalizeToolName(toolName);
	store.setActiveEditorProject({ editorProjectId });

	if (normalizedToolName === "topic_set_candidates") {
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

	if (normalizedToolName === "topic_select_candidate") {
		const project = store.getActiveTopicProject();
		if (!project) {
			return paramError("当前没有可选择的选题项目。");
		}
		const candidateId = readString(params.candidateId);
		const title = readString(params.title);
		const candidateIndex = readNumber(params.candidateIndex);
		const targetCandidate =
			(candidateId
				? project.candidates.find((candidate) => candidate.id === candidateId)
				: null) ??
			(typeof candidateIndex === "number"
				? project.candidates[
						candidateIndex > 0
							? Math.trunc(candidateIndex) - 1
							: Math.trunc(candidateIndex)
					]
				: null) ??
			(title
				? project.candidates.find(
						(candidate) =>
							candidate.title === title || candidate.title.includes(title),
					)
				: null);
		if (!targetCandidate) {
			return paramError("没有找到要选择的候选选题。");
		}
		const shouldAdvance = readBoolean(params.advance) ?? true;
		store.selectCandidate({ candidateId: targetCandidate.id });
		if (shouldAdvance) store.confirmCandidate();
		const nextProject = store.getActiveTopicProject();
		return success({
			message: shouldAdvance
				? "候选选题已确认，工作台已进入资料汇总阶段。"
				: "候选选题已选中。",
			stage: nextProject?.stage,
			selectedCandidateId: nextProject?.selectedCandidateId,
		});
	}

	if (normalizedToolName === "topic_set_research") {
		const sources = parseResearchSourceDrafts(params.sources);
		if (sources.length === 0) {
			return paramError("至少需要一个包含 title 和 url 的资料来源。");
		}
		const insights = parseResearchInsightDrafts(params.insights);
		const project = store.applyResearchSources({ sources, insights });
		return success({
			message: "调研资料和知识脉络已写入右侧选题工作台。",
			stage: project?.stage,
			sourceCount: project?.researchSources.length ?? sources.length,
			insightCount: project?.researchInsights.length ?? insights.length,
		});
	}

	if (normalizedToolName === "topic_set_structures") {
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

	if (normalizedToolName === "topic_create_package") {
		const before = store.getActiveTopicProject();
		const project = store.createPackageVersion();
		const activePackageId = project?.activePackageVersionId ?? null;
		if (!project || !activePackageId || before === project) {
			return paramError("生成选题包前需要先确认选题并选择一个结构模板。");
		}
		return success({
			message: "选题包版本已创建。",
			stage: project.stage,
			activePackageVersionId: activePackageId,
			packageVersionCount: project.packageVersions.length,
		});
	}

	if (normalizedToolName === "topic_create_production_plan") {
		const activeProject = store.getActiveTopicProject();
		const activePackageId =
			activeProject?.activePackageVersionId ??
			(activeProject?.stage === "package" ||
			activeProject?.stage === "production" ||
			activeProject?.stage === "timeline"
				? activeProject.packageVersions.at(-1)?.id
				: null) ??
			null;
		if (!activeProject || !activePackageId) {
			return paramError("生成制作计划前需要先生成并激活一个选题包。");
		}
		const draft = parseProductionPlanDraft(params.plan ?? params);
		const project = store.createProductionPlan({ draft });
		const activePlanId = project?.activeProductionPlanId ?? null;
		if (!project || !activePlanId) {
			return paramError("制作计划生成失败，请确认选题包内容完整。");
		}
		return success({
			message: "视频制作计划已写入右侧工作台。",
			stage: project.stage,
			activeProductionPlanId: activePlanId,
			productionPlanCount: project.productionPlans?.length ?? 0,
		});
	}

	if (normalizedToolName === "topic_reset_to_stage") {
		const stage = readString(params.stage);
		if (!stage || !isTopicStage(stage)) {
			return paramError(
				"stage 必须是 ideation、research、structure、package、production 或 timeline。",
			);
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
