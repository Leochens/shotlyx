import { afterEach, beforeEach, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildStoredMediaFileName,
	changeDesktopMediaLibraryDirectory,
	deleteDesktopMediaAssetFile,
	findDesktopMediaAssetFile,
	saveDesktopLinkedMediaAsset,
	saveDesktopMediaAssetStream,
} from "../server";
import {
	findDesktopProjectDirectory,
	listDesktopProjectMediaMetadata,
	readDesktopProjectLibraryConfig,
	saveDesktopProject,
	saveDesktopProjectMediaMetadata,
	writeDesktopProjectLibraryConfig,
} from "@/desktop/project-library/server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-project-library-"));
	process.env = {
		...originalEnv,
		SHOTLYX_PROJECTS_CONFIG_PATH: path.join(tempDir, "config.json"),
		SHOTLYX_PROJECTS_ROOT: path.join(tempDir, "Shotlyx Projects"),
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

async function createProject(projectId = "project-a") {
	await saveDesktopProject({
		project: {
			metadata: {
				id: projectId,
				name: "Demo Project",
				createdAt: "2026-07-31T00:00:00.000Z",
				updatedAt: "2026-07-31T00:00:00.000Z",
			},
			scenes: [],
		},
	});
}

test("desktop projects use visible .shotlyx directories", async () => {
	await createProject();
	const directory = await findDesktopProjectDirectory({
		projectId: "project-a",
	});
	expect(directory?.endsWith(".shotlyx")).toBe(true);
	expect(existsSync(path.join(directory ?? "", "project.json"))).toBe(true);
	expect(existsSync(path.join(directory ?? "", "media", "managed"))).toBe(true);
});

test("project library config stores a normalized custom directory", () => {
	const customDirectory = path.join(tempDir, "Projects");
	const config = writeDesktopProjectLibraryConfig({
		directory: `${customDirectory}${path.sep}`,
	});
	expect(config.directory).toBe(customDirectory);
	expect(readDesktopProjectLibraryConfig().directory).toBe(customDirectory);
});

test("stored media filenames keep asset id stable and sanitize user filenames", () => {
	expect(
		buildStoredMediaFileName({
			assetId: "asset_123",
			name: "../Demo: Clip?.mp4",
		}),
	).toBe("asset_123--Demo_ Clip_.mp4");
});

test("managed media is stored inside the project directory", async () => {
	await createProject();
	const saved = await saveDesktopMediaAssetStream({
		assetId: "media-1",
		contentType: "video/mp4",
		name: "screen recording.mp4",
		projectId: "project-a",
		stream: new Blob(["video bytes"]).stream(),
	});
	await saveDesktopProjectMediaMetadata({
		asset: {
			id: "media-1",
			name: "screen recording.mp4",
			storage: { mode: "managed" },
		},
		projectId: "project-a",
	});

	expect(saved.filePath).toContain(
		path.join(".shotlyx", "media", "managed", "media-1--screen recording.mp4"),
	);
	expect(readFileSync(saved.filePath, "utf8")).toBe("video bytes");
	expect(
		await findDesktopMediaAssetFile({
			assetId: "media-1",
			projectId: "project-a",
		}),
	).toMatchObject({ filePath: saved.filePath, storageMode: "managed" });

	await deleteDesktopMediaAssetFile({
		assetId: "media-1",
		projectId: "project-a",
	});
	expect(existsSync(saved.filePath)).toBe(false);
});

test("linked media stays outside the project until consolidated", async () => {
	await createProject();
	const sourcePath = path.join(tempDir, "original.mp4");
	writeFileSync(sourcePath, "original bytes");
	await saveDesktopProjectMediaMetadata({
		asset: {
			id: "media-1",
			name: "original.mp4",
			storage: { mode: "linked", sourcePath },
		},
		projectId: "project-a",
	});
	const linked = await saveDesktopLinkedMediaAsset({
		assetId: "media-1",
		projectId: "project-a",
		sourcePath,
	});
	expect(linked).toMatchObject({
		filePath: sourcePath,
		sourcePath,
		storageMode: "linked",
	});
});

test("parallel media writes keep every asset in project.json", async () => {
	await createProject();
	await Promise.all(
		["media-1", "media-2", "media-3"].map((id) =>
			saveDesktopProjectMediaMetadata({
				asset: { id, name: `${id}.mp4`, storage: { mode: "managed" } },
				projectId: "project-a",
			}),
		),
	);
	expect(
		(await listDesktopProjectMediaMetadata({ projectId: "project-a" }))
			.map((asset) => asset.id)
			.sort(),
	).toEqual(["media-1", "media-2", "media-3"]);
});

test("changing the project root copies existing .shotlyx directories", async () => {
	const oldDirectory = path.join(tempDir, "old-projects");
	const newDirectory = path.join(tempDir, "new-projects");
	writeDesktopProjectLibraryConfig({ directory: oldDirectory });
	await createProject();
	const oldProject = await findDesktopProjectDirectory({
		projectId: "project-a",
	});
	expect(oldProject).not.toBeNull();

	const config = await changeDesktopMediaLibraryDirectory({
		directory: newDirectory,
	});
	expect(config.directory).toBe(newDirectory);
	expect(
		existsSync(
			path.join(newDirectory, path.basename(oldProject ?? ""), "project.json"),
		),
	).toBe(true);
});
