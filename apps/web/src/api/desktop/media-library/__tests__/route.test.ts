/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Route tests pass standard Request objects into ApiRequest-typed handlers. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeDesktopMediaLibraryConfig } from "@/desktop/media-library/server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-media-library-route-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
		SHOTLYX_DESKTOP_MEDIA_LIBRARY_CONFIG_PATH: path.join(tempDir, "config.json"),
	};
});

afterEach(() => {
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop media library route reports the active library", async () => {
	const libraryDirectory = path.join(tempDir, "library");
	writeDesktopMediaLibraryConfig({ directory: libraryDirectory });

	const { GET } = await import("../route");
	const response = await GET(
		new Request(
			"http://localhost/api/desktop/media-library?projectId=project-a",
		) as Parameters<typeof GET>[0],
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		desktop: true,
		directory: libraryDirectory,
		projectId: "project-a",
	});
});

test("desktop media library route can select a new folder without opening a system dialog in tests", async () => {
	const selectedDirectory = path.join(tempDir, "selected-library");
	process.env.SHOTLYX_DESKTOP_MEDIA_LIBRARY_TEST_SELECT_DIR = selectedDirectory;

	const { POST } = await import("../select/route");
	const response = await POST(
		new Request("http://localhost/api/desktop/media-library/select", {
			method: "POST",
		}) as Parameters<typeof POST>[0],
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		cancelled: false,
		directory: selectedDirectory,
	});
});

test("desktop media library files route writes and reads project media files", async () => {
	const libraryDirectory = path.join(tempDir, "library");
	writeDesktopMediaLibraryConfig({ directory: libraryDirectory });

	const { POST, GET, DELETE } = await import("../files/route");
	const saveResponse = await POST(
		new Request(
			"http://localhost/api/desktop/media-library/files?projectId=project-a&id=asset-1&name=demo.mp4",
			{
				body: new Blob(["hello video"], { type: "video/mp4" }),
				method: "POST",
			},
		) as Parameters<typeof POST>[0],
	);
	expect(saveResponse.status).toBe(200);
	const saved = await saveResponse.json();
	expect(saved).toMatchObject({
		id: "asset-1",
		name: "asset-1--demo.mp4",
	});
	expect(existsSync(saved.filePath)).toBe(true);

	const readResponse = await GET(
		new Request(
			"http://localhost/api/desktop/media-library/files?projectId=project-a&id=asset-1",
		) as Parameters<typeof GET>[0],
	);
	expect(readResponse.status).toBe(200);
	expect(readResponse.headers.get("Content-Type")).toBe("video/mp4");
	expect(await readResponse.text()).toBe("hello video");

	const deleteResponse = await DELETE(
		new Request(
			"http://localhost/api/desktop/media-library/files?projectId=project-a&id=asset-1",
			{ method: "DELETE" },
		) as Parameters<typeof DELETE>[0],
	);
	expect(deleteResponse.status).toBe(200);
	expect(existsSync(saved.filePath)).toBe(false);
});

test("desktop media library route is disabled outside desktop mode", async () => {
	delete process.env.SHOTLYX_DESKTOP;
	delete process.env.VITE_SHOTLYX_DESKTOP;

	const { GET } = await import("../route");
	const response = await GET(
		new Request("http://localhost/api/desktop/media-library") as Parameters<
			typeof GET
		>[0],
	);

	expect(response.status).toBe(403);
});
