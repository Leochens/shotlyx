import { describe, expect, mock, test } from "bun:test";
import { searchWithLocalCli } from "../local-cli-search";

describe("local CLI web search", () => {
	test("normalizes traceable local Agent search results", async () => {
		const runTextTask = mock(async (options: { enableWebSearch?: boolean }) => {
			expect(options.enableWebSearch).toBe(true);
			return JSON.stringify({
				answer: "销量数据已核验。",
				results: [
					{
						title: "中国汽车工业协会",
						url: "https://example.com/official-sales",
						snippet: "2025 年销量数据。",
						publishedDate: "2026-01-10",
					},
					{
						title: "Invalid local file",
						url: "file:///tmp/result.txt",
					},
				],
			});
		});

		const result = await searchWithLocalCli({
			input: { query: "油车与电车销量", count: 3 },
			env: { AGENT_RUNTIME: "local-cli" },
			runTextTask,
		});

		expect(result).toEqual({
			provider: "local-cli",
			query: "油车与电车销量",
			answer: "销量数据已核验。",
			results: [
				{
					title: "中国汽车工业协会",
					url: "https://example.com/official-sales",
					snippet: "2025 年销量数据。",
					publishedDate: "2026-01-10",
					source: "local-cli",
				},
			],
			message: undefined,
		});
	});

	test("aborts and reports a bounded timeout", async () => {
		const runTextTask = mock(
			async ({ signal }: { signal?: AbortSignal }): Promise<string> =>
				new Promise((_resolve, reject) => {
					signal?.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true },
					);
				}),
		);

		await expect(
			searchWithLocalCli({
				input: { query: "永不结束的搜索" },
				env: { AGENT_RUNTIME: "local-cli" },
				runTextTask,
				timeoutMs: 10,
			}),
		).rejects.toThrow("web search timed out after 10ms");
	});
});
