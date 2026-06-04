import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIndexedDBPersistStorage } from "@/agent/chat/indexeddb-storage";
import {
	addPackageVersion,
	addResearchInsight,
	advanceToStructureStage,
	applyResearchSources,
	applyStructureOptions,
	confirmSelectedCandidate,
	createProductionPlan as createProductionPlanModel,
	createResearchSources,
	createStructureOptions,
	createTopicProjectFromDraft,
	createTopicProjectFromPrompt,
	getTopicProjectMode,
	mergePromptIntoProject,
	mergeTopicInputMaterials,
	removeTopicInputMaterial,
	replaceTopicCandidates,
	resetTopicProjectToStage,
	selectCandidate,
	selectStructure,
	toggleResearchInsightHidden,
	updateCandidate,
	updateResearchInsight,
	updateTopicInputMaterial,
	updateTopicPackageCoverIdea,
	updateTopicPackageOutlineItem,
	updateTopicPackagePlatformRecommendation,
	updateTopicPackageScriptSegment,
	updateTopicPackageVersion,
	type ProductionPlanDraft,
	type ResearchInsightDraft,
	type ResearchSourceDraft,
	type TopicCandidateDraft,
	type TopicInputMaterialPatch,
	type TopicInputMaterialDraft,
	type TopicPackageDraft,
	type TopicPackagePatch,
	type TopicPackagePlatformRecommendationPatch,
	type VideoStructureOptionDraft,
} from "./model";
import type {
	ScriptSegment,
	TopicInputMaterial,
	TopicCandidate,
	TopicStage,
	TopicWorkbenchAgentEvent,
	TopicProject,
	WorkbenchMode,
	ResearchInsight,
} from "./types";

interface PersistedTopicWorkbenchState {
	activeWorkbench: WorkbenchMode;
	activeEditorProjectId: string;
	activeTopicProjectIdByEditorProject: Record<string, string>;
	creatorProfile: string;
	pendingInputMaterialsByEditorProject: Record<string, TopicInputMaterial[]>;
	topicProjects: TopicProject[];
}

