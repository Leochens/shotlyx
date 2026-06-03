import { beforeEach, describe, expect, test } from "bun:test";
import { useTopicWorkbenchStore } from "@/topic-workbench/store";
import {
	executeTopicWorkbenchTool,
	getTopicWorkbenchToolSchemas,
	TOPIC_WORKBENCH_TOOL_NAMES,
} from "@/topic-workbench/tools";

const EDITOR_PROJECT_ID = "tool-project";

function resetStore() {
	useTopicWorkbenchStore.setState({
		activeWorkbench: "topic",
		activeEditorProjectId: EDITOR_PROJECT_ID,
		activeTopicProjectIdByEditorProject: {},
		creatorProfile: "",
		topicProjects: [],
		pendingAgentEvent: null,
		isHydrated: true,
	});
}

function writeCandidates() {
	return executeTopicWorkbenchTool({
		toolName: "topic_set_candidates",
		editorProjectId: EDITOR_PROJECT_ID,
		params: {
			prompt: "AI Agent 创作者选题",
			candidates: [
				{
					title: "AI Agent 帮创作者从灵感到脚本",
					summary: "把选题、调研、结构和脚本串成一个可回看的流程。",
					coreViewpoint: "真正的价值是工作流闭环，而不是单次问答。",
				},
			],
		},
	});
}

function moveToPackage() {
	writeCandidates();
	executeTopicWorkbenchTool({
		toolName: "topic_select_candidate",
		editorProjectId: EDITOR_PROJECT_ID,
		params: { candidateIndex: 1 },
	});
	executeTopicWorkbenchTool({
		toolName: "topic_set_research",
		editorProjectId: EDITOR_PROJECT_ID,
		params: {
			sources: [
				{
					platform: "youtube",
					title: "YouTube 同题参考",
					url: "https://www.youtube.com/results?search_query=ai-agent",
					angle: "同题内容多集中在工具展示。",
					whyRelevant: "用于判断差异化切口。",
				},
			],
		},
	});
	executeTopicWorkbenchTool({
		toolName: "topic_set_structures",
		editorProjectId: EDITOR_PROJECT_ID,
		params: {
			structures: [
				{
					name: "问题到方案",
					bestFor: "解释创作者为什么需要选题 Agent。",
					flow: [
						{ label: "痛点", description: "选题混乱，灵感无法沉淀。" },
						{ label: "方案", description: "Agent 把方向推进到脚本包。" },
					],
				},
			],
		},
	});
	return executeTopicWorkbenchTool({
		toolName: "topic_create_package",
		editorProjectId: EDITOR_PROJECT_ID,
		params: {},
	});
}

function readResourceInsights(
	value: unknown,
): Array<{ title: string }> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	const resource = Reflect.get(value, "resource");
	if (
		typeof resource !== "object" ||
		resource === null ||
		Array.isArray(resource)
	) {
		return undefined;
	}
	const insights = Reflect.get(resource, "researchInsights");
	if (!Array.isArray(insights)) return undefined;
	return insights.flatMap((item) => {
		if (typeof item !== "object" || item === null || Array.isArray(item)) {
			return [];
		}
		const title = Reflect.get(item, "title");
		return typeof title === "string" ? [{ title }] : [];
	});
}

