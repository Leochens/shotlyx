import { create } from "zustand";
import type { AgentContextReference } from "./types";
import { getReferenceTargetKey } from "./reference-format";

interface AgentContextState {
	draftReferences: AgentContextReference[];
	primaryReferenceId: string | null;
	pointSelectEnabled: boolean;
	addReference: (reference: AgentContextReference) => void;
	removeReference: (id: string) => void;
	clearDraftReferences: () => void;
	setPrimaryReference: (id: string | null) => void;
	setPointSelectEnabled: (enabled: boolean) => void;
	togglePointSelect: () => void;
}

function nextPrimaryAfterRemove({
	references,
	removedId,
	currentPrimaryId,
}: {
	references: AgentContextReference[];
	removedId: string;
	currentPrimaryId: string | null;
}): string | null {
	if (currentPrimaryId !== removedId) return currentPrimaryId;
	return references[references.length - 1]?.id ?? null;
}

export const useAgentContextStore = create<AgentContextState>()((set) => ({
	draftReferences: [],
	primaryReferenceId: null,
	pointSelectEnabled: false,
	addReference: (reference) =>
		set((state) => {
			const targetKey = getReferenceTargetKey(reference);
			const existing = state.draftReferences.find(
				(item) => getReferenceTargetKey(item) === targetKey,
			);
			const nextReference = existing
				? {
						...reference,
						id: existing.id,
						createdAt: Date.now(),
					}
				: reference;
			const draftReferences = [
				...state.draftReferences.filter(
					(item) => getReferenceTargetKey(item) !== targetKey,
				),
				nextReference,
			];

			return {
				draftReferences,
				primaryReferenceId: nextReference.id,
			};
		}),
	removeReference: (id) =>
		set((state) => {
			const draftReferences = state.draftReferences.filter(
				(reference) => reference.id !== id,
			);
			return {
				draftReferences,
				primaryReferenceId: nextPrimaryAfterRemove({
					references: draftReferences,
					removedId: id,
					currentPrimaryId: state.primaryReferenceId,
				}),
			};
		}),
	clearDraftReferences: () =>
		set({
			draftReferences: [],
			primaryReferenceId: null,
		}),
	setPrimaryReference: (id) =>
		set((state) => ({
			primaryReferenceId:
				id && state.draftReferences.some((reference) => reference.id === id)
					? id
					: null,
		})),
	setPointSelectEnabled: (enabled) => set({ pointSelectEnabled: enabled }),
	togglePointSelect: () =>
		set((state) => ({ pointSelectEnabled: !state.pointSelectEnabled })),
}));
