import type { EditorCore } from "@/core";
import { compactBrandKit } from "@/brand-kit/compact";
import { compactReferencesForModel } from "@/agent/context/reference-format";
import { useAgentContextStore } from "@/agent/context/store";
import type { Tool } from "./types";

export function buildContextTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "agent_context_get",
			description:
				"获取用户在 Agent 输入区添加的引用上下文，包括素材、时间线片段、轨道和主焦点",
			parameters: {},
			handler: () => {
				const state = useAgentContextStore.getState();
				return {
					...compactReferencesForModel({
						references: state.draftReferences,
						primaryReferenceId: state.primaryReferenceId,
					}),
					pointSelectEnabled: state.pointSelectEnabled,
				};
			},
		},
		{
			name: "brand_get_active",
			description:
				"获取当前启用的全局品牌套件摘要。没有启用品牌套件时返回 null。",
			parameters: {},
			handler: () => {
				const kit = editor.project.getActiveBrandKit();
				return kit ? compactBrandKit({ kit }) : null;
			},
		},
		{
			name: "brand_list_kits",
			description: "列出全局可用的品牌套件摘要",
			parameters: {},
			handler: () => ({
				kits: editor.project
					.getBrandKits()
					.map((kit) => compactBrandKit({ kit })),
			}),
		},
	];
}