describe("topic workbench tools", () => {
	beforeEach(() => {
		resetStore();
	});

	test("exposes topic-only workbench write tools", () => {
		const names = getTopicWorkbenchToolSchemas().map((schema) => schema.name);

		for (const name of [
			"topic_set_candidates",
			"topic_select_candidate",
			"topic_set_research",
			"topic_set_structures",
			"topic_create_package",
			"topic_create_production_plan",
			"topic_reset_to_stage",
			"topic_get_active_package",
		]) {
			expect(names).toContain(name);
			if (name !== "topic_get_active_package") {
				expect(TOPIC_WORKBENCH_TOOL_NAMES.has(name)).toBe(true);
			}
		}
		expect(names).not.toContain("topic_workbench_set_candidates");
		expect(
			TOPIC_WORKBENCH_TOOL_NAMES.has("topic_workbench_set_candidates"),
		).toBe(true);
	});

	test("rejects invalid structured candidate payloads before mutating state", () => {
		const result = executeTopicWorkbenchTool({
			toolName: "topic_set_candidates",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidates: [{ summary: "missing title" }] },
		});

		expect(result.status).toBe("error");
		expect(result.errorCategory).toBe("param_error");
		expect(useTopicWorkbenchStore.getState().topicProjects).toHaveLength(0);
	});

	test("writes candidates and selecting one advances the workflow to research", () => {
		const writeResult = writeCandidates();
		const selectResult = executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidateIndex: 1 },
		});
		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();

		expect(writeResult.status).toBe("success");
		expect(selectResult.status).toBe("success");
		expect(project?.stage).toBe("research");
		expect(project?.selectedCandidateId).toBe(project?.candidates[0]?.id);
		expect(project?.candidates[0]?.status).toBe("confirmed");
	});

	test("persists user-provided materials when candidates are written", () => {
		const result = executeTopicWorkbenchTool({
			toolName: "topic_set_candidates",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				prompt: "根据素材生成选题方向",
				inputMaterials: [
					{
						id: "material-1",
						kind: "uploaded-media",
						title: "产品演示录屏.mp4",
						summary: "用户提供的产品操作录屏。",
						mediaAssetId: "media-1",
					},
					{
						id: "material-2",
						kind: "script",
						title: "口播稿",
						content: "这一期想讲 AI 如何把长视频变成短视频投放素材。",
					},
				],
				candidates: [
					{
						title: "把一条产品录屏拆成 5 个投放短视频选题",
						summary: "基于用户提供的录屏和口播稿生成可执行方向。",
					},
				],
			},
		});
		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();

		expect(result.status).toBe("success");
		expect(project?.inputMaterials).toHaveLength(2);
		expect(project?.inputMaterials[0]?.title).toBe("产品演示录屏.mp4");
		expect(project?.inputMaterials[1]?.content).toContain("长视频");
	});

	test("creates package and production plan through tools", () => {
		const packageResult = moveToPackage();
		const productionResult = executeTopicWorkbenchTool({
			toolName: "topic_create_production_plan",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {},
		});
		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();

		expect(packageResult.status).toBe("success");
		expect(productionResult.status).toBe("success");
		expect(project?.stage).toBe("production");
		expect(project?.packageVersions).toHaveLength(1);
		expect(project?.productionPlans).toHaveLength(1);
		expect(project?.productionPlans[0]?.basedOnPackageVersionId).toBe(
			project?.activePackageVersionId,
		);
	});

	test("writes research insights alongside source links", () => {
		writeCandidates();
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidateIndex: 1 },
		});

		const result = executeTopicWorkbenchTool({
			toolName: "topic_set_research",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				sources: [
					{
						platform: "web",
						title: "AI Agent 创作者案例",
						url: "https://example.com/agent-creator",
						angle: "案例强调从选题到发布的流程。",
						whyRelevant: "可用于解释为什么不是单点工具。",
					},
				],
				insights: [
					{
						title: "流程价值比工具清单更重要",
						content:
							"资料显示创作者真正缺的是可持续复用的选题、调研和脚本流程，而不是更多孤立工具。",
						sourceIndexes: [1],
					},
				],
			},
		});
		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();

		expect(result.status).toBe("success");
		expect(result.data).toEqual(expect.objectContaining({ insightCount: 1 }));
		expect(project?.researchInsights).toHaveLength(1);
		expect(project?.researchInsights[0]?.sourceIds).toEqual([
			project?.researchSources[0]?.id,
		]);
	});

	test("reads active topic package as a structured resource and excludes hidden insights", () => {
		moveToPackage();
		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();
		const insightId = project?.researchInsights[0]?.id;
		if (!insightId) throw new Error("missing insight");
		useTopicWorkbenchStore
			.getState()
			.toggleResearchInsightHidden({ insightId, hidden: true });
		useTopicWorkbenchStore.getState().addResearchInsight({
			title: "用户补充知识",
			content: "这条补充应该进入剪辑 Agent 的资源上下文。",
		});

		const result = executeTopicWorkbenchTool({
			toolName: "topic_get_active_package",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {},
		});

		expect(result.status).toBe("success");
		const insights = readResourceInsights(result.data);
		expect(insights).toHaveLength(1);
		expect(insights?.[0]?.title).toBe("用户补充知识");
	});

	test("switches isolated package versions and reset clears only the active workflow", () => {
		moveToPackage();
		const store = useTopicWorkbenchStore.getState();
		const firstProject = store.getActiveTopicProject();
		const firstVersionId = firstProject?.activePackageVersionId;
		if (!firstVersionId) throw new Error("missing first version");
		store.updatePackageVersion({
			versionId: firstVersionId,
			patch: { title: "V1 手动编辑标题" },
		});
		const secondResult = executeTopicWorkbenchTool({
			toolName: "topic_create_package",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {},
		});
		const secondProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();
		const secondVersionId = secondProject?.activePackageVersionId;
		if (!secondVersionId) throw new Error("missing second version");
		useTopicWorkbenchStore.getState().updatePackageVersion({
			versionId: secondVersionId,
			patch: { title: "V2 独立编辑标题" },
		});
		useTopicWorkbenchStore
			.getState()
			.setActivePackageVersion({ versionId: firstVersionId });
		const switchedProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();
		const resetResult = executeTopicWorkbenchTool({
			toolName: "topic_reset_to_stage",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { stage: "ideation" },
		});
		const productionAfterResetResult = executeTopicWorkbenchTool({
			toolName: "topic_create_production_plan",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {},
		});
		const resetProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();

		expect(secondResult.status).toBe("success");
		expect(switchedProject?.stage).toBe("package");
		expect(switchedProject?.activePackageVersionId).toBe(firstVersionId);
		expect(switchedProject?.packageVersions[0]?.title).toBe("V1 手动编辑标题");
		expect(switchedProject?.packageVersions[1]?.title).toBe("V2 独立编辑标题");
		expect(resetResult.status).toBe("success");
		expect(resetProject?.stage).toBe("ideation");
		expect(resetProject?.candidates).toHaveLength(0);
		expect(resetProject?.researchSources).toHaveLength(0);
		expect(resetProject?.structures).toHaveLength(0);
		expect(resetProject?.activePackageVersionId).toBeNull();
		expect(resetProject?.packageVersions).toHaveLength(2);
		expect(productionAfterResetResult.status).toBe("error");
	});

	test("keeps legacy tool names executable as aliases", () => {
		const result = executeTopicWorkbenchTool({
			toolName: "topic_workbench_set_candidates",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				candidates: [{ title: "旧工具名仍可写入候选" }],
			},
		});

		expect(result.status).toBe("success");
		expect(
			useTopicWorkbenchStore.getState().getActiveTopicProject()?.candidates[0]
				?.title,
		).toBe("旧工具名仍可写入候选");
	});
});
