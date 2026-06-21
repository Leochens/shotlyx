import { describe, expect, test } from "bun:test";
import {
	compactReferenceForModel,
	compactReferencesForModel,
	isAgentContextReference,
} from "@/agent/context/reference-format";
import type {
	AgentContextReference,
	AgentMediaAssetReference,
	AgentTopicWorkbenchReference,
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

	test("keeps source material content for topic ideation", () => {
		const sourceMaterial: AgentContextReference = {
			id: "ref_script",
			kind: "source-material",
			label: "录屏脚本",
			source: "topic-material",
			createdAt: 3,
			payload: {
				materialId: "material-1",
				materialType: "screen-recording",
				name: "录屏脚本",
				summary: "讲解一个 AI 剪辑工作流的录屏。",
				content: "这是脚本正文。".repeat(140),
			},
		};

		const compact = compactReferenceForModel(sourceMaterial);
		const serialized = JSON.stringify(compact);

		expect(compact).toMatchObject({
			id: "ref_script",
			kind: "source-material",
			materialType: "screen-recording",
			name: "录屏脚本",
		});
		expect(serialized).toContain("这是脚本正文。".repeat(80));
		expect(serialized).not.toContain("[hidden data url]");
	});

	test("keeps topic workbench task content for deferred agent instructions", () => {
		const payload = {
			eventId: "event-script-4",
			eventSource: "script-segment-edit",
			name: "选题工作台：第 4 段逐字稿",
			summary: "修改第 4 段逐字稿。",
			content: "请修改右侧选题包里的第 4 个时间段逐字稿。",
		} satisfies AgentTopicWorkbenchReference;
		const reference: AgentContextReference = {
			id: "ref_topic_workbench",
			kind: "topic-workbench",
			label: payload.name,
			source: "topic-workbench",
			createdAt: 4,
			payload,
		};

		expect(isAgentContextReference(reference)).toBe(true);
		expect(compactReferenceForModel(reference)).toMatchObject({
			id: "ref_topic_workbench",
			kind: "topic-workbench",
			eventId: "event-script-4",
			eventSource: "script-segment-edit",
			content: payload.content,
		});
	});
});
