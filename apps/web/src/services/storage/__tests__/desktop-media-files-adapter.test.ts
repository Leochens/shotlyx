/* eslint-disable shotlyx/prefer-object-params -- Mock fetch intentionally mirrors the native Fetch signature. */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { DesktopMediaFilesAdapter } from "../desktop-media-files-adapter";

const originalFetch = globalThis.fetch;
let fetchCalls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

beforeEach(() => {
	fetchCalls = [];
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mockFetch({
	handler,
}: {
	handler: (request: Request) => Response | Promise<Response>;
}) {
	globalThis.fetch = (async (input, init) => {
		fetchCalls.push({ input, init });
		const request =
			typeof input === "string"
				? new Request(new URL(input, "http://localhost"), init)
				: new Request(input, init);
			return await handler(request);
		}) as typeof fetch;
	}

test("desktop media files adapter writes files to the desktop media library API", async () => {
	mockFetch({
		handler: async (request) => {
		expect(request.method).toBe("POST");
		const url = new URL(request.url);
		expect(url.pathname).toBe("/api/desktop/media-library/files");
		expect(url.searchParams.get("projectId")).toBe("project-a");
		expect(url.searchParams.get("id")).toBe("asset-1");
		expect(url.searchParams.get("name")).toBe("demo clip.mp4");
		expect(await request.text()).toBe("video bytes");
		return Response.json({ ok: true });
		},
	});

	const adapter = new DesktopMediaFilesAdapter({ projectId: "project-a" });
	await adapter.set({
		key: "asset-1",
		value: new File(["video bytes"], "demo clip.mp4", { type: "video/mp4" }),
	});

	expect(fetchCalls).toHaveLength(1);
});

test("desktop media files adapter reads files from the desktop media library API", async () => {
	mockFetch({
		handler: (request) => {
		expect(request.method).toBe("GET");
		expect(request.url).toBe(
			"http://localhost/api/desktop/media-library/files?projectId=project-a&id=asset-1",
		);
		return new Response("video bytes", {
			headers: {
				"Content-Type": "video/mp4",
				"X-Shotlyx-Filename": encodeURIComponent("asset-1--demo.mp4"),
			},
		});
		},
	});

	const adapter = new DesktopMediaFilesAdapter({ projectId: "project-a" });
	const file = await adapter.get("asset-1");

	expect(file).toBeInstanceOf(File);
	expect(file?.name).toBe("asset-1--demo.mp4");
	expect(file?.type).toBe("video/mp4");
	expect(await file?.text()).toBe("video bytes");
});

test("desktop media files adapter treats missing files as null", async () => {
	mockFetch({
		handler: () => Response.json({ error: "not found" }, { status: 404 }),
	});

	const adapter = new DesktopMediaFilesAdapter({ projectId: "project-a" });

	expect(await adapter.get("missing")).toBeNull();
});

test("desktop media files adapter removes one file or clears a project", async () => {
	mockFetch({
		handler: (request) => {
		expect(request.method).toBe("DELETE");
		return Response.json({ ok: true });
		},
	});

	const adapter = new DesktopMediaFilesAdapter({ projectId: "project-a" });
	await adapter.remove("asset-1");
	await adapter.clear();

	expect(
		new Request(
			new URL(String(fetchCalls[0]!.input), "http://localhost"),
			fetchCalls[0]!.init,
		).url,
	).toBe(
		"http://localhost/api/desktop/media-library/files?projectId=project-a&id=asset-1",
	);
	expect(
		new Request(
			new URL(String(fetchCalls[1]!.input), "http://localhost"),
			fetchCalls[1]!.init,
		).url,
	).toBe(
		"http://localhost/api/desktop/media-library/files?projectId=project-a",
	);
});
