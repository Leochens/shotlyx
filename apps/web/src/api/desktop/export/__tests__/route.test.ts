/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- Route tests pass standard Request objects into route handlers. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { clearDesktopExportTargetsForTests } from "@/desktop/export/server";

const originalEnv = { ...process.env };
let tempDir = "";

beforeEach(() => {
	tempDir = mkdtempSync(path.join(tmpdir(), "shotlyx-desktop-export-"));
	process.env = {
		...originalEnv,
		SHOTLYX_DESKTOP: "1",
	};
	clearDesktopExportTargetsForTests();
});

afterEach(() => {
	clearDesktopExportTargetsForTests();
	process.env = { ...originalEnv };
	rmSync(tempDir, { recursive: true, force: true });
});

test("desktop export target route selects a file before export and writes to that target", async () => {
	const selectedPath = path.join(tempDir, "exports", "demo");
	process.env.SHOTLYX_DESKTOP_EXPORT_TEST_PATH = selectedPath;

	const { POST: selectTarget } = await import("../select/route");
	const selectResponse = await selectTarget(
		new Request("http://localhost/api/desktop/export/select", {
			body: JSON.stringify({
				format: "mp4",
				suggestedName: "Unsafe/Project:Name.mp4",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}) as Parameters<typeof selectTarget>[0],
	);

	expect(selectResponse.status).toBe(200);
	const selected = (await selectResponse.json()) as {
		cancelled: false;
		target: { fileName: string; filePath: string; id: string };
	};
	expect(selected.cancelled).toBe(false);
	expect(selected.target.fileName).toBe("demo.mp4");
	expect(selected.target.filePath).toBe(`${selectedPath}.mp4`);
	expect(existsSync(selected.target.filePath)).toBe(false);

	const { POST: writeFile } = await import("../file/route");
	const writeResponse = await writeFile(
		new Request("http://localhost/api/desktop/export/file", {
			body: new Blob(["video bytes"], { type: "video/mp4" }),
			headers: {
				"Content-Type": "video/mp4",
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeFile>[0],
	);

	expect(writeResponse.status).toBe(200);
	expect(await writeResponse.json()).toMatchObject({
		desktop: true,
		filePath: selected.target.filePath,
		sizeBytes: "video bytes".length,
	});
	expect(readFileSync(selected.target.filePath, "utf8")).toBe("video bytes");

	const reusedTargetResponse = await writeFile(
		new Request("http://localhost/api/desktop/export/file", {
			body: new Blob(["again"], { type: "video/mp4" }),
			headers: {
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeFile>[0],
	);
	expect(reusedTargetResponse.status).toBe(404);
});

test("desktop export target route can cancel before export starts", async () => {
	process.env.SHOTLYX_DESKTOP_EXPORT_TEST_CANCEL = "1";

	const { POST } = await import("../select/route");
	const response = await POST(
		new Request("http://localhost/api/desktop/export/select", {
			body: JSON.stringify({
				format: "webm",
				suggestedName: "demo.webm",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}) as Parameters<typeof POST>[0],
	);

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		cancelled: true,
		desktop: true,
		target: null,
	});
});

test("desktop export routes are disabled outside desktop mode", async () => {
	delete process.env.SHOTLYX_DESKTOP;
	delete process.env.VITE_SHOTLYX_DESKTOP;

	const { POST: selectTarget } = await import("../select/route");
	const selectResponse = await selectTarget(
		new Request("http://localhost/api/desktop/export/select", {
			body: JSON.stringify({
				format: "mp4",
				suggestedName: "demo.mp4",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}) as Parameters<typeof selectTarget>[0],
	);
	expect(selectResponse.status).toBe(403);

	const { POST: writeFile } = await import("../file/route");
	const writeResponse = await writeFile(
		new Request("http://localhost/api/desktop/export/file", {
			body: new Blob(["video"], { type: "video/mp4" }),
			headers: { "X-Shotlyx-Export-Target": "target" },
			method: "POST",
		}) as Parameters<typeof writeFile>[0],
	);
	expect(writeResponse.status).toBe(403);
});
