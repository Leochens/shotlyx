import { describe, expect, test } from "bun:test";
import {
	addPackageVersion,
	advanceToStructureStage,
	applyResearchSources,
	applyStructureOptions,
	confirmSelectedCandidate,
	createProductionPlan,
	createTopicProjectFromPrompt,
	mergePromptIntoProject,
	replaceTopicCandidates,
	resetTopicProjectToStage,
	selectCandidate,
	selectStructure,
} from "@/topic-workbench/model";

describe("topic workbench model", () => {
	test("keeps user-provided materials with the topic project", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "根据素材帮我找选题",
			inputMaterials: [
				{
					id: "material-1",
					kind: "script",
					title: "AI 工具实测脚本",
					summary: "脚本里有三段关于 AI 剪辑工作流的实测。",
					content: "开场：我用 AI 把一条长视频拆成多个短视频选题。",
					createdAt: 900,
				},
			],
			now: 1_000,
		});

		expect(project.inputMaterials).toHaveLength(1);
		expect(project.inputMaterials[0]?.title).toBe("AI 工具实测脚本");

		const revised = replaceTopicCandidates({
			project,
			prompt: "基于这份脚本重新生成方向",
			inputMaterials: [
				{
					id: "material-2",
					kind: "screen-recording",
					title: "Cursor 录屏素材",
					summary: "录屏展示了从需求到代码提交的完整过程。",
					createdAt: 1_100,
				},
			],
			candidates: [{ title: "把录屏素材变成 AI 编程工作流选题" }],
			now: 2_000,
		});

		expect(revised.inputMaterials.map((material) => material.id)).toEqual([
			"material-1",
			"material-2",
		]);
		expect(revised.candidates[0]?.rationale).toContain("素材");
	});

	test("turns a vague creator idea into editable topic candidates", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI 视频生成工具最近有什么值得聊的",
			now: 1_000,
		});

		expect(project.stage).toBe("ideation");
		expect(project.candidates).toHaveLength(5);
		expect(project.candidates[0]?.platforms).toContain("bilibili");
		expect(project.candidates[0]?.platforms).toContain("youtube");
		expect(project.promptHistory).toEqual([
			"AI 视频生成工具最近有什么值得聊的",
		]);
	});

	test("confirming a candidate enters research stage without fabricating research", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 如何改变视频创作",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId, now: 2_000 }),
			now: 3_000,
		});

		expect(confirmed.stage).toBe("research");
		expect(confirmed.selectedCandidateId).toBe(candidateId);
		expect(confirmed.researchSources).toHaveLength(0);
		expect(confirmed.structures).toHaveLength(0);
		expect(confirmed.candidates[0]?.status).toBe("confirmed");
	});

	test("creates structure options and a versioned topic package", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "做一个 Shotlyx 选题工作台的视频",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId }),
		});
		const structured = advanceToStructureStage({ project: confirmed });
		const structureId = structured.structures[0]?.id;
		if (!structureId) throw new Error("missing structure");
		const withStructure = selectStructure({
			project: structured,
			structureId,
		});
		const packaged = addPackageVersion({ project: withStructure, now: 4_000 });

		expect(packaged.stage).toBe("package");
		expect(packaged.status).toBe("ready-for-video");
		expect(packaged.packageVersions).toHaveLength(1);
		expect(packaged.activePackageVersionId).toBe(
			packaged.packageVersions[0]?.id,
		);
		expect(packaged.packageVersions[0]?.outline.length).toBeGreaterThan(2);
		expect(packaged.packageVersions[0]?.scriptSegments.length).toBe(
			withStructure.structures[0]?.flow.length,
		);
	});

	test("can skip research and advance directly from confirmed topic to structure", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 如何帮创作者做选题",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId, now: 2_000 }),
			now: 3_000,
		});
		const structured = advanceToStructureStage({
			project: confirmed,
			now: 4_000,
		});

		expect(structured.stage).toBe("structure");
		expect(structured.selectedCandidateId).toBe(candidateId);
		expect(structured.researchSources).toHaveLength(0);
		expect(structured.researchInsights).toHaveLength(0);
		expect(structured.structures.length).toBeGreaterThan(0);
		expect(structured.selectedStructureId).toBe(structured.structures[0]?.id);
	});

	test("duplicates the active topic package as an isolated version snapshot", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "做一个 Shotlyx 选题工作台的视频",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId }),
		});
		const structured = advanceToStructureStage({ project: confirmed });
		const structureId = structured.structures[0]?.id;
		if (!structureId) throw new Error("missing structure");
		const firstPackaged = addPackageVersion({
			project: selectStructure({ project: structured, structureId }),
			now: 4_000,
		});
		const firstVersion = firstPackaged.packageVersions[0];
		if (!firstVersion) throw new Error("missing first version");

		const secondPackaged = addPackageVersion({
			project: {
				...firstPackaged,
				packageVersions: [
					{
						...firstVersion,
						title: "已经手动编辑过的 V1 标题",
						scriptSegments: firstVersion.scriptSegments.map((segment, index) =>
							index === 0
								? { ...segment, content: "V1 已编辑分段内容" }
								: segment,
						),
					},
				],
			},
			now: 5_000,
		});
		const clonedVersion = secondPackaged.packageVersions[1];

		expect(secondPackaged.packageVersions).toHaveLength(2);
		expect(secondPackaged.activePackageVersionId).toBe(clonedVersion?.id);
		expect(clonedVersion?.versionName).toBe("V2");
		expect(clonedVersion?.title).toBe("已经手动编辑过的 V1 标题");
		expect(clonedVersion?.id).not.toBe(firstVersion.id);
		expect(clonedVersion?.scriptSegments).not.toBe(firstVersion.scriptSegments);
		expect(clonedVersion?.scriptSegments[0]).not.toBe(
			firstVersion.scriptSegments[0],
		);
	});

	test("refreshes visible candidates when the user revises the topic in chat", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI 视频生成工具最近有什么值得聊的",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const revised = mergePromptIntoProject({
			project: selectCandidate({ project, candidateId, now: 2_000 }),
			prompt: "换成 AI Agent 帮自媒体做选题这个方向",
			now: 3_000,
		});

		expect(revised.stage).toBe("ideation");
		expect(revised.selectedCandidateId).toBeNull();
		expect(revised.candidates[0]?.title).toContain("AI Agent 帮自媒体做选题");
		expect(revised.promptHistory).toEqual([
			"AI 视频生成工具最近有什么值得聊的",
			"换成 AI Agent 帮自媒体做选题这个方向",
		]);
	});

	test("tool-style candidate replacement keeps package history but resets temporary downstream state", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "做一个 Shotlyx 选题工作台的视频",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");

		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId }),
		});
		const structured = advanceToStructureStage({ project: confirmed });
		const structureId = structured.structures[0]?.id;
		if (!structureId) throw new Error("missing structure");
		const packaged = addPackageVersion({
			project: selectStructure({ project: structured, structureId }),
			now: 4_000,
		});

		const revised = replaceTopicCandidates({
			project: packaged,
			prompt: "AI Agent 如何帮创作者完成选题调研",
			candidates: [
				{
					title: "AI Agent 帮创作者选题：从灵感到脚本",
					summary: "强调选题工作台的完整闭环。",
					coreViewpoint: "真正的价值是把创作过程沉淀成可回看的项目状态。",
				},
			],
			now: 5_000,
		});

		expect(revised.stage).toBe("ideation");
		expect(revised.status).toBe("active");
		expect(revised.candidates).toHaveLength(1);
		expect(revised.candidates[0]?.title).toBe(
			"AI Agent 帮创作者选题：从灵感到脚本",
		);
		expect(revised.selectedCandidateId).toBeNull();
		expect(revised.researchSources).toHaveLength(0);
		expect(revised.structures).toHaveLength(0);
		expect(revised.packageVersions).toHaveLength(1);
	});

	test("topic tools can move through research and structure, then reset an earlier stage", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 内容生产",
			now: 1_000,
		});

		const researched = applyResearchSources({
			project,
			sources: [
				{
					platform: "youtube",
					title: "YouTube 同题参考",
					url: "https://www.youtube.com/results?search_query=ai-agent",
					angle: "同题内容集中在工具演示。",
					whyRelevant: "帮助判断差异化切口。",
				},
			],
			now: 2_000,
		});
		const structured = applyStructureOptions({
			project: researched,
			structures: [
				{
					name: "问题到方案",
					bestFor: "解释创作者为什么需要选题 Agent。",
					flow: [
						{ label: "痛点", description: "先呈现选题混乱的问题。" },
						{ label: "方案", description: "展示 Agent 如何收束方向。" },
					],
				},
			],
			now: 3_000,
		});
		const reset = resetTopicProjectToStage({
			project: structured,
			stage: "research",
			now: 4_000,
		});

		expect(researched.stage).toBe("research");
		expect(researched.researchSources[0]?.platform).toBe("youtube");
		expect(structured.stage).toBe("structure");
		expect(structured.structures[0]?.flow).toHaveLength(2);
		expect(reset.stage).toBe("research");
		expect(reset.researchSources).toHaveLength(0);
		expect(reset.structures).toHaveLength(0);
	});

	test("stores research insight paragraphs with cited sources", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 内容生产",
			now: 1_000,
		});

		const researched = applyResearchSources({
			project,
			sources: [
				{
					platform: "youtube",
					title: "YouTube 同题参考",
					url: "https://www.youtube.com/results?search_query=ai-agent",
					angle: "同题内容集中在工具演示。",
					whyRelevant: "帮助判断差异化切口。",
				},
				{
					platform: "official",
					title: "产品官方文档",
					url: "https://example.com/docs",
					angle: "确认官方功能边界。",
					whyRelevant: "避免脚本里夸大能力。",
				},
			],
			insights: [
				{
					title: "同题内容的缺口",
					content:
						"现有内容大多停留在工具演示，缺少把 Agent 放进创作者真实工作流后的复盘。",
					sourceIndexes: [1, 2],
				},
			],
			now: 2_000,
		});

		expect(researched.researchInsights).toHaveLength(1);
		expect(researched.researchInsights[0]?.title).toBe("同题内容的缺口");
		expect(researched.researchInsights[0]?.content).toContain(
			"创作者真实工作流",
		);
		expect(researched.researchInsights[0]?.sourceIds).toEqual([
			researched.researchSources[0]?.id,
			researched.researchSources[1]?.id,
		]);
	});

	test("creates a production plan from the active topic package", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 内容生产",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");
		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId }),
		});
		const structured = advanceToStructureStage({ project: confirmed });
		const structureId = structured.structures[0]?.id;
		if (!structureId) throw new Error("missing structure");
		const packaged = addPackageVersion({
			project: selectStructure({ project: structured, structureId }),
			now: 2_000,
		});

		const production = createProductionPlan({
			project: packaged,
			now: 3_000,
		});

		expect(production.stage).toBe("production");
		expect(production.productionPlans).toHaveLength(1);
		expect(production.activeProductionPlanId).toBe(
			production.productionPlans[0]?.id,
		);
		expect(production.productionPlans[0]?.basedOnPackageVersionId).toBe(
			packaged.activePackageVersionId,
		);
		expect(production.productionPlans[0]?.segments).toHaveLength(
			packaged.packageVersions[0]?.scriptSegments.length,
		);
	});

	test("resetting a completed package back to ideation clears the current workflow but keeps version history", () => {
		const project = createTopicProjectFromPrompt({
			editorProjectId: "project-1",
			prompt: "AI Agent 内容生产",
			now: 1_000,
		});
		const candidateId = project.candidates[0]?.id;
		if (!candidateId) throw new Error("missing candidate");
		const confirmed = confirmSelectedCandidate({
			project: selectCandidate({ project, candidateId }),
		});
		const structured = advanceToStructureStage({ project: confirmed });
		const structureId = structured.structures[0]?.id;
		if (!structureId) throw new Error("missing structure");
		const packaged = addPackageVersion({
			project: selectStructure({ project: structured, structureId }),
			now: 2_000,
		});

		const reset = resetTopicProjectToStage({
			project: packaged,
			stage: "ideation",
			now: 3_000,
		});

		expect(reset.stage).toBe("ideation");
		expect(reset.status).toBe("active");
		expect(reset.candidates).toHaveLength(0);
		expect(reset.selectedCandidateId).toBeNull();
		expect(reset.researchSources).toHaveLength(0);
		expect(reset.structures).toHaveLength(0);
		expect(reset.packageVersions).toHaveLength(1);
		expect(reset.activePackageVersionId).toBeNull();
	});
});
