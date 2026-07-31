import { describe, expect, test } from "bun:test";
import type { AgentContextReference } from "@/agent/context/types";
import { buildTopicInputMaterialsFromReferences } from "@/topic-workbench/input-materials";

describe("topic input materials", () => {
	test("converts media and source-material references into persisted topic materials", () => {
		const references: AgentContextReference[] = [
			{
				id: "ref_video",
				kind: "media-asset",
				label: "产品录屏.mp4",
				source: "manual-add",
				createdAt: 1,
				payload: {
					mediaAssetId: "media-1",
					name: "产品录屏.mp4",
					type: "video",
					durationSeconds: 95,
					sizeBytes: 1024,
				},
			},
			{
				id: "ref_script",
				kind: "source-material",
				label: "口播稿",
				source: "topic-material",
				createdAt: 2,
				payload: {
					materialId: "material-1",
					materialType: "script",
					name: "口播稿",
					content: "这期视频要讲怎样把长视频拆成短视频投放素材。",
				},
			},
		];

		const materials = buildTopicInputMaterialsFromReferences({ references });

		expect(materials).toEqual([
			expect.objectContaining({
				id: "material-media-1",
				kind: "screen-recording",
				title: "产品录屏.mp4",
				mediaAssetId: "media-1",
				durationSeconds: 95,
			}),
			expect.objectContaining({
				id: "material-1",
				kind: "script",
				title: "口播稿",
				content: "这期视频要讲怎样把长视频拆成短视频投放素材。",
			}),
		]);
	});
});
