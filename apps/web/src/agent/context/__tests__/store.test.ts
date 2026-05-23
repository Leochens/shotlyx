import { beforeEach, describe, expect, test } from "bun:test";
import { useAgentContextStore } from "@/agent/context/store";
import type { AgentContextReference } from "@/agent/context/types";

function createMediaReference({
	id,
	mediaAssetId,
}: {
	id: string;
	mediaAssetId: string;
}): AgentContextReference {
	return {
		id,
		kind: "media-asset",
		label: mediaAssetId,
		source: "manual-add",
		createdAt: 1,
		payload: {
			mediaAssetId,
			name: mediaAssetId,
			type: "image",
		},
	};
}

describe("agent context store", () => {
	beforeEach(() => {
		useAgentContextStore.setState({
			draftReferences: [],
			primaryReferenceId: null,
			pointSelectEnabled: false,
		});
	});

	test("deduplicates references by target and keeps primary stable", () => {
		useAgentContextStore
			.getState()
			.addReference(createMediaReference({ id: "ref_1", mediaAssetId: "media_1" }));
		useAgentContextStore
			.getState()
			.addReference(createMediaReference({ id: "ref_2", mediaAssetId: "media_1" }));

		const state = useAgentContextStore.getState();
		expect(state.draftReferences).toHaveLength(1);
		expect(state.draftReferences[0]?.id).toBe("ref_1");
		expect(state.primaryReferenceId).toBe("ref_1");
	});

	test("falls back to the previous reference when primary is removed", () => {
		useAgentContextStore
			.getState()
			.addReference(createMediaReference({ id: "ref_1", mediaAssetId: "media_1" }));
		useAgentContextStore
			.getState()
			.addReference(createMediaReference({ id: "ref_2", mediaAssetId: "media_2" }));

		useAgentContextStore.getState().removeReference("ref_2");

		const state = useAgentContextStore.getState();
		expect(state.primaryReferenceId).toBe("ref_1");
	});
});
