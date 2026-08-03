import { describe, expect, mock, test } from "bun:test";
import type { ToolProgressEvent } from "@/agent/mcp/types";
import { buildWebTools } from "@/agent/tools/web/web-tools";

function requireRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Expected object result");
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
	return value as Record<string, unknown>;
}

describe("web tools", () => {
	test("web_search proxies search requests through the server route", async () => {
		const progressEvents: ToolProgressEvent[] = [];
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/web/search");
			expect(init?.method).toBe("POST");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				query: "latest Remotion docs",
				count: 3,
				provider: "tavily",
			});

			return new Response(
				JSON.stringify({
					provider: "tavily",
					query: "latest Remotion docs",
					results: [
						{
							title: "Remotion Docs",
							url: "https://www.remotion.dev/docs",
							snippet: "Create videos programmatically in React.",
							source: "tavily",
						},
					],
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		const tools = buildWebTools({ deps: { fetchFn: fetchMock } });
		const searchTool = tools.find((tool) => tool.name === "web_search");

		const result = requireRecord(
			await searchTool?.handler(
				{
					query: "latest Remotion docs",
					count: 3,
					provider: "tavily",
				},
				{ onProgress: (event) => progressEvents.push(event) },
			),
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.provider).toBe("tavily");
		expect(Array.isArray(result.results)).toBe(true);
		expect(progressEvents).toEqual([
			expect.objectContaining({
				stage: "searching",
				status: "running",
			}),
		]);
	});

	test("web_fetch proxies page fetch requests through the server route", async () => {
		const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("/api/agent/web/fetch");
			expect(init?.method).toBe("POST");
			expect(JSON.parse(String(init?.body))).toMatchObject({
				url: "https://example.com/article",
				maxCharacters: 1200,
				provider: "jina",
			});

			return new Response(
				JSON.stringify({
					provider: "jina",
					url: "https://example.com/article",
					title: "Example Article",
					content: "Article body",
					truncated: false,
					contentLength: 12,
					fetchedAt: "2026-05-20T00:00:00.000Z",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		});
		const tools = buildWebTools({ deps: { fetchFn: fetchMock } });
		const fetchTool = tools.find((tool) => tool.name === "web_fetch");

		const result = requireRecord(
			await fetchTool?.handler({
				url: "https://example.com/article",
				maxCharacters: 1200,
				provider: "jina",
			}),
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.title).toBe("Example Article");
		expect(result.content).toBe("Article body");
	});
});
