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
		pendingInputMaterialsByEditorProject: {},
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
			"topic_update_script_segment",
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

	test("topic_create_package stores agent-provided verbatim script segments", () => {
		writeCandidates();
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidateIndex: 1 },
		});
		executeTopicWorkbenchTool({
			toolName: "topic_set_structures",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				structures: [
					{
						name: "口播拆解",
						bestFor: "把选题讲成一条完整口播视频。",
						flow: [{ label: "开场", description: "先讲为什么今天值得看。" }],
					},
				],
			},
		});

		executeTopicWorkbenchTool({
			toolName: "topic_create_package",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				scriptSegments: [
					{
						timeRange: "0:00 - 0:45",
						content:
							"大家好，今天我们不先罗列工具，而是直接看一个真实问题：创作者为什么总是在选题阶段卡住。接下来我会用一个完整流程，把灵感、调研和脚本怎么串起来讲清楚。",
						materialSuggestion: "使用工作台录屏和标题字卡开场。",
					},
				],
			},
		});

		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();
		const segment = project?.packageVersions[0]?.scriptSegments[0];

		expect(segment?.content).toContain("大家好，今天我们不先罗列工具");
		expect(segment?.content).not.toContain("开场：先讲为什么今天值得看");
		expect(segment?.materialSuggestion).toBe("使用工作台录屏和标题字卡开场。");
	});

	test("updates one package script segment without recreating the package", () => {
		writeCandidates();
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidateIndex: 1 },
		});
		executeTopicWorkbenchTool({
			toolName: "topic_set_structures",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				structures: [
					{
						name: "两段式解释",
						bestFor: "先讲痛点，再讲方案。",
						flow: [
							{ label: "痛点", description: "创作者卡在选题和脚本衔接。" },
							{ label: "方案", description: "用工作台把每一步沉淀下来。" },
						],
					},
				],
			},
		});
		executeTopicWorkbenchTool({
			toolName: "topic_create_package",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				scriptSegments: [
					{
						timeRange: "0:00 - 0:45",
						content:
							"你是不是也遇到过这种情况：灵感来的时候很兴奋，可是一打开剪辑软件，就发现选题、资料和脚本全都散在不同地方，根本接不上。你明明已经想清楚要讲什么，却还要重新组织素材、重写结构，效率一下就掉下来了。",
						materialSuggestion: "展示零散草稿、聊天记录和剪辑时间线的对比画面。",
					},
					{
						timeRange: "0:45 - 1:30",
						content:
							"更麻烦的是，AI 给你的回答往往停在文字层面，没有真正进入你的项目。你还要自己复制、整理、改格式，最后又回到手工流程。所以真正需要的不是一段漂亮回复，而是一个能理解当前选题包并且能回写结果的工作流。",
						materialSuggestion: "展示复制粘贴、整理表格和切换窗口的录屏。",
					},
				],
			},
		});
		const beforeProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();
		const activeVersionId = beforeProject?.activePackageVersionId;
		const firstSegmentBefore =
			beforeProject?.packageVersions[0]?.scriptSegments[0]?.content;

		const result = executeTopicWorkbenchTool({
			toolName: "topic_update_script_segment",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				segmentIndex: 2,
				content:
					"真正要解决的不是让 AI 多说几句，而是让它知道你当前的选题包、前后段落和素材状态。这样你说“这段重写得更直接一点”，它就能只改这一段，并且把对应画面建议一起补齐。",
				materialSuggestion:
					"展示右侧第 2 段被高亮，左侧 Agent 读取完整选题包后回写逐字稿和素材建议。",
			},
		});
		const updatedProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();
		const updatedVersion = updatedProject?.packageVersions[0];

		expect(result.status).toBe("success");
		expect(updatedProject?.packageVersions).toHaveLength(1);
		expect(updatedVersion?.id).toBe(activeVersionId);
		expect(updatedVersion?.scriptSegments[0]?.content).toBe(firstSegmentBefore);
		expect(updatedVersion?.scriptSegments[1]?.content).toContain(
			"真正要解决的不是让 AI 多说几句",
		);
		expect(updatedVersion?.scriptSegments[1]?.materialSuggestion).toContain(
			"回写逐字稿和素材建议",
		);
	});

	test("rejects outline-like single segment rewrites before mutating state", () => {
		moveToPackage();
		const beforeProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();
		const originalContent =
			beforeProject?.packageVersions[0]?.scriptSegments[0]?.content;

		const result = executeTopicWorkbenchTool({
			toolName: "topic_update_script_segment",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				segmentIndex: 1,
				content: "开场 hook：先提出痛点，再展示工作台的核心能力。",
				materialSuggestion: "展示一个高冲击标题字卡。",
			},
		});
		const updatedProject = useTopicWorkbenchStore
			.getState()
			.getActiveTopicProject();

		expect(result.status).toBe("error");
		expect(result.error).toContain("逐字稿");
		expect(updatedProject?.packageVersions[0]?.scriptSegments[0]?.content).toBe(
			originalContent,
		);
	});

	test("rejects outline-like package script segments before storing them", () => {
		writeCandidates();
		executeTopicWorkbenchTool({
			toolName: "topic_select_candidate",
			editorProjectId: EDITOR_PROJECT_ID,
			params: { candidateIndex: 1 },
		});
		executeTopicWorkbenchTool({
			toolName: "topic_set_structures",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				structures: [
					{
						name: "产品测评结构",
						bestFor: "把测评选题拆成完整口播视频。",
						flow: [{ label: "开场", description: "先建立观看动机。" }],
					},
				],
			},
		});

		const result = executeTopicWorkbenchTool({
			toolName: "topic_create_package",
			editorProjectId: EDITOR_PROJECT_ID,
			params: {
				scriptSegments: [
					{
						timeRange: "0:00 - 2:00",
						content:
							"开场 hook：M3 发布，1M 上下文 + 多模态，审美和工程化能力大幅提升。",
						materialSuggestion: "使用高冲击标题画面、录屏或问题式口播开场。",
					},
				],
			},
		});

		const project = useTopicWorkbenchStore.getState().getActiveTopicProject();

		expect(result.status).toBe("error");
		expect(result.error).toContain("逐字稿");
		expect(project?.packageVersions).toHaveLength(0);
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

	test("lets pending input materials be edited and removed before candidates exist", () => {
		useTopicWorkbenchStore.getState().recordInputMaterials({
			editorProjectId: EDITOR_PROJECT_ID,
			materials: [
				{
					id: "pending-material",
					title: "原始素材",
					summary: "原始摘要",
					content: "原始内容",
				},
			],
		});

		useTopicWorkbenchStore.getState().updateInputMaterial({
			materialId: "pending-material",
			patch: {
				title: "修改后的素材",
				summary: "修改后的摘要",
				content: "修改后的内容",
			},
		});

		const pendingMaterials =
			useTopicWorkbenchStore.getState().pendingInputMaterialsByEditorProject[
				EDITOR_PROJECT_ID
			] ?? [];
		expect(pendingMaterials[0]?.title).toBe("修改后的素材");
		expect(pendingMaterials[0]?.summary).toBe("修改后的摘要");
		expect(pendingMaterials[0]?.content).toBe("修改后的内容");

		useTopicWorkbenchStore
			.getState()
			.removeInputMaterial({ materialId: "pending-material" });

		expect(
			useTopicWorkbenchStore.getState().pendingInputMaterialsByEditorProject[
				EDITOR_PROJECT_ID
			],
		).toHaveLength(0);
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
