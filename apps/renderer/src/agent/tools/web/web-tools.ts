import type { Tool } from "@/agent/mcp/types";
import {
	optionalBooleanParam,
	optionalNumberParam,
	optionalStringParam,
	requireStringParam,
} from "@/agent/mcp/validation";
import {
	WEB_FETCH_PROVIDERS,
	WEB_SEARCH_PROVIDERS,
	type WebFetchProviderId,
	type WebSearchProviderId,
} from "./types";
import type { WebFetchFn } from "./provider-registry";

export interface WebToolDeps {
	fetchFn: WebFetchFn;
}

export interface BuildWebToolsOptions {
	deps?: Partial<WebToolDeps>;
}

const DEFAULT_SEARCH_COUNT = 5;
const MAX_SEARCH_COUNT = 10;
const DEFAULT_FETCH_MAX_CHARACTERS = 6000;
const MAX_FETCH_MAX_CHARACTERS = 20000;

function optionalEnumValue<T extends string>({
	params,
	key,
	allowed,
}: {
	params: Record<string, unknown>;
	key: string;
	allowed: readonly T[];
}): T | undefined {
	const value = optionalStringParam(params, key);
	if (value === undefined) return undefined;
	const match = allowed.find((item) => item === value);
	if (!match) {
		throw new Error(
			`类型不匹配："${key}" 必须为以下之一：${allowed.join(", ")}`,
		);
	}
	return match;
}

function normalizeCount(value: number | undefined): number {
	const count = value ?? DEFAULT_SEARCH_COUNT;
	if (!Number.isInteger(count) || count < 1 || count > MAX_SEARCH_COUNT) {
		throw new Error(
			`类型不匹配："count" 必须为 1 到 ${MAX_SEARCH_COUNT} 的整数`,
		);
	}
	return count;
}

function normalizeMaxCharacters(value: number | undefined): number {
	const maxCharacters = value ?? DEFAULT_FETCH_MAX_CHARACTERS;
	if (
		!Number.isInteger(maxCharacters) ||
		maxCharacters < 1 ||
		maxCharacters > MAX_FETCH_MAX_CHARACTERS
	) {
		throw new Error(
			`类型不匹配："maxCharacters" 必须为 1 到 ${MAX_FETCH_MAX_CHARACTERS} 的整数`,
		);
	}
	return maxCharacters;
}

async function parseAgentApiError(response: Response): Promise<string> {
	try {
		const data: unknown = await response.json();
		if (
			typeof data === "object" &&
			data !== null &&
			"error" in data &&
			typeof data.error === "string"
		) {
			return data.error;
		}
	} catch {
		// Fall through.
	}
	return `provider_error: web tool request failed with ${response.status}`;
}

export function buildWebTools({ deps }: BuildWebToolsOptions = {}): Tool[] {
	const fetchFn = deps?.fetchFn ?? fetch;

	return [
		{
			name: "web_search",
			description:
				"Search the public web for fresh information, docs, references, news, examples, or facts the editor does not already know. Returns titles, URLs, snippets, and optional answer/images.",
			parameters: {
				query: {
					type: "string",
					description: "Search query. Be specific and include key terms.",
				},
				count: {
					type: "number",
					description: "Number of results to return, from 1 to 10. Default 5.",
					optional: true,
				},
				provider: {
					type: "string",
					description:
						"Optional search provider: local-cli, tavily, firecrawl, or brave. Local Agent mode automatically uses local-cli when a provider key is unavailable.",
					optional: true,
				},
				includeAnswer: {
					type: "boolean",
					description:
						"Whether to request a provider-generated short answer when supported.",
					optional: true,
				},
				includeImages: {
					type: "boolean",
					description:
						"Whether to request query-related images when supported.",
					optional: true,
				},
				includeContent: {
					type: "boolean",
					description:
						"Whether to ask the provider for more page content in search results when supported.",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const query = requireStringParam(params, "query");
				const count = normalizeCount(optionalNumberParam(params, "count"));
				const provider = optionalEnumValue<WebSearchProviderId>({
					params,
					key: "provider",
					allowed: WEB_SEARCH_PROVIDERS,
				});
				const response = await fetchFn("/api/agent/web/search", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						query,
						count,
						provider,
						includeAnswer: optionalBooleanParam(params, "includeAnswer"),
						includeImages: optionalBooleanParam(params, "includeImages"),
						includeContent: optionalBooleanParam(params, "includeContent"),
					}),
					signal: context?.signal,
				});
				if (!response.ok) {
					throw new Error(await parseAgentApiError(response));
				}
				return response.json();
			},
		},
		{
			name: "web_fetch",
			description:
				"Fetch a public web page URL and return LLM-readable markdown/text content. Use this after web_search or when the user provides a URL.",
			parameters: {
				url: {
					type: "string",
					description: "HTTP or HTTPS URL to fetch.",
				},
				maxCharacters: {
					type: "number",
					description:
						"Maximum content characters to return, from 1 to 20000. Default 6000.",
					optional: true,
				},
				provider: {
					type: "string",
					description:
						"Optional fetch provider: jina or firecrawl. Defaults to AGENT_WEB_FETCH_PROVIDER or jina.",
					optional: true,
				},
			},
			// eslint-disable-next-line shotlyx/prefer-object-params
			handler: async (params, context) => {
				const url = requireStringParam(params, "url");
				const maxCharacters = normalizeMaxCharacters(
					optionalNumberParam(params, "maxCharacters"),
				);
				const provider = optionalEnumValue<WebFetchProviderId>({
					params,
					key: "provider",
					allowed: WEB_FETCH_PROVIDERS,
				});
				const response = await fetchFn("/api/agent/web/fetch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						url,
						maxCharacters,
						provider,
					}),
					signal: context?.signal,
				});
				if (!response.ok) {
					throw new Error(await parseAgentApiError(response));
				}
				return response.json();
			},
		},
	];
}
