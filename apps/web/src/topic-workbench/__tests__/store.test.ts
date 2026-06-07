import { beforeEach, describe, expect, test } from "bun:test";
import {
	createTopicProjectFromDraft,
	updateTopicScriptTableMetadata,
	updateTopicScriptTableRow,
} from "@/topic-workbench/model";
import { useTopicWorkbenchStore } from "@/topic-workbench/store";

function resetStore() {
	useTopicWorkbenchStore.setState({
		activeWorkbench: "topic",
		activeEditorProjectId: "source-editor-project",
		activeTopicProjectIdByEditorProject: {},
		creatorProfile: "",
		topicProjects: [],
		pendingInputMaterialsByEditorProject: {},
		pendingAgentEvent: null,
		isHydrated: true,
	});
}

describe("topic workbench store", () => {
	beforeEach(() => {
		resetStore();
	});

	test("duplicates topic drafts and script tables for copied editor projects", () => {
		const sourceProject = updateTopicScriptTableMetadata({
			project: updateTopicScriptTableRow({
				project: createTopicProjectFromDraft({
					editorProjectId: "source-editor-project",
					draft: "我的选题草稿",
					now: 1_000,
				}),
				rowId: "script-row-1",
				patch: {
					timeRange: "00:00-00:08",
					copy: "这里是逐字稿",
					visualContent: "展示产品官网",
				},
				now: 1_100,
			}),
			patch: {
				title: "脚本标题",
				description: "脚本简介",
				coverAsset: {
					mediaAssetId: "cover-asset",
					name: "cover.png",
					mediaType: "image",
					addedAt: 1_200,
				},
			},
			now: 1_200,
		});

		useTopicWorkbenchStore.setState({
			activeTopicProjectIdByEditorProject: {
				"source-editor-project": sourceProject.id,
			},
			pendingInputMaterialsByEditorProject: {
				"source-editor-project": [
					{
						id: "pending-material",
						kind: "note",
						title: "待处理备注",
						content: "复制前还没有正式进入选题项目的素材。",
						createdAt: 900,
					},
				],
			},
			topicProjects: [sourceProject],
		});

		useTopicWorkbenchStore.getState().duplicateEditorProjectTopicState({
			pairs: [
				{
					sourceEditorProjectId: "source-editor-project",
					targetEditorProjectId: "copied-editor-project",
				},
			],
		});

		const state = useTopicWorkbenchStore.getState();
		const duplicatedProject = state.topicProjects.find(
			(project) => project.editorProjectId === "copied-editor-project",
		);

		expect(duplicatedProject).toBeDefined();
		expect(duplicatedProject?.id).not.toBe(sourceProject.id);
		expect(duplicatedProject?.inputMaterials[0]?.content).toBe("我的选题草稿");
		expect(duplicatedProject?.scriptTableMetadata).toMatchObject({
			title: "脚本标题",
			description: "脚本简介",
		});
		expect(duplicatedProject?.scriptTableMetadata.coverAsset?.name).toBe(
			"cover.png",
		);
		expect(duplicatedProject?.scriptTableRows[0]).toMatchObject({
			timeRange: "00:00-00:08",
			copy: "这里是逐字稿",
			visualContent: "展示产品官网",
		});
		expect(
			state.activeTopicProjectIdByEditorProject["copied-editor-project"],
		).toBe(duplicatedProject?.id);
		expect(
			state.pendingInputMaterialsByEditorProject["copied-editor-project"]?.[0]
				?.title,
		).toBe("待处理备注");
	});
});