interface TopicWorkbenchState extends PersistedTopicWorkbenchState {
	isHydrated: boolean;
	pendingAgentEvent: TopicWorkbenchAgentEvent | null;
	setIsHydrated: ({ isHydrated }: { isHydrated: boolean }) => void;
	setActiveWorkbench: ({ mode }: { mode: WorkbenchMode }) => void;
	setActiveEditorProject: ({
		editorProjectId,
	}: {
		editorProjectId: string;
	}) => void;
	setCreatorProfile: ({ profile }: { profile: string }) => void;
	getActiveTopicProject: () => TopicProject | null;
	recordPrompt: ({
		editorProjectId,
		prompt,
	}: {
		editorProjectId: string;
		prompt: string;
	}) => void;
	recordInputMaterials: ({
		editorProjectId,
		materials,
	}: {
		editorProjectId: string;
		materials: TopicInputMaterialDraft[];
	}) => void;
	createTopicProject: ({
		editorProjectId,
		prompt,
	}: {
		editorProjectId: string;
		prompt: string;
	}) => void;
	startBrainstormDraft: ({
		editorProjectId,
		draft,
	}: {
		editorProjectId: string;
		draft: string;
	}) => void;
	promoteBrainstormToWorkflow: () => void;
	replaceCandidates: ({
		editorProjectId,
		prompt,
		candidates,
		inputMaterials,
	}: {
		editorProjectId: string;
		prompt?: string;
		candidates: TopicCandidateDraft[];
		inputMaterials?: TopicInputMaterialDraft[];
	}) => TopicProject | null;
	applyResearchSources: ({
		sources,
		insights,
	}: {
		sources: ResearchSourceDraft[];
		insights?: ResearchInsightDraft[];
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
	updateInputMaterial: ({
		materialId,
		patch,
	}: {
		materialId: string;
		patch: TopicInputMaterialPatch;
	}) => void;
	removeInputMaterial: ({ materialId }: { materialId: string }) => void;
	toggleResearchInsightHidden: ({
		insightId,
		hidden,
	}: {
		insightId: string;
		hidden?: boolean;
	}) => void;
	addResearchInsight: ({
		title,
		content,
		sourceIds,
	}: {
		title: string;
		content: string;
		sourceIds?: string[];
	}) => void;
	updateResearchInsight: ({
		insightId,
		patch,
	}: {
		insightId: string;
		patch: Partial<Pick<ResearchInsight, "title" | "content" | "sourceIds">>;
	}) => void;
	confirmCandidate: () => void;
	runResearch: () => void;
	prepareStructureOptions: () => void;
	selectStructure: ({ structureId }: { structureId: string }) => void;
	createPackageVersion: ({
		draft,
	}?: {
		draft?: TopicPackageDraft;
	}) => TopicProject | null;
	createProductionPlan: ({
		draft,
	}: {
		draft?: ProductionPlanDraft;
	}) => TopicProject | null;
	setActivePackageVersion: ({ versionId }: { versionId: string }) => void;
	updatePackageVersion: ({
		versionId,
		patch,
	}: {
		versionId?: string;
		patch: TopicPackagePatch;
	}) => void;
	updatePackageOutlineItem: ({
		versionId,
		outlineIndex,
		value,
	}: {
		versionId?: string;
		outlineIndex: number;
		value: string;
	}) => void;
	updatePackagePlatformRecommendation: ({
		versionId,
		recommendationIndex,
		patch,
	}: {
		versionId?: string;
		recommendationIndex: number;
		patch: TopicPackagePlatformRecommendationPatch;
	}) => void;
	updatePackageCoverIdea: ({
		versionId,
		coverIndex,
		value,
	}: {
		versionId?: string;
		coverIndex: number;
		value: string;
	}) => void;
	updateScriptSegment: ({
		versionId,
		segmentIndex,
		patch,
	}: {
		versionId?: string;
		segmentIndex: number;
		patch: Partial<ScriptSegment>;
	}) => void;
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
}: Omit<
	TopicWorkbenchAgentEvent,
	"id" | "createdAt"
>): TopicWorkbenchAgentEvent {
	return {
		id: `topic-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		editorProjectId,
		content,
		autoRun,
		source,
		createdAt: Date.now(),
	};
}

function updatePendingInputMaterial({
	state,
	materialId,
	patch,
}: {
	state: TopicWorkbenchState;
	materialId: string;
	patch: TopicInputMaterialPatch;
}): Pick<TopicWorkbenchState, "pendingInputMaterialsByEditorProject"> {
	const editorProjectId =
		state.activeEditorProjectId || DEFAULT_EDITOR_PROJECT_ID;
	const pendingMaterials =
		(state.pendingInputMaterialsByEditorProject ?? {})[editorProjectId] ?? [];
	if (!pendingMaterials.some((material) => material.id === materialId)) {
		return {
			pendingInputMaterialsByEditorProject:
				state.pendingInputMaterialsByEditorProject,
		};
	}

	return {
		pendingInputMaterialsByEditorProject: {
			...(state.pendingInputMaterialsByEditorProject ?? {}),
			[editorProjectId]: pendingMaterials.map((material) =>
				material.id === materialId
					? {
							...material,
							title: patch.title
								? patch.title.trim().slice(0, 80) || material.title
								: material.title,
							summary:
								patch.summary !== undefined
									? patch.summary.trim() || undefined
									: material.summary,
							content:
								patch.content !== undefined
									? patch.content.slice(0, 6000)
									: material.content,
						}
					: material,
			),
		},
	};
}

function removePendingInputMaterial({
	state,
	materialId,
}: {
	state: TopicWorkbenchState;
	materialId: string;
}): Pick<TopicWorkbenchState, "pendingInputMaterialsByEditorProject"> {
	const editorProjectId =
		state.activeEditorProjectId || DEFAULT_EDITOR_PROJECT_ID;
	const pendingMaterials =
		(state.pendingInputMaterialsByEditorProject ?? {})[editorProjectId] ?? [];
	if (!pendingMaterials.some((material) => material.id === materialId)) {
		return {
			pendingInputMaterialsByEditorProject:
				state.pendingInputMaterialsByEditorProject,
		};
	}

	return {
		pendingInputMaterialsByEditorProject: {
			...(state.pendingInputMaterialsByEditorProject ?? {}),
			[editorProjectId]: pendingMaterials.filter(
				(material) => material.id !== materialId,
			),
		},
	};
}

export const useTopicWorkbenchStore = create<TopicWorkbenchState>()(
	persist(
		(set, get) => ({
			activeWorkbench: "video",
			activeEditorProjectId: DEFAULT_EDITOR_PROJECT_ID,
			activeTopicProjectIdByEditorProject: {},
			creatorProfile: "",
			pendingInputMaterialsByEditorProject: {},
			topicProjects: [],
			isHydrated: typeof window === "undefined",
			pendingAgentEvent: null,

			setIsHydrated: ({ isHydrated }) => set({ isHydrated }),
			setActiveWorkbench: ({ mode }) => set({ activeWorkbench: mode }),
			setActiveEditorProject: ({ editorProjectId }) =>
				set({
					activeEditorProjectId: editorProjectId || DEFAULT_EDITOR_PROJECT_ID,
				}),
			setCreatorProfile: ({ profile }) =>
				set({ creatorProfile: profile.trim() }),

			getActiveTopicProject: () => {
				const state = get();
				const projectId =
					state.activeTopicProjectIdByEditorProject[
						state.activeEditorProjectId
					];
				if (!projectId) return null;
				return (
					state.topicProjects.find((project) => project.id === projectId) ??
					null
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
						const pendingMaterials =
							(state.pendingInputMaterialsByEditorProject ?? {})[
								normalizedEditorProjectId
							] ?? [];
						const project = createTopicProjectFromPrompt({
							editorProjectId: normalizedEditorProjectId,
							prompt: trimmed,
							inputMaterials: pendingMaterials,
						});
						return {
							activeEditorProjectId: normalizedEditorProjectId,
							topicProjects: [...state.topicProjects, project],
							activeTopicProjectIdByEditorProject: {
								...state.activeTopicProjectIdByEditorProject,
								[normalizedEditorProjectId]: project.id,
							},
							pendingInputMaterialsByEditorProject: {
								...(state.pendingInputMaterialsByEditorProject ?? {}),
								[normalizedEditorProjectId]: [],
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

			recordInputMaterials: ({ editorProjectId, materials }) => {
				if (materials.length === 0) return;
				const normalizedEditorProjectId =
					editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
				set((state) => {
					const activeId =
						state.activeTopicProjectIdByEditorProject[
							normalizedEditorProjectId
						];
					const activeProject =
						state.topicProjects.find((project) => project.id === activeId) ??
						null;
					const existingPending =
						(state.pendingInputMaterialsByEditorProject ?? {})[
							normalizedEditorProjectId
						] ?? [];
					const nextPending = mergeTopicInputMaterials({
						existing: existingPending,
						incoming: materials,
					});

					if (!activeProject) {
						return {
							activeEditorProjectId: normalizedEditorProjectId,
							pendingInputMaterialsByEditorProject: {
								...(state.pendingInputMaterialsByEditorProject ?? {}),
								[normalizedEditorProjectId]: nextPending,
							},
						};
					}

					const nextProjectMaterials = mergeTopicInputMaterials({
						existing: activeProject.inputMaterials ?? [],
						incoming: materials,
					});
					return {
						activeEditorProjectId: normalizedEditorProjectId,
						pendingInputMaterialsByEditorProject: {
							...(state.pendingInputMaterialsByEditorProject ?? {}),
							[normalizedEditorProjectId]: nextPending,
						},
						topicProjects: state.topicProjects.map((project) =>
							project.id === activeProject.id
								? {
										...project,
										inputMaterials: nextProjectMaterials,
										updatedAt: Date.now(),
									}
								: project,
						),
					};
				});
			},

			createTopicProject: ({ editorProjectId, prompt }) => {
				const normalizedEditorProjectId =
					editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
				const pendingMaterials =
					(get().pendingInputMaterialsByEditorProject ?? {})[
						normalizedEditorProjectId
					] ?? [];
				const project = createTopicProjectFromPrompt({
					editorProjectId: normalizedEditorProjectId,
					prompt,
					inputMaterials: pendingMaterials,
				});
				set((state) => ({
					activeWorkbench: "topic",
					activeEditorProjectId: normalizedEditorProjectId,
					topicProjects: [...state.topicProjects, project],
					activeTopicProjectIdByEditorProject: {
						...state.activeTopicProjectIdByEditorProject,
						[normalizedEditorProjectId]: project.id,
					},
					pendingInputMaterialsByEditorProject: {
						...(state.pendingInputMaterialsByEditorProject ?? {}),
						[normalizedEditorProjectId]: [],
					},
				}));
			},

			startBrainstormDraft: ({ editorProjectId, draft }) => {
				const normalizedEditorProjectId =
					editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
				set((state) => {
					const pendingMaterials =
						(state.pendingInputMaterialsByEditorProject ?? {})[
							normalizedEditorProjectId
						] ?? [];
					const activeId =
						state.activeTopicProjectIdByEditorProject[
							normalizedEditorProjectId
						];
					const activeProject =
						state.topicProjects.find((project) => project.id === activeId) ??
						null;

					if (
						activeProject &&
						getTopicProjectMode(activeProject) === "brainstorm"
					) {
						const nextInputMaterials = mergeTopicInputMaterials({
							existing: activeProject.inputMaterials ?? [],
							incoming: [
								...pendingMaterials,
								{
									id: "material-brainstorm-draft",
									kind: "note",
									title: "我的草稿",
									summary: "选题前的自由草稿。",
									content: draft.trim() || undefined,
								},
							],
						});
						return {
							activeWorkbench: "topic",
							activeEditorProjectId: normalizedEditorProjectId,
							topicProjects: state.topicProjects.map((project) =>
								project.id === activeProject.id
									? {
											...project,
											title: draft.trim() || project.title,
											originPrompt: draft.trim(),
											inputMaterials: nextInputMaterials,
											updatedAt: Date.now(),
										}
									: project,
							),
							pendingInputMaterialsByEditorProject: {
								...(state.pendingInputMaterialsByEditorProject ?? {}),
								[normalizedEditorProjectId]: [],
							},
						};
					}

					const project = createTopicProjectFromDraft({
						editorProjectId: normalizedEditorProjectId,
						draft,
						inputMaterials: pendingMaterials,
					});
					return {
						activeWorkbench: "topic",
						activeEditorProjectId: normalizedEditorProjectId,
						topicProjects: [...state.topicProjects, project],
						activeTopicProjectIdByEditorProject: {
							...state.activeTopicProjectIdByEditorProject,
							[normalizedEditorProjectId]: project.id,
						},
						pendingInputMaterialsByEditorProject: {
							...(state.pendingInputMaterialsByEditorProject ?? {}),
							[normalizedEditorProjectId]: [],
						},
					};
				});
			},

			promoteBrainstormToWorkflow: () => {
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							getTopicProjectMode(project) === "brainstorm"
								? {
										...project,
										mode: "workflow",
										status: "active",
										updatedAt: Date.now(),
									}
								: project,
					}),
				);
			},

			replaceCandidates: ({
				editorProjectId,
				prompt,
				candidates,
				inputMaterials,
			}) => {
				const normalizedEditorProjectId =
					editorProjectId || DEFAULT_EDITOR_PROJECT_ID;
				let nextProject: TopicProject | null = null;
				set((state) => {
					const pendingMaterials =
						(state.pendingInputMaterialsByEditorProject ?? {})[
							normalizedEditorProjectId
						] ?? [];
					const nextInputMaterials = [
						...pendingMaterials,
						...(inputMaterials ?? []),
					];
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
							inputMaterials: nextInputMaterials,
						});
						nextProject = replaceTopicCandidates({
							project: nextProject,
							prompt: fallbackPrompt,
							candidates,
							inputMaterials: nextInputMaterials,
						});
						return {
							activeEditorProjectId: normalizedEditorProjectId,
							topicProjects: [...state.topicProjects, nextProject],
							activeTopicProjectIdByEditorProject: {
								...state.activeTopicProjectIdByEditorProject,
								[normalizedEditorProjectId]: nextProject.id,
							},
							pendingInputMaterialsByEditorProject: {
								...(state.pendingInputMaterialsByEditorProject ?? {}),
								[normalizedEditorProjectId]: [],
							},
						};
					}

					nextProject = replaceTopicCandidates({
						project: activeProject,
						prompt: fallbackPrompt,
						candidates,
						inputMaterials: nextInputMaterials,
					});
					return {
						activeEditorProjectId: normalizedEditorProjectId,
						topicProjects: state.topicProjects.map((project) =>
							project.id === activeProject.id ? nextProject! : project,
						),
						pendingInputMaterialsByEditorProject: {
							...(state.pendingInputMaterialsByEditorProject ?? {}),
							[normalizedEditorProjectId]: [],
						},
					};
				});
				return nextProject;
			},

			applyResearchSources: ({ sources, insights }) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = applyResearchSources({
								project,
								sources,
								insights,
							});
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

			updateInputMaterial: ({ materialId, patch }) =>
				set((state) => ({
					...updateActiveProject({
						state,
						updater: (project) =>
							updateTopicInputMaterial({ project, materialId, patch }),
					}),
					...updatePendingInputMaterial({ state, materialId, patch }),
				})),

			removeInputMaterial: ({ materialId }) =>
				set((state) => ({
					...updateActiveProject({
						state,
						updater: (project) =>
							removeTopicInputMaterial({ project, materialId }),
					}),
					...removePendingInputMaterial({ state, materialId }),
				})),

			toggleResearchInsightHidden: ({ insightId, hidden }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							toggleResearchInsightHidden({ project, insightId, hidden }),
					}),
				),

			addResearchInsight: ({ title, content, sourceIds }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							addResearchInsight({ project, title, content, sourceIds }),
					}),
				),

			updateResearchInsight: ({ insightId, patch }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateResearchInsight({ project, insightId, patch }),
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

			createPackageVersion: ({ draft } = {}) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = addPackageVersion({ project, draft });
							return nextProject;
						},
					}),
				);
				return nextProject;
			},

			createProductionPlan: ({ draft }) => {
				let nextProject: TopicProject | null = null;
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							nextProject = createProductionPlanModel({ project, draft });
							return nextProject;
						},
					}),
				);
				return nextProject;
			},

			setActivePackageVersion: ({ versionId }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) => {
							const hasVersion = project.packageVersions.some(
								(version) => version.id === versionId,
							);
							if (!hasVersion) return project;
							return {
								...project,
								stage: "package",
								status: "ready-for-video",
								activePackageVersionId: versionId,
								activeProductionPlanId: null,
								updatedAt: Date.now(),
							};
						},
					}),
				),

			updatePackageVersion: ({ versionId, patch }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateTopicPackageVersion({ project, versionId, patch }),
					}),
				),

			updatePackageOutlineItem: ({ versionId, outlineIndex, value }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateTopicPackageOutlineItem({
								project,
								versionId,
								outlineIndex,
								value,
							}),
					}),
				),

			updatePackagePlatformRecommendation: ({
				versionId,
				recommendationIndex,
				patch,
			}) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateTopicPackagePlatformRecommendation({
								project,
								versionId,
								recommendationIndex,
								patch,
							}),
					}),
				),

			updatePackageCoverIdea: ({ versionId, coverIndex, value }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateTopicPackageCoverIdea({
								project,
								versionId,
								coverIndex,
								value,
							}),
					}),
				),

			updateScriptSegment: ({ versionId, segmentIndex, patch }) =>
				set((state) =>
					updateActiveProject({
						state,
						updater: (project) =>
							updateTopicPackageScriptSegment({
								project,
								versionId,
								segmentIndex,
								patch,
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
				creatorProfile: state.creatorProfile,
				pendingInputMaterialsByEditorProject:
					state.pendingInputMaterialsByEditorProject,
				topicProjects: state.topicProjects,
			}),
		},
	),
);
