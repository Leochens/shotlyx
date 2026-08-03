import { describe, expect, mock, test } from "bun:test";
import { fetchWebPage, searchWeb } from "@/agent/tools/web/provider-registry";

describe("web provider registry", () => {
	test("falls back to the local Agent when local-cli mode has no search API key", async () => {
		const localCliSearchMock = mock(async () => ({
			provider: "local-cli" as const,
			query: "中国汽车销量",
			results: [
				{
					title: "Authoritative sales report",
					url: "https://example.com/report",
					snippet: "Current sales data.",
					source: "local-cli" as const,
				},
			],
		}));

		const result = await searchWeb({
			input: { query: "中国汽车销量", provider: "tavily" },
			deps: {
				env: {
					AGENT_RUNTIME: "local-cli",
					AGENT_CLI_ID: "codex",
				},
				localCliSearchFn: localCliSearchMock,
			},
		});

		expect(localCliSearchMock).toHaveBeenCalledTimes(1);
		expect(result.provider).toBe("local-cli");
	});

	test("maps Tavily search results into unified web search results", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe("https://api.tavily.com/search");
				expect(init?.method).toBe("POST");
				expect(init?.headers).toEqual({
					Authorization: "Bearer tavily-key",
					"Content-Type": "application/json",
				});
				expect(JSON.parse(String(init?.body))).toMatchObject({
					query: "Shotlyx",
					max_results: 2,
				});

				return new Response(
					JSON.stringify({
						answer: "Shotlyx is a video editing assistant.",
						results: [
							{
								title: "Shotlyx",
								url: "https://github.com/shotlyx/shotlyx",
								content: "Shotlyx is an open source video editor.",
								score: 0.91,
								published_date: "2026-05-01",
							},
						],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		);

		const result = await searchWeb({
			input: {
				query: "Shotlyx",
				count: 2,
				provider: "tavily",
			},
			deps: {
				fetchFn: fetchMock,
				apiKeys: { tavily: "tavily-key" },
			},
		});

		expect(result.provider).toBe("tavily");
		expect(result.answer).toBe("Shotlyx is a video editing assistant.");
		expect(result.results).toEqual([
			{
				title: "Shotlyx",
				url: "https://github.com/shotlyx/shotlyx",
				snippet: "Shotlyx is an open source video editor.",
				publishedDate: "2026-05-01",
				score: 0.91,
				source: "tavily",
			},
		]);
	});

	test("maps Jina Reader output into unified web fetch results", async () => {
		const fetchMock = mock(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				expect(String(input)).toBe(
					"https://r.jina.ai/https://example.com/post",
				);
				expect(init?.headers).toEqual({
					Accept: "text/plain",
					Authorization: "Bearer jina-key",
				});

				return new Response(
					[
						"Title: Example Post",
						"URL Source: https://example.com/post",
						"Markdown Content:",
						"# Example Post",
						"This is a useful page for the agent.",
					].join("\n"),
					{ status: 200, headers: { "Content-Type": "text/plain" } },
				);
			},
		);

		const result = await fetchWebPage({
			input: {
				url: "https://example.com/post",
				maxCharacters: 20,
				provider: "jina",
			},
			deps: {
				fetchFn: fetchMock,
				apiKeys: { jina: "jina-key" },
			},
		});

		expect(result.provider).toBe("jina");
		expect(result.title).toBe("Example Post");
		expect(result.content).toBe("# Example Post\nThis ");
		expect(result.truncated).toBe(true);
		expect(result.contentLength).toBeGreaterThan(result.content.length);
	});
});
