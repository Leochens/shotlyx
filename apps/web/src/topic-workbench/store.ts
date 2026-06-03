import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "@/agent/chat/indexeddb-storage";
import {
	addPackageVersion,
	advanceToStructureStage,
	confirmSelectedCandidate,
	createResearchSources,
	createStructureOptions,
	createTopicProjectFromPrompt,
	mergePromptIntoProject,
	selectCandidate,
	selectStructure,
	updateCandidate,
} from "./model";
import type {
	TopicCandidate,
	TopicProject,
	WorkbenchMode,
} from "./types";

interface PersistedTopicWorkbenchState {
	activeWorkbench: WorkbenchMode;
	activeEditorProjectId: string;
	activeTopicProjectIdByEditorProject: Record<string, string>;
	topicProjects: TopicProject[];
}

interface TopicWorkbenchState extends PersistedTopicWorkbenchState {
	isHydrated: boolean;
	setIsHydrated: ({ isHydrated }: { isHydrated: boolean }) => void;
	setActiveWorkbench: ({ mode }: { mode: WorkbenchMode }) => void;
	setActiveEditorProject: ({ editorProjectId }: { editorProjectId: string }) => void;
	getActiveTopicProject: () => TopicProject | null;
	recordPrompt: ({
		editorProjectId,
		prompt,
	}: {
		editorProjectId: string;
		prompt: string;
	}) => void;
	createTopicProject: ({
		editorProjectId,
		prompt,
	}: {
		editorProjectId: string;
		prompt: string;
	}) => void;
	selectCandidate: ({ candidateId }: { candidateId: string }) => void;
	updateCandidate: ({
		candidateId,
		patch,
	}: {
		candidateId: string;
		patch: Partial<Pick<TopicCandidate, "title" | "summary" | "coreViewpoint">>;
	}) => void;
	confirmCandidate: () => void;
	runResearch: () => void;
	prepareStructureOptions: () => void;
	selectStructure: ({ structureId }: { structureId: string }) => void;
	createPackageVersion: () => void;
	setActivePackageVersion: ({ versionId }: { versionId: string }) => void;
}

const DEFAULT_EDITOR_PROJECT_ID = "default-project";

function getLegacyStorage() {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function getStorage() {
	return createIndexedDBPersistStorage<PersistedTopicWorkbenchState>({
		dbName: "shotlyx-topic-workbench",
		storeName: "topic-workbench-state",
		legacyStorage: getLegacyStorage(),
	});
}

function updateActiveProject({
	state,
	updater,
}: {
	state: TopicWorkbenchState;
	updater: (project: TopicProject) => TopicProject;
}): Pick<TopicWorkbenchState, "topicProjects"> {
	const activeProject = state.getActiveTopicProject();
	if (!activeProject) return { topicProjects: state.topicProjects };
	return {
		topicProjects: state.topicProjects.map((project) =>
			project.id === activeProject.id ? updater(project) : project,
		),
	};
}

export const useTopicWorkbenchStore = create<TopicWorkbenchState>()(
	persist(
		(set, get) => ({
			activeWorkbench: "video",
			activeEditorProjectId: DEFAULT_EDITOR_PROJECT_ID,
			activeTopicProjectIdByEditorProject: {},
			topicProjects: [],
			isHydrated: typeof window === "undefined",

			setIsHydrated: ({ isHydrated }) => set({ isHydrated }),
			setActiveWorkbench: ({ mode }) => set({ activeWorkbench: mode }),
			setActiveEditorProject: ({ editorProjectId }) =>
				set({
					activeEditorProjectId: editorProjectId || DEFAULT_EDITOR_PROJECT_ID,
				}),

			getActiveTopicProject: () => {
				const state = get();
				const projectId =
					state.activeTopicProjectIdByEditorProject[state.activeEditorProjectId];
				if (!projectId) return null;
				return (
					state.topicProjects.find((project) => project.id === projectId) ?? null
				);
			},

			recordPrompt: ({ editorProjectId, prompt }) => {
				const trimmed = prompt.trim();
				if (!trimmed) return;
				set((state) => {
					const normalizedEditorProjectId =
						editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
					const activeId =
						state.activeTopicProjectIdByEditorProject[
							normalizedEditorProjectId
						];
					const activeProject =
						state.topicProjects.find((project) => project.id === activeId) ??
						null;
					if (!activeProject) {
						const project = createTopicProjectFromPrompt({
							editorProjectId: normalizedEditorProjectId,
							prompt: trimmed,
						});
						return {
							activeEditorProjectId: normalizedEditorProjectId,
							topicProjects: [...state.topicProjects, project],
							activeTopicProjectIdByEditorProject: {
								...state.activeTopicProjectIdByEditorProject,
								[normalizedEditorProjectId]: project.id,
							},
						};
					}

					return {
						activeEditorProjectId: normalizedEditorProjectId,
						topicProjects: state.topicProjects.map((project) =>
							project.id === activeProject.id
								? mergePromptIntoProject({ project, prompt: trimmed })
								: project,
						),
					};
				});
			},

			createTopicProject: ({ editorProjectId, prompt }) => {
				const project = createTopicProjectFromPrompt({ editorProjectId, prompt });
				set((state) => ({
					activeWorkbench: "topic",
					activeEditorProjectId: editorProjectId || DEFAULT_EDITOR_PROJECT_ID,
					topicProjects: [...state.topicProjects, project],
					activeTopicProjectIdByEditorProject: {
						...state.activeTopicProjectIdByEditorProject,
						[editorProjectId || DEFAULT_EDITOR_PROJECT_ID]: project.id,
					},
				}));
			},

			selectCandidate: ({ candidateId }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => selectCandidate({ project, candidateId }),
					}),
				),

			updateCandidate: ({ candidateId, patch }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateCandidate({ project, candidateId, patch }),
					}),
				),

			confirmCandidate: () =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => confirmSelectedCandidate({ project }),
					}),
				),

			runResearch: () =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							const selected = project.candidates.find(
								(candidate) => candidate.id === project.selectedCandidateId,
							);
							if (!selected) return project;
							return {
								...project,
								stage: "research",
								researchSources: createResearchSources({
									candidate: selected,
								}),
								updatedAt: Date.now(),
							};
						},
					}),
				),

			prepareStructureOptions: () =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							const selected = project.candidates.find(
								(candidate) => candidate.id === project.selectedCandidateId,
							);
							if (!selected) return project;
							const withStructures = {
								...project,
								structures:
									project.structures.length > 0
										? project.structures
										: createStructureOptions({ candidate: selected }),
							};
							return advanceToStructureStage({ project: withStructures });
						},
					}),
				),

			selectStructure: ({ structureId }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => selectStructure({ project, structureId }),
					}),
				),

			createPackageVersion: () =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => addPackageVersion({ project }),
					}),
				),

			setActivePackageVersion: ({ versionId }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => ({
							...project,
							activePackageVersionId: versionId,
							updatedAt: Date.now(),
						}),
					}),
				),
		}),
		{
			name: "shotlyx-topic-workbench-v1",
			version: 1,
			storage: getStorage(),
			onRehydrateStorage: () => (state) => {
				state?.setIsHydrated({ isHydrated: true });
			},
			partialize: (state) => ({
				activeWorkbench: state.activeWorkbench,
				activeEditorProjectId: state.activeEditorProjectId,
				activeTopicProjectIdByEditorProject:
					state.activeTopicProjectIdByEditorProject,
				topicProjects: state.topicProjects,
			}),
		},
	),
);

