import { describe, expect, test } from "bun:test";
import {
	compactReferenceForModel,
	compactReferencesForModel,
} from "@/agent/context/reference-format";
import type {
	AgentContextReference,
	AgentMediaAssetReference,
} from "@/agent/context/types";

function mediaReference(): AgentContextReference {
	const payload = {
		mediaAssetId: "media_1",
		name: "cover.png",
		type: "image",
		width: 1920,
		height: 1080,
		sizeBytes: 1200,
		url: "data:image/png;base64,too-large",
	} satisfies AgentMediaAssetReference & { url: string };

	return {
		id: "ref_media",
		kind: "media-asset",
		label: "cover.png",
		source: "manual-add",
		createdAt: 1,
		payload,
	};
}

describe("agent reference formatting", () => {
	test("compacts media references without large URLs", () => {
		const compact = compactReferenceForModel(mediaReference());
		expect(compact).toMatchObject({
			id: "ref_media",
			kind: "media-asset",
			mediaAssetId: "media_1",
			name: "cover.png",
			width: 1920,
			height: 1080,
		});
		expect(JSON.stringify(compact)).not.toContain("data:image");
	});

	test("keeps the primary reference first", () => {
		const first = mediaReference();
		const second: AgentContextReference = {
			id: "ref_element",
			kind: "timeline-element",
			label: "Title",
			source: "point-select",
			createdAt: 2,
			payload: {
				trackId: "track_1",
				elementId: "element_1",
				trackName: "Overlay",
				name: "Title",
				type: "text",
				startTimeSeconds: 0,
				durationSeconds: 3,
			},
		};

		const compact = compactReferencesForModel({
			references: [first, second],
			primaryReferenceId: second.id,
		});

		expect(compact.primaryReferenceId).toBe(second.id);
		expect(compact.references[0]?.id).toBe(second.id);
	});
});
