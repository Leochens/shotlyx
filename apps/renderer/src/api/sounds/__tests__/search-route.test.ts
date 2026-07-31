import { afterEach, describe, expect, mock, test } from "bun:test";
import { ApiRequest } from "@/platform/http";

const fetchMock = mock(() => {
	throw new Error("Freesound should not be requested for built-in results");
});
const failingFetch: typeof fetch = async () => {
	fetchMock();
	throw new Error("Freesound should not be requested for built-in results");
};

mock.module("@/auth/rate-limit", () => ({
	checkRateLimit: async () => ({ success: true, limited: false }),
}));

mock.module("@/desktop/config/server", () => ({
	getRuntimeEnv: () => ({ FREESOUND_API_KEY: "" }),
}));

mock.module("@/env/web", () => ({
	webEnv: { FREESOUND_API_KEY: "" },
}));

const originalFetch = globalThis.fetch;
const { GET } = await import("@/api/sounds/search/route");

describe("sounds search route", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
		fetchMock.mockClear();
	});

	test("serves the default sound effects view from the built-in library", async () => {
		globalThis.fetch = failingFetch;

		const response = await GET(
			new ApiRequest(
				"http://localhost/api/sounds/search?page_size=50&sort=downloads",
			),
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.results.length).toBeGreaterThan(0);
		expect(data.results[0].id).toBeLessThan(0);
		expect(data.results[0].previewUrl).toStartWith("/api/sounds/builtin?id=");
		expect(data.next).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("returns local matches when Freesound is not configured", async () => {
		globalThis.fetch = failingFetch;

		const response = await GET(
			new ApiRequest(
				"http://localhost/api/sounds/search?q=whoosh&type=effects&page=1",
			),
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.results.length).toBeGreaterThan(0);
		expect(data.results.every((sound: { id: number }) => sound.id < 0)).toBe(
			true,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
