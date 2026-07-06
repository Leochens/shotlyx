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

test("desktop export target route writes chunked export data by byte position", async () => {
	const selectedPath = path.join(tempDir, "exports", "chunked");
	process.env.SHOTLYX_DESKTOP_EXPORT_TEST_PATH = selectedPath;

	const { POST: selectTarget } = await import("../select/route");
	const selectResponse = await selectTarget(
		new Request("http://localhost/api/desktop/export/select", {
			body: JSON.stringify({
				format: "mp4",
				suggestedName: "chunked.mp4",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}) as Parameters<typeof selectTarget>[0],
	);
	const selected = (await selectResponse.json()) as {
		cancelled: false;
		target: { filePath: string; id: string };
	};

	const { POST: writeChunk } = await import("../chunk/route");
	const firstChunk = await writeChunk(
		new Request("http://localhost/api/desktop/export/chunk", {
			body: new Uint8Array([4, 5, 6]),
			headers: {
				"Content-Type": "application/octet-stream",
				"X-Shotlyx-Export-Position": "3",
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeChunk>[0],
	);
	expect(firstChunk.status).toBe(200);

	const secondChunk = await writeChunk(
		new Request("http://localhost/api/desktop/export/chunk", {
			body: new Uint8Array([1, 2, 3]),
			headers: {
				"Content-Type": "application/octet-stream",
				"X-Shotlyx-Export-Position": "0",
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeChunk>[0],
	);
	expect(secondChunk.status).toBe(200);

	const { POST: complete } = await import("../complete/route");
	const completeResponse = await complete(
		new Request("http://localhost/api/desktop/export/complete", {
			headers: {
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof complete>[0],
	);

	expect(completeResponse.status).toBe(200);
	expect(await completeResponse.json()).toMatchObject({
		desktop: true,
		filePath: selected.target.filePath,
		sizeBytes: 6,
	});
	expect(Array.from(readFileSync(selected.target.filePath))).toEqual([
		1, 2, 3, 4, 5, 6,
	]);

	const reusedChunkResponse = await writeChunk(
		new Request("http://localhost/api/desktop/export/chunk", {
			body: new Uint8Array([7]),
			headers: {
				"X-Shotlyx-Export-Position": "6",
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeChunk>[0],
	);
	expect(reusedChunkResponse.status).toBe(404);
});

test("desktop export target route aborts chunked export and removes the partial file", async () => {
	const selectedPath = path.join(tempDir, "exports", "aborted.mp4");
	process.env.SHOTLYX_DESKTOP_EXPORT_TEST_PATH = selectedPath;

	const { POST: selectTarget } = await import("../select/route");
	const selectResponse = await selectTarget(
		new Request("http://localhost/api/desktop/export/select", {
			body: JSON.stringify({
				format: "mp4",
				suggestedName: "aborted.mp4",
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}) as Parameters<typeof selectTarget>[0],
	);
	const selected = (await selectResponse.json()) as {
		cancelled: false;
		target: { filePath: string; id: string };
	};

	const { POST: writeChunk } = await import("../chunk/route");
	await writeChunk(
		new Request("http://localhost/api/desktop/export/chunk", {
			body: new Uint8Array([1, 2, 3]),
			headers: {
				"Content-Type": "application/octet-stream",
				"X-Shotlyx-Export-Position": "0",
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof writeChunk>[0],
	);
	expect(existsSync(selected.target.filePath)).toBe(true);

	const { POST: abort } = await import("../abort/route");
	const abortResponse = await abort(
		new Request("http://localhost/api/desktop/export/abort", {
			headers: {
				"X-Shotlyx-Export-Target": selected.target.id,
			},
			method: "POST",
		}) as Parameters<typeof abort>[0],
	);
	expect(abortResponse.status).toBe(200);
	expect(existsSync(selected.target.filePath)).toBe(false);
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
