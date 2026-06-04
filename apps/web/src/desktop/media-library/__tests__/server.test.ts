import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	buildStoredMediaFileName,
	changeDesktopMediaLibraryDirectory,
	deleteDesktopMediaAssetFile,
	findDesktopMediaAssetFile,
	getDefaultDesktopMediaLibraryDirectory,
	readDesktopMediaLibraryConfig,
	saveDesktopMediaAssetFile,
	writeDesktopMediaLibraryConfig,
} from "../server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-media-library-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP_MEDIA_LIBRARY_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop media library defaults to a readable user media folder", () => {
	expect(
		getDefaultDesktopMediaLibraryDirectory({
			homeDir: "/Users/alice",
			platform: "darwin",
		}),
	).toBe(path.join("/Users/alice", "Movies", "Shotlyx Library"));
	expect(
		getDefaultDesktopMediaLibraryDirectory({
			homeDir: "C:\\Users\\Alice",
			platform: "win32",
		}),
	).toBe(path.join("C:\\Users\\Alice", "Videos", "Shotlyx Library"));
});

test("desktop media library config stores a normalized custom directory", () => {
	const customDirectory = path.join(tempDir, "Media Library");
	const config = writeDesktopMediaLibraryConfig({
		directory: `${customDirectory}${path.sep}`,
	});

	expect(config.directory).toBe(customDirectory);
	expect(readDesktopMediaLibraryConfig().directory).toBe(customDirectory);
});

test("stored media filenames keep asset id stable and sanitize user filenames", () => {
	expect(
		buildStoredMediaFileName({
			assetId: "asset_123",
			name: "../Demo: Clip?.mp4",
		}),
	).toBe("asset_123--Demo_ Clip_.mp4");
});

test("desktop media library saves, finds, reads, and deletes files by asset id", async () => {
	const libraryDirectory = path.join(tempDir, "library");
	writeDesktopMediaLibraryConfig({ directory: libraryDirectory });

	const saved = await saveDesktopMediaAssetFile({
		assetId: "media-1",
		blob: new Blob(["video bytes"], { type: "video/mp4" }),
		name: "screen recording.mp4",
		projectId: "project-a",
	});

	expect(saved.filePath).toBe(
		path.join(
			libraryDirectory,
			"projects",
			"project-a",
			"media",
			"media-1--screen recording.mp4",
		),
	);
	expect(readFileSync(saved.filePath, "utf8")).toBe("video bytes");

	const found = await findDesktopMediaAssetFile({
		assetId: "media-1",
		projectId: "project-a",
	});
	expect(found).toMatchObject({
		filePath: saved.filePath,
		name: "media-1--screen recording.mp4",
	});

	await deleteDesktopMediaAssetFile({
		assetId: "media-1",
		projectId: "project-a",
	});
	expect(existsSync(saved.filePath)).toBe(false);
});

test("changing the desktop media library directory copies existing files", async () => {
	const oldDirectory = path.join(tempDir, "old-library");
	const newDirectory = path.join(tempDir, "new-library");
	writeDesktopMediaLibraryConfig({ directory: oldDirectory });
	await saveDesktopMediaAssetFile({
		assetId: "media-1",
		blob: new Blob(["existing bytes"], { type: "video/mp4" }),
		name: "existing.mp4",
		projectId: "project-a",
	});

	const config = await changeDesktopMediaLibraryDirectory({
		directory: newDirectory,
	});

	expect(config.directory).toBe(newDirectory);
	const migratedPath = path.join(
		newDirectory,
		"projects",
		"project-a",
		"media",
		"media-1--existing.mp4",
	);
	expect(readFileSync(migratedPath, "utf8")).toBe("existing bytes");
});
