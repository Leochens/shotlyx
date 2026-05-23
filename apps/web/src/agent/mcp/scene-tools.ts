import type { EditorCore } from "@/core";
import type { Tool } from "./types";
import { requireStringParam, optionalStringParam } from "./validation";

export function buildSceneTools(editor: EditorCore): Tool[] {
	return [
		{
			name: "scene_get_list",
			description: "获取项目中的所有场景列表",
			parameters: {},
			handler: () => {
				const scenes = editor.scenes.getScenes();
				const active = editor.scenes.getActiveSceneOrNull();
				return {
					scenes: scenes.map((s) => ({
						id: s.id,
						name: s.name,
						isMain: s.isMain,
						isActive: s.id === active?.id,
						trackCount:
							1 + s.tracks.overlay.length + s.tracks.audio.length,
					})),
					activeSceneId: active?.id ?? null,
					count: scenes.length,
				};
			},
		},
		{
			name: "scene_get_active",
			description: "获取当前活动场景的详细信息",
			parameters: {},
			handler: () => {
				const active = editor.scenes.getActiveSceneOrNull();
				if (!active) {
					return { hasActiveScene: false };
				}
				const scenes = editor.scenes.getScenes();
				const index = scenes.findIndex((s) => s.id === active.id);
				const elementCount =
					active.tracks.main.elements.length +
					active.tracks.overlay.reduce(
						(sum, t) => sum + t.elements.length,
						0,
					) +
					active.tracks.audio.reduce(
						(sum, t) => sum + t.elements.length,
						0,
					);
				return {
					hasActiveScene: true,
					id: active.id,
					name: active.name,
					index,
					isMain: active.isMain,
					elementCount,
				};
			},
		},
		{
			name: "scene_switch",
			description: "切换到指定 ID 的场景",
			parameters: {
				sceneId: {
					type: "string",
					description: "要切换到的场景 ID",
				},
			},
			mutating: true,
			handler: async (params) => {
				const sceneId = requireStringParam(params, "sceneId");
				const previous = editor.scenes.getActiveSceneOrNull();
				await editor.scenes.switchToScene({ sceneId });
				return {
					switched: true,
					previousSceneId: previous?.id ?? null,
					newSceneId: sceneId,
				};
			},
		},
		{
			name: "scene_create",
			description: "创建新场景",
			parameters: {
				name: {
					type: "string",
					description: "新场景名称（可选）",
					optional: true,
				},
			},
			mutating: true,
			handler: async (params) => {
				const name = optionalStringParam(params, "name");
				const scenes = editor.scenes.getScenes();
				const sceneName = name ?? `场景 ${scenes.length + 1}`;
				const sceneId = await editor.scenes.createScene({
					name: sceneName,
					isMain: false,
				});
				return {
					sceneId,
					name: sceneName,
					index: scenes.length,
				};
			},
		},
		{
			name: "scene_rename",
			description: "重命名现有场景",
			parameters: {
				sceneId: {
					type: "string",
					description: "要重命名的场景 ID",
				},
				name: {
					type: "string",
					description: "新场景名称",
				},
			},
			mutating: true,
			handler: async (params) => {
				const sceneId = requireStringParam(params, "sceneId");
				const name = requireStringParam(params, "name");
				const scenes = editor.scenes.getScenes();
				const scene = scenes.find((s) => s.id === sceneId);
				if (!scene) {
					throw new Error(`场景不存在：找不到场景 "${sceneId}"`);
				}
				const oldName = scene.name;
				await editor.scenes.renameScene({ sceneId, name });
				return { renamed: true, oldName, newName: name };
			},
		},
		{
			name: "scene_delete",
			description: "删除场景。不能删除唯一剩余的场景。",
			parameters: {
				sceneId: {
					type: "string",
					description: "要删除的场景 ID",
				},
			},
			mutating: true,
			handler: async (params) => {
				const sceneId = requireStringParam(params, "sceneId");
				const scenes = editor.scenes.getScenes();
				if (scenes.length <= 1) {
					throw new Error("操作受限：不能删除唯一剩余的场景");
				}
				const scene = scenes.find((s) => s.id === sceneId);
				if (!scene) {
					throw new Error(`场景不存在：找不到场景 "${sceneId}"`);
				}
				await editor.scenes.deleteScene({ sceneId });
				return { deleted: true, sceneId };
			},
		},
	];
}
