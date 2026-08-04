import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import { requireStringParam } from "./validation";

function isElementRefArray(value: unknown): value is Array<{
	trackId: string;
	elementId: string;
}> {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item !== null &&
				typeof item === "object" &&
				"trackId" in item &&
				"elementId" in item &&
				typeof item.trackId === "string" &&
				typeof item.elementId === "string",
		)
	);
}

export function buildSelectionTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "selection_select_clip",
			description: "选中时间线上的单个片段",
			parameters: {
				trackId: { type: "string", description: "包含该片段的轨道 ID" },
				elementId: { type: "string", description: "要选中的片段 ID" },
			},
			mutating: true,
			handler: (params) => {
				const trackId = requireStringParam(params, "trackId");
				const elementId = requireStringParam(params, "elementId");
				editor.selection.setSelectedElements({
					elements: [{ trackId, elementId }],
				});
				return { selected: 1, trackId, elementId };
			},
		},
		{
			name: "selection_select_elements",
			description: "通过引用批量选中多个片段",
			parameters: {
				elementRefs: {
					type: "array",
					description: "{ trackId, elementId } 数组",
					items: {
						type: "object",
						description: "片段引用",
						properties: {
							trackId: { type: "string", description: "轨道 ID" },
							elementId: { type: "string", description: "片段 ID" },
						},
					},
				},
			},
			mutating: true,
			handler: (params) => {
				if (!isElementRefArray(params.elementRefs)) {
					throw new Error(
						"参数格式错误：elementRefs 必须为 { trackId, elementId } 数组",
					);
				}
				editor.selection.setSelectedElements({
					elements: params.elementRefs,
				});
				return { selected: params.elementRefs.length };
			},
		},
		{
			name: "selection_clear",
			description: "清除所有选中状态",
			parameters: {},
			mutating: true,
			effect: "write",
			confirmation: "never",
			handler: () => {
				editor.selection.clearSelection();
				return { cleared: true };
			},
		},
		{
			name: "selection_get_state",
			description:
				"获取当前选中状态，包括选中类型和已选中的片段列表",
			parameters: {},
			handler: () => {
				const kind = editor.selection.getActiveSelectionKind();
				const elements = editor.selection.getSelectedElements();

				// Batch lookup for performance
				const withTracks = editor.timeline.getElementsWithTracks({
					elements,
				});
				const elementDetails = withTracks.map(({ track, element }) => ({
					trackId: track.id,
					elementId: element.id,
					name: element.name,
					type: element.type,
				}));

				// Include any refs that failed lookup with "unknown" fallback
				if (elementDetails.length < elements.length) {
					const foundIds = new Set(
						elementDetails.map((d) => d.elementId),
					);
					for (const ref of elements) {
						if (!foundIds.has(ref.elementId)) {
							elementDetails.push({
								trackId: ref.trackId,
								elementId: ref.elementId,
								name: "未知片段",
								type: "unknown" as import("@/timeline").ElementType,
							});
						}
					}
				}

				return {
					kind,
					elements: elementDetails,
					keyframesCount: editor.selection.getSelectedKeyframes().length,
				};
			},
		},
	];
}
