import { describe, expect, test } from "bun:test";
import {
	addPackageVersion,
	advanceToStructureStage,
	confirmSelectedCandidate,
	createTopicProjectFromPrompt,
	selectCandidate,
	selectStructure,
} from "@/topic-workbench/model";

describe("topic workbench model", () => {
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

	test("confirming a candidate creates same-topic research sources", () => {
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
		expect(confirmed.researchSources.map((source) => source.platform)).toEqual([
			"youtube",
			"bilibili",
			"web",
			"official",
		]);
		expect(confirmed.researchSources[0]?.url).toContain("youtube.com");
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
});

