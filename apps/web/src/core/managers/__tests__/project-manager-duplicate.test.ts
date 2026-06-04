/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Tests patch the storage singleton and inspect private manager state. */
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { TProject, TProjectMetadata } from "@/project/types";
import type { ProjectManager as ProjectManagerType } from "../project-manager";

const { opencutWasmMock, wasmMock } = await import("@/test/wasm-mock");
mock.module("@/wasm", () => wasmMock);
mock.module("opencut-wasm", () => opencutWasmMock);
mock.module("sonner", () => ({
	toast: { error: mock(() => {}) },
}));

const { ProjectManager } = await import("../project-manager");
const { storageService } = await import("@/services/storage/service");
const originalConsoleError = console.error;

type StorageOverrides = {
	deleteProject: typeof storageService.deleteProject;
	deleteProjectMedia: typeof storageService.deleteProjectMedia;
	loadAllMediaAssets: typeof storageService.loadAllMediaAssets;
	loadProject: typeof storageService.loadProject;
	saveMediaAsset: typeof storageService.saveMediaAsset;
	saveProject: typeof storageService.saveProject;
};

const originalStorage: StorageOverrides = {
	deleteProject: storageService.deleteProject.bind(storageService),
	deleteProjectMedia: storageService.deleteProjectMedia.bind(storageService),
	loadAllMediaAssets: storageService.loadAllMediaAssets.bind(storageService),
	loadProject: storageService.loadProject.bind(storageService),
	saveMediaAsset: storageService.saveMediaAsset.bind(storageService),
	saveProject: storageService.saveProject.bind(storageService),
};

beforeEach(() => {
	mock.restore();
	console.error = mock(() => {}) as typeof console.error;
});

afterEach(() => {
	console.error = originalConsoleError;
	storageService.deleteProject = originalStorage.deleteProject;
	storageService.deleteProjectMedia = originalStorage.deleteProjectMedia;
	storageService.loadAllMediaAssets = originalStorage.loadAllMediaAssets;
	storageService.loadProject = originalStorage.loadProject;
	storageService.saveMediaAsset = originalStorage.saveMediaAsset;
	storageService.saveProject = originalStorage.saveProject;
	mock.restore();
});

function createProject({
	id,
	name,
}: {
	id: string;
	name: string;
}): TProject {
	const createdAt = new Date("2026-06-04T00:00:00.000Z");
	return {
		metadata: {
			id,
			name,
			duration: 0,
			createdAt,
			updatedAt: createdAt,
		},
		scenes: [],
		currentSceneId: "",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			canvasSizeMode: "preset",
			lastCustomCanvasSize: null,
			originalCanvasSize: null,
			background: { type: "color", color: "#000000" },
		},
		version: 31,
	};
}

function createMediaAsset({ id }: { id: string }): MediaAsset {
	return {
		id,
		name: `${id}.mp4`,
		type: "video",
		file: new File(["video bytes"], `${id}.mp4`, { type: "video/mp4" }),
	};
}

function createManager({
	savedProjects,
}: {
	savedProjects: TProjectMetadata[];
}) {
	const manager = new ProjectManager({} as unknown as EditorCore);
	Reflect.set(manager, "savedProjects", savedProjects);
	return manager as ProjectManagerType;
}

test("duplicateProjects cleans up the new project when media copy fails", async () => {
	const sourceProject = createProject({ id: "source-project", name: "Demo" });
	const savedProjects = [sourceProject.metadata];
	const manager = createManager({ savedProjects });
	const savedProjectIds: string[] = [];
	const deletedProjectIds: string[] = [];
	const deletedMediaProjectIds: string[] = [];

	storageService.loadProject = mock(async ({ id }) =>
		id === sourceProject.metadata.id ? { project: sourceProject } : null,
	) as typeof storageService.loadProject;
	storageService.saveProject = mock(async ({ project }) => {
		savedProjectIds.push(project.metadata.id);
	}) as typeof storageService.saveProject;
	storageService.loadAllMediaAssets = mock(async () => [
		createMediaAsset({ id: "media-1" }),
	]) as typeof storageService.loadAllMediaAssets;
	storageService.saveMediaAsset = mock(async () => {
		throw new Error("media copy failed");
	}) as typeof storageService.saveMediaAsset;
	storageService.deleteProject = mock(async ({ id }) => {
		deletedProjectIds.push(id);
	}) as typeof storageService.deleteProject;
	storageService.deleteProjectMedia = mock(async ({ projectId }) => {
		deletedMediaProjectIds.push(projectId);
	}) as typeof storageService.deleteProjectMedia;

	await expect(
		manager.duplicateProjects({ ids: [sourceProject.metadata.id] }),
	).rejects.toThrow("media copy failed");

	const newProjectId = savedProjectIds[0];
	expect(newProjectId).toBeString();
	expect(newProjectId).not.toBe(sourceProject.metadata.id);
	expect(deletedProjectIds).toEqual([newProjectId]);
	expect(deletedMediaProjectIds).toEqual([newProjectId]);
	expect(manager.getSavedProjects()).toEqual(savedProjects);
});
