import { describe, expect, test } from "bun:test";
import { searchMockVideos } from "@/agent/tools/creative/mock-video-provider";

describe("searchMockVideos", () => {
	test("returns matching videos by query", () => {
		const result = searchMockVideos({ query: "ai", count: 5 });
		expect(result.candidates.length).toBeGreaterThan(0);
		expect(result.candidates[0]?.provider).toBe("mock");
		expect(result.candidates[0]?.type).toBe("video");
	});

	test("filters by portrait orientation", () => {
		const result = searchMockVideos({
			query: "phone",
			orientation: "portrait",
			count: 10,
		});
		expect(result.candidates.length).toBeGreaterThan(0);
		expect(
			result.candidates.every(
				(item) =>
					typeof item.width === "number" &&
					typeof item.height === "number" &&
					item.height > item.width,
			),
		).toBe(true);
	});

	test("respects count", () => {
		const result = searchMockVideos({ query: "", count: 2 });
		expect(result.candidates).toHaveLength(2);
	});

	test("returns empty list when count is 0", () => {
		const result = searchMockVideos({ query: "", count: 0 });
		expect(result.candidates).toEqual([]);
	});

	test("returns empty list when durationSeconds is 0", () => {
		const result = searchMockVideos({ query: "", durationSeconds: 0 });
		expect(result.candidates).toEqual([]);
	});

	test("keeps the same id for the same asset across different queries", () => {
		const byExactQuery = searchMockVideos({ query: "phone", count: 1 });
		const byEmptyQuery = searchMockVideos({ query: "", count: 3 });
		const sameAsset = byEmptyQuery.candidates.find(
			(item) => item.title === "Phone vertical product shot",
		);

		expect(byExactQuery.candidates[0]?.id).toBe(sameAsset?.id);
	});

	test("returns empty list when no query matches", () => {
		const result = searchMockVideos({ query: "zzzz-not-found", count: 3 });
		expect(result.candidates).toEqual([]);
	});
});
