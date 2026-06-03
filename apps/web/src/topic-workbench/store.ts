import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "@/agent/chat/indexeddb-storage";
import {
	addPackageVersion,
	advanceToStructureStage,
	applyResearchSources,
	applyStructureOptions,
	confirmSelectedCandidate,
	createResearchSources,
	createStructureOptions,
	createTopicProjectFromPrompt,
	mergePromptIntoProject,
	replaceTopicCandidates,
	resetTopicProjectToStage,
	selectCandidate,
	selectStructure,
	updateCandidate,
	type ResearchSourceDraft,
	type TopicCandidateDraft,
	type VideoStructureOptionDraft,
} from "./model";
import type {
	TopicCandidate,
	TopicStage,
	TopicWorkbenchAgentEvent,
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
	pendingAgentEvent: TopicWorkbenchAgentEvent | null;
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
	replaceCandidates: ({
		editorProjectId,
		prompt,
		candidates,
	}: {
		editorProjectId: string;
		prompt?: string;
		candidates: TopicCandidateDraft[];
	}) => TopicProject | null;
	applyResearchSources: ({
		sources,
	}: {
		sources: ResearchSourceDraft[];
	}) => TopicProject | null;
	applyStructureOptions: ({
		structures,
	}: {
		structures: VideoStructureOptionDraft[];
	}) => TopicProject | null;
	resetToStage: ({ stage }: { stage: TopicStage }) => TopicProject | null;
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
	emitAgentEvent: ({
		editorProjectId,
		content,
		autoRun,
		source,
	}: Omit<TopicWorkbenchAgentEvent, "id" | "createdAt">) => void;
	consumeAgentEvent: ({ eventId }: { eventId: string }) => void;
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

function createAgentEvent({
	editorProjectId,
	content,
	autoRun,
	source,
}: Omit<TopicWorkbenchAgentEvent, "id" | "createdAt">): TopicWorkbenchAgentEvent {
	return {
		id: `topic-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		editorProjectId,
		content,
		autoRun,
		source,
		createdAt: Date.now(),
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
			pendingAgentEvent: null,

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

			replaceCandidates: ({ editorProjectId, prompt, candidates }) => {
				const normalizedEditorProjectId =
					editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
				let nextProject: TopicProject | null = null;
				set((state) => {
					const activeId =
						state.activeTopicProjectIdByEditorProject[
							normalizedEditorProjectId
						];
					const activeProject =
						state.topicProjects.find((project) => project.id === activeId) ??
						null;
					const fallbackPrompt =
						prompt?.trim() ||
						activeProject?.originPrompt ||
						activeProject?.title ||
						"新的选题方向";

					if (!activeProject) {
						nextProject = createTopicProjectFromPrompt({
							editorProjectId: normalizedEditorProjectId,
							prompt: fallbackPrompt,
						});
						nextProject = replaceTopicCandidates({
							project: nextProject,
							prompt: fallbackPrompt,
							candidates,
						});
						return {
							activeEditorProjectId: normalizedEditorProjectId,
							topicProjects: [...state.topicProjects, nextProject],
							activeTopicProjectIdByEditorProject: {
								...state.activeTopicProjectIdByEditorProject,
								[normalizedEditorProjectId]: nextProject.id,
							},
						};
					}

					nextProject = replaceTopicCandidates({
						project: activeProject,
						prompt: fallbackPrompt,
						candidates,
					});
					return {
						activeEditorProjectId: normalizedEditorProjectId,
						topicProjects: state.topicProjects.map((project) =>
							project.id === activeProject.id ? nextProject! : project,
						),
					};
				});
				return nextProject;
			},

			applyResearchSources: ({ sources }) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = applyResearchSources({ project, sources });
							return nextProject;
						},
					}),
				);
				return nextProject;
			},

			applyStructureOptions: ({ structures }) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = applyStructureOptions({ project, structures });
							return nextProject;
						},
					}),
				);
				return nextProject;
			},

			resetToStage: ({ stage }) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = resetTopicProjectToStage({ project, stage });
							return nextProject;
						},
					}),
				);
				return nextProject;
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

			emitAgentEvent: ({ editorProjectId, content, autoRun, source }) =>
				set({
					pendingAgentEvent: createAgentEvent({
						editorProjectId: editorProjectId || DEFAULT_EDITOR_PROJECT_ID,
						content,
						autoRun,
						source,
					}),
				}),

			consumeAgentEvent: ({ eventId }) =>
				set((state) =>
					state.pendingAgentEvent?.id === eventId
						? { pendingAgentEvent: null }
						: state,
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
